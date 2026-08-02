// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAuthorityMultiSig {
    function isSuperAdmin(address account) external view returns (bool);
}

contract Reporting is Ownable, ReentrancyGuard {
    // ─── Enums ───────────────────────────────────────────────────────────────

    enum ReportStatus {
        PendingValidation,
        CommunityRejected,
        Open,
        InProgress,
        PendingRejectionReview,
        PendingVerification,
        Closed,
        Reopened
    }

    enum VotingMethod { Majority51, SuperMajority66, Threshold, Hybrid }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct VoteCounters {
        uint256 validationUpvotes;
        uint256 validationDownvotes;
        uint256 verificationAcceptVotes;
        uint256 verificationRejectVotes;
        uint256 rejectionUpholdVotes;
        uint256 rejectionAppealVotes;
    }

    struct Report {
        uint256 id;
        string ipfsCid;
        bytes32 reportHash;
        bytes32 submissionNullifier;
        bytes32 citizenPseudonym; // keccak256(citizenPubKey + domainSalt) — derived off-chain by relayer
        address submittedByRelayer;
        ReportStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 phaseDeadline;
        address assignedAuthority;
        VoteCounters votes;
        // Latest authority update (comment + image) for quick display
        string authorityComment;
        string authorityImageCid;
        // Revote management
        bool isRevotable;
        uint8 revoteCount;
    }

    /**
     * @notice Records each action taken by an authority on a report.
     *         Stored in reportActions[reportId] as a append-only history log.
     */
    struct AuthorityAction {
        address authority;
        ReportStatus stage;       // Status the report was in when this action was taken
        string comment;           // Free-text note from the authority
        string imageCid;          // IPFS CID of any attached image (empty string if none)
        uint256 timestamp;
    }

    // ─── State Variables ─────────────────────────────────────────────────────

    uint256 public reportCount;
    uint256 public votingWindowDuration = 6 hours;

    // Configurable voting strategy
    VotingMethod public currentVotingMethod = VotingMethod.Majority51;
    uint256 public minVotesRequired = 0;
    VotingMethod[2] public hybridMethods;

    // Primary store: reportId → Report
    mapping(uint256 => Report) public reports;

    // Index: citizenPseudonym → list of reportIds submitted by that citizen
    mapping(bytes32 => uint256[]) private reportsByCitizen;

    // Full authority action history per report
    mapping(uint256 => AuthorityAction[]) public reportActions;

    // Replay-attack guards
    mapping(bytes32 => bool) public usedSubmissionNullifiers;
    // Validation nullifiers keyed by (reportId, revoteCycle, nullifier) to prevent cross-cycle collisions
    mapping(uint256 => mapping(uint8 => mapping(bytes32 => bool)))
        public usedValidationVoteNullifiers;
    mapping(uint256 => mapping(bytes32 => bool))
        public usedVerificationVoteNullifiers;
    mapping(uint256 => mapping(bytes32 => bool))
        public usedRejectionReviewVoteNullifiers;

    // Citizen-pseudonym vote guards: validation uses cycle dimension
    mapping(uint256 => mapping(uint8 => mapping(bytes32 => bool))) public hasVotedValidation;
    mapping(uint256 => mapping(bytes32 => bool)) public hasVotedVerification;
    mapping(uint256 => mapping(bytes32 => bool)) public hasVotedRejectionReview;

    mapping(address => bool) public authorizedRelayers;
    mapping(address => bool) public authorizedAuthorities;
    address[] public authoritiesList;

    // ─── Custom Errors ────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidReportId();
    error InvalidState();
    error EmptyCID();
    error InvalidHash();
    error NullifierAlreadyUsed();
    error CitizenAlreadyVoted();
    error InvalidNullifier();
    error InvalidPseudonym();
    error VotingWindowStillOpen();
    error VotingWindowClosed();
    error InvalidPagination();
    error MaxRevotesReached();

    // ─── Events ───────────────────────────────────────────────────────────────

    event ReportSubmitted(
        uint256 indexed reportId,
        string ipfsCid,
        bytes32 indexed reportHash,
        bytes32 indexed submissionNullifier,
        bytes32 citizenPseudonym,
        uint256 timestamp
    );
    event ValidationVoteCast(
        uint256 indexed reportId,
        bytes32 indexed voteNullifier,
        bool support,
        uint256 upvotes,
        uint256 downvotes
    );
    event ReportStatusChanged(
        uint256 indexed reportId,
        ReportStatus previousStatus,
        ReportStatus newStatus,
        uint256 timestamp
    );
    event VotingWindowFinalized(
        uint256 indexed reportId,
        ReportStatus previousStatus,
        ReportStatus newStatus,
        uint256 timestamp
    );
    event WorkStarted(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );
    event ReportMarkedSolved(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );
    event ReportRejectedByAuthority(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );
    event AuthorityUpdatePosted(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );
    event VerificationVoteCast(
        uint256 indexed reportId,
        bytes32 indexed voteNullifier,
        bool accept,
        uint256 acceptVotes,
        uint256 rejectVotes
    );
    event RejectionReviewVoteCast(
        uint256 indexed reportId,
        bytes32 indexed voteNullifier,
        bool uphold,
        uint256 upholdVotes,
        uint256 appealVotes
    );
    event VotingConfigUpdated(
        VotingMethod indexed method,
        uint256 minVotes,
        VotingMethod h1,
        VotingMethod h2
    );
    event ValidationRevoteTriggered(uint256 indexed reportId, uint8 newCycle);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    function _isAuthorizedAuthority(address caller) internal view returns (bool) {
        if (caller == owner()) return true;
        if (authorizedAuthorities[caller]) return true;
        if (owner() != address(0) && owner().code.length > 0) {
            try IAuthorityMultiSig(owner()).isSuperAdmin(caller) returns (bool isAdmin) {
                if (isAdmin) return true;
            } catch {}
        }
        return false;
    }

    modifier onlyRelayer() {
        if (!authorizedRelayers[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyAuthority() {
        if (!_isAuthorizedAuthority(msg.sender)) revert Unauthorized();
        _;
    }

    modifier onlyAuthorityOrRelayer() {
        if (!_isAuthorizedAuthority(msg.sender) && !authorizedRelayers[msg.sender])
            revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {
        // Hardcoded relayer
        authorizedRelayers[0x3253678aF33758255f6d97069d9102597AFFf92c] = true;

        // Hardcoded authority
        address initialAuthority = 0xEE8670A4d50cdcf0afE7C99bF9a45976BaF576c2;
        authorizedAuthorities[initialAuthority] = true;
        authoritiesList.push(initialAuthority);

        // Initial Super Admins automatically authorized as authorities
        address[4] memory initialSuperAdmins = [
            0x416109618A1f1A89C7Fd156be62b5fc734745340,
            0x22c3488E96fccE1077365309A92e6BD895a00AAf,
            0xA7Fe174054755c27c870772f47E52081c4b250b5,
            0xda90b18Df16955Da5352C21D00d3ac4CDb52125b
        ];
        for (uint256 i = 0; i < initialSuperAdmins.length; i++) {
            authorizedAuthorities[initialSuperAdmins[i]] = true;
            authoritiesList.push(initialSuperAdmins[i]);
        }
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    function setRelayer(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
    }

    function setAuthority(
        address authority,
        bool authorized
    ) external onlyOwner {
        if (authorized && !authorizedAuthorities[authority]) {
            authorizedAuthorities[authority] = true;
            authoritiesList.push(authority);
        } else if (!authorized && authorizedAuthorities[authority]) {
            authorizedAuthorities[authority] = false;
            // Remove from array
            for (uint256 i = 0; i < authoritiesList.length; i++) {
                if (authoritiesList[i] == authority) {
                    authoritiesList[i] = authoritiesList[
                        authoritiesList.length - 1
                    ];
                    authoritiesList.pop();
                    break;
                }
            }
        }
    }

    function getAuthorities() external view returns (address[] memory) {
        return authoritiesList;
    }

    function setVotingWindowDuration(uint256 duration) external onlyOwner {
        votingWindowDuration = duration;
    }

    /**
     * @notice Configure the global voting strategy applied to all phases.
     * @param method  VotingMethod enum index (0=Majority51, 1=SuperMajority66, 2=Threshold, 3=Hybrid).
     * @param minVotes Minimum total votes required (only used by Threshold and Hybrid with Threshold sub-method).
     * @param h1      First hybrid sub-method enum index.
     * @param h2      Second hybrid sub-method enum index.
     * @dev   Hybrid sub-methods cannot themselves be Hybrid to prevent unbounded recursion.
     */
    function setVotingConfig(
        uint8 method,
        uint256 minVotes,
        uint8 h1,
        uint8 h2
    ) external onlyOwner {
        require(method <= uint8(type(VotingMethod).max), "Invalid voting method");
        require(h1 <= uint8(type(VotingMethod).max), "Invalid hybrid method h1");
        require(h2 <= uint8(type(VotingMethod).max), "Invalid hybrid method h2");
        // Guard: Hybrid sub-methods cannot themselves be Hybrid (prevents infinite recursion)
        require(h1 != uint8(VotingMethod.Hybrid), "h1 cannot be Hybrid");
        require(h2 != uint8(VotingMethod.Hybrid), "h2 cannot be Hybrid");

        currentVotingMethod = VotingMethod(method);
        minVotesRequired = minVotes;
        hybridMethods[0] = VotingMethod(h1);
        hybridMethods[1] = VotingMethod(h2);

        emit VotingConfigUpdated(currentVotingMethod, minVotes, hybridMethods[0], hybridMethods[1]);
    }

    // ─── Core Functions ───────────────────────────────────────────────────────

    /**
     * @notice Submit a new civic report on behalf of an authenticated citizen.
     *
     * @param ipfsCid            IPFS content identifier for any attached media.
     * @param reportHash         solidityPackedKeccak256(description, zkpTicketId, imageHashes)
     *                           — commits to the full report payload; verified off-chain
     *                           against the citizen's signature before this call is made.
     * @param submissionNullifier The zkpTicketId — single-use government-issued ticket hash.
     *                            Stored and checked to prevent replay attacks.
     * @param citizenPseudonym   keccak256(abi.encodePacked(citizenAddress, DOMAIN_SALT))
     *                           — computed by the relayer from the verified citizenPubKey.
     *                           Unlinkable to the raw address on-chain, but deterministic,
     *                           so the same citizen always maps to the same pseudonym and
     *                           can query their own reports.
     */
    function submitReport(
        string calldata ipfsCid,
        bytes32 reportHash,
        bytes32 submissionNullifier,
        bytes32 citizenPseudonym
    ) external onlyRelayer nonReentrant returns (uint256 reportId) {
        // ── Input validation ──────────────────────────────────────────────────

        if (bytes(ipfsCid).length == 0) revert EmptyCID();
        if (reportHash == bytes32(0)) revert InvalidHash();
        if (submissionNullifier == bytes32(0)) revert InvalidNullifier();
        if (citizenPseudonym == bytes32(0)) revert InvalidPseudonym();

        // Nullifier must not have been used before (replay attack prevention)
        if (usedSubmissionNullifiers[submissionNullifier])
            revert NullifierAlreadyUsed();

        // ── Consume nullifier before state changes (CEI pattern) ──────────────
        usedSubmissionNullifiers[submissionNullifier] = true;

        // ── Assign report ID ──────────────────────────────────────────────────
        reportCount++;
        reportId = reportCount;

        // ── Write report to storage ───────────────────────────────────────────
        Report storage report = reports[reportId];

        report.id = reportId;
        report.ipfsCid = ipfsCid;
        report.reportHash = reportHash;
        report.submissionNullifier = submissionNullifier;
        report.citizenPseudonym = citizenPseudonym;
        report.submittedByRelayer = msg.sender;
        report.status = ReportStatus.PendingValidation;
        report.createdAt = block.timestamp;
        report.updatedAt = block.timestamp;

        // ── Open the validation voting window ─────────────────────────────────
        report.phaseDeadline = block.timestamp + votingWindowDuration;

        // ── Update citizen index ───────────────────────────────────────────────
        reportsByCitizen[citizenPseudonym].push(reportId);

        // ── Emit event ────────────────────────────────────────────────────────
        emit ReportSubmitted(
            reportId,
            ipfsCid,
            reportHash,
            submissionNullifier,
            citizenPseudonym,
            block.timestamp
        );
    }


    // ─── Internal State Transition Helper ────────────────────────────────────

    function _changeStatus(uint256 reportId, ReportStatus newStatus) internal {
        Report storage report = reports[reportId];

        ReportStatus previousStatus = report.status;

        report.status = newStatus;
        report.updatedAt = block.timestamp;

        // Clear phaseDeadline when entering a non-voting state
        if (
            newStatus == ReportStatus.Open ||
            newStatus == ReportStatus.InProgress ||
            newStatus == ReportStatus.Closed ||
            newStatus == ReportStatus.CommunityRejected ||
            newStatus == ReportStatus.Reopened
        ) {
            report.phaseDeadline = 0;
        }

        emit ReportStatusChanged(
            reportId,
            previousStatus,
            newStatus,
            block.timestamp
        );
    }

    /**
     * @dev Records an authority action log entry and updates the report's
     *      latest comment and image CID fields.
     */
    function _recordAuthorityAction(
        uint256 reportId,
        ReportStatus stage,
        string memory comment,
        string memory imageCid
    ) internal {
        Report storage report = reports[reportId];
        report.authorityComment = comment;
        report.authorityImageCid = imageCid;

        reportActions[reportId].push(AuthorityAction({
            authority: msg.sender,
            stage: stage,
            comment: comment,
            imageCid: imageCid,
            timestamp: block.timestamp
        }));
    }

    // ─── Query / View Functions ───────────────────────────────────────────────

    /**
     * @notice Fetch a single report by its on-chain ID.
     * @param reportId  The sequential report ID (1-indexed).
     */
    function getReport(uint256 reportId) external view returns (Report memory) {
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        return reports[reportId];
    }

    /**
     * @notice Fetch the full authority action history for a report.
     * @param reportId  The sequential report ID (1-indexed).
     */
    function getReportActions(uint256 reportId)
        external
        view
        returns (AuthorityAction[] memory)
    {
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        return reportActions[reportId];
    }

    /**
     * @notice Fetch a paginated slice of ALL reports, newest first.
     *
     * @dev    Reports are stored with IDs 1..reportCount. We iterate from
     *         `reportCount` down so the caller always gets the most recent
     *         submissions first — consistent with typical feed UX.
     *
     * @param offset  Number of reports to skip from the newest end (0 = start from latest).
     * @param limit   Maximum number of reports to return. Capped at 100 to bound gas.
     *
     * @return page   Array of Report structs (length ≤ limit).
     * @return total  Total report count — lets the caller compute page count client-side.
     */
    function getAllReports(
        uint256 offset,
        uint256 limit
    ) external view returns (Report[] memory page, uint256 total) {
        if (limit == 0 || limit > 100) revert InvalidPagination();

        total = reportCount;

        // Nothing stored yet, or offset past the end
        if (total == 0 || offset >= total) {
            return (new Report[](0), total);
        }

        // How many items are actually available from this offset?
        uint256 available = total - offset;
        uint256 count = available < limit ? available : limit;

        page = new Report[](count);

        // Newest-first: start from (reportCount - offset) down to 1
        uint256 startId = total - offset; // e.g. total=54, offset=0 → startId=54
        for (uint256 i = 0; i < count; i++) {
            page[i] = reports[startId - i];
        }
    }

    /**
     * @notice Fetch all report IDs ever submitted by a given citizen pseudonym.
     *
     * @dev    Returns the raw ID array. Callers can then call getReport(id) for
     *         each ID, or pass the slice to getAllReportsByIds() for a bulk fetch.
     *         Sorted ascending (oldest first) because that's insertion order.
     *
     * @param citizenPseudonym  keccak256(abi.encodePacked(citizenAddress, DOMAIN_SALT))
     *                          Compute this the same way the relayer does before calling.
     *
     * @return ids  Array of report IDs belonging to this pseudonym.
     */
    function getReportIdsByCitizen(
        bytes32 citizenPseudonym
    ) external view returns (uint256[] memory ids) {
        return reportsByCitizen[citizenPseudonym];
    }

    /**
     * @notice Fetch paginated reports for a specific citizen pseudonym, newest first.
     *
     * @param citizenPseudonym  The pseudonym to query.
     * @param offset            Number of the citizen's reports to skip (0 = latest).
     * @param limit             Max reports to return. Capped at 100.
     *
     * @return page   Array of Report structs.
     * @return total  Total reports ever submitted by this citizen.
     */
    function getReportsByCitizen(
        bytes32 citizenPseudonym,
        uint256 offset,
        uint256 limit
    ) external view returns (Report[] memory page, uint256 total) {
        if (limit == 0 || limit > 100) revert InvalidPagination();

        uint256[] storage ids = reportsByCitizen[citizenPseudonym];
        total = ids.length;

        if (total == 0 || offset >= total) {
            return (new Report[](0), total);
        }

        uint256 available = total - offset;
        uint256 count = available < limit ? available : limit;

        page = new Report[](count);

        // Newest-first: walk the ids array from the tail
        uint256 startIdx = total - 1 - offset; // last index minus offset
        for (uint256 i = 0; i < count; i++) {
            page[i] = reports[ids[startIdx - i]];
        }
    }

    /**
     * @notice Bulk-fetch a specific list of report IDs in one call.
     *
     * @dev    Useful after getReportIdsByCitizen() when you want to fetch a
     *         hand-picked subset (e.g. only open reports from the ID list).
     *         Reverts if any ID in the list is out of range.
     *
     * @param ids  Array of report IDs to fetch.
     * @return     Array of Report structs in the same order as `ids`.
     */
    function getReportsByIds(
        uint256[] calldata ids
    ) external view returns (Report[] memory) {
        Report[] memory result = new Report[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == 0 || ids[i] > reportCount) revert InvalidReportId();
            result[i] = reports[ids[i]];
        }
        return result;
    }

    /**
     * @notice How many reports has a given citizen pseudonym ever submitted?
     * @param citizenPseudonym  The pseudonym to look up.
     */
    function getReportCountByCitizen(
        bytes32 citizenPseudonym
    ) external view returns (uint256) {
        return reportsByCitizen[citizenPseudonym].length;
    }

    /**
     * @notice Cast a vote on a newly created report.
     * If the vote arrives after the deadline, it performs lazy evaluation to finalize the report instead.
     */
    function castValidationVote(
        uint256 reportId,
        bytes32 voteNullifier,
        bool support,
        bytes32 citizenPseudonym
    ) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];

        // Ensure the report is currently in the validation phase
        if (report.status != ReportStatus.PendingValidation)
            revert InvalidState();

        // ─── LAZY EVALUATION ──────────────────────────────────────────────────
        // If the window has expired, do NOT count the vote.
        // Instead, use this transaction to finalize the voting window.
        if (block.timestamp > report.phaseDeadline) {
            _finalizeSingleReport(reportId, report);
            return; // Exit early so the vote is not counted
        }

        // ─── NORMAL VOTING LOGIC ──────────────────────────────────────────────
        // Use revoteCount as the cycle dimension to allow fresh nullifiers per revote cycle
        uint8 cycle = report.revoteCount;
        if (usedValidationVoteNullifiers[reportId][cycle][voteNullifier])
            revert NullifierAlreadyUsed();
        if (hasVotedValidation[reportId][cycle][citizenPseudonym])
            revert CitizenAlreadyVoted();

        usedValidationVoteNullifiers[reportId][cycle][voteNullifier] = true;
        hasVotedValidation[reportId][cycle][citizenPseudonym] = true;

        if (support) {
            report.votes.validationUpvotes++;
        } else {
            report.votes.validationDownvotes++;
        }

        emit ValidationVoteCast(
            reportId,
            voteNullifier,
            support,
            report.votes.validationUpvotes,
            report.votes.validationDownvotes
        );
    }

    /**
     * @notice Triggers a new validation vote cycle for a community-rejected report.
     *         Only callable when the rejection was due to a quorum failure (isRevotable == true).
     *         Capped at 3 total revote cycles.
     * @param reportId  The ID of the rejected report to revote on.
     */
    function triggerRevote(uint256 reportId) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];

        if (report.status != ReportStatus.CommunityRejected) revert InvalidState();
        if (!report.isRevotable) revert InvalidState();
        if (report.revoteCount >= 3) revert MaxRevotesReached();

        report.revoteCount++;
        report.isRevotable = false;

        // Reset validation counters for the new cycle
        report.votes.validationUpvotes = 0;
        report.votes.validationDownvotes = 0;

        // Re-open validation window
        report.status = ReportStatus.PendingValidation;
        report.phaseDeadline = block.timestamp + votingWindowDuration;
        report.updatedAt = block.timestamp;

        emit ValidationRevoteTriggered(reportId, report.revoteCount);
    }

    function castVerificationVote(
        uint256 reportId,
        bytes32 voteNullifier,
        bool accept,
        bytes32 citizenPseudonym
    ) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];

        if (report.status != ReportStatus.PendingVerification)
            revert InvalidState();

        // ─── LAZY EVALUATION ───
        if (block.timestamp > report.phaseDeadline) {
            _finalizeSingleReport(reportId, report);
            return;
        }

        if (usedVerificationVoteNullifiers[reportId][voteNullifier])
            revert NullifierAlreadyUsed();
        if (hasVotedVerification[reportId][citizenPseudonym])
            revert CitizenAlreadyVoted();

        usedVerificationVoteNullifiers[reportId][voteNullifier] = true;
        hasVotedVerification[reportId][citizenPseudonym] = true;

        if (accept) {
            report.votes.verificationAcceptVotes++;
        } else {
            report.votes.verificationRejectVotes++;
        }

        emit VerificationVoteCast(
            reportId,
            voteNullifier,
            accept,
            report.votes.verificationAcceptVotes,
            report.votes.verificationRejectVotes
        );
    }

    function castRejectionReviewVote(
        uint256 reportId,
        bytes32 voteNullifier,
        bool uphold,
        bytes32 citizenPseudonym
    ) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];

        if (report.status != ReportStatus.PendingRejectionReview)
            revert InvalidState();

        // ─── LAZY EVALUATION ───
        if (block.timestamp > report.phaseDeadline) {
            _finalizeSingleReport(reportId, report);
            return;
        }

        if (usedRejectionReviewVoteNullifiers[reportId][voteNullifier])
            revert NullifierAlreadyUsed();
        if (hasVotedRejectionReview[reportId][citizenPseudonym])
            revert CitizenAlreadyVoted();

        usedRejectionReviewVoteNullifiers[reportId][voteNullifier] = true;
        hasVotedRejectionReview[reportId][citizenPseudonym] = true;

        if (uphold) {
            report.votes.rejectionUpholdVotes++;
        } else {
            report.votes.rejectionAppealVotes++;
        }

        emit RejectionReviewVoteCast(
            reportId,
            voteNullifier,
            uphold,
            report.votes.rejectionUpholdVotes,
            report.votes.rejectionAppealVotes
        );
    }

    // ─── Finalization & Cron Job ──────────────────────────────────────────────

    /**
     * @notice Allows the backend cron job to finalize multiple expired reports in one transaction.
     */
    function batchFinalizeVotingWindows(uint256[] calldata reportIds) external {
        for (uint256 i = 0; i < reportIds.length; i++) {
            uint256 reportId = reportIds[i];
            Report storage report = reports[reportId];

            // Only finalize if the window is closed and it is currently in a voting state
            if (
                report.phaseDeadline > 0 &&
                block.timestamp > report.phaseDeadline &&
                (report.status == ReportStatus.PendingValidation ||
                    report.status == ReportStatus.PendingVerification ||
                    report.status == ReportStatus.PendingRejectionReview)
            ) {
                _finalizeSingleReport(reportId, report);
            }
        }
    }

    function finalizeVotingWindow(uint256 reportId) external nonReentrant {
        Report storage report = reports[reportId];
        if (report.phaseDeadline == 0) revert InvalidState();
        if (block.timestamp <= report.phaseDeadline)
            revert VotingWindowStillOpen();

        _finalizeSingleReport(reportId, report);
    }

    /**
     * @dev Internal logic extracted to support both single (lazy) and batch finalization.
     *      Uses _evaluateVote for configurable strategy dispatch.
     *      Validation phase sets isRevotable when quorum fails and cap not reached.
     *      Verification and RejectionReview phases fall back to tie-break on quorum failure.
     */
    function _finalizeSingleReport(
        uint256 reportId,
        Report storage report
    ) internal {
        ReportStatus previousStatus = report.status;
        ReportStatus newStatus;

        if (previousStatus == ReportStatus.PendingValidation) {
            (bool passed, bool quorumFailed) = _evaluateVote(
                report.votes.validationUpvotes,
                report.votes.validationDownvotes,
                currentVotingMethod
            );

            if (passed) {
                newStatus = ReportStatus.Open;
                report.isRevotable = false;
            } else {
                newStatus = ReportStatus.CommunityRejected;
                // Allow revote only when rejection was due to quorum failure and cap not reached
                report.isRevotable = quorumFailed && report.revoteCount < 3;
            }
        } else if (previousStatus == ReportStatus.PendingVerification) {
            (bool passed, bool quorumFailed) = _evaluateVote(
                report.votes.verificationAcceptVotes,
                report.votes.verificationRejectVotes,
                currentVotingMethod
            );

            // Verification ignores quorum failure — fall back to tie-break
            if (!passed && quorumFailed) {
                passed = report.votes.verificationAcceptVotes >= report.votes.verificationRejectVotes;
            }
            newStatus = passed ? ReportStatus.Closed : ReportStatus.Reopened;
        } else if (previousStatus == ReportStatus.PendingRejectionReview) {
            (bool passed, bool quorumFailed) = _evaluateVote(
                report.votes.rejectionUpholdVotes,
                report.votes.rejectionAppealVotes,
                currentVotingMethod
            );

            // Rejection Review ignores quorum failure — fall back to tie-break
            if (!passed && quorumFailed) {
                passed = report.votes.rejectionUpholdVotes >= report.votes.rejectionAppealVotes;
            }
            newStatus = passed ? ReportStatus.Closed : ReportStatus.Reopened;
        } else {
            return; // Not in a resolvable state, gracefully exit
        }

        _changeStatus(reportId, newStatus);
        emit VotingWindowFinalized(
            reportId,
            previousStatus,
            newStatus,
            block.timestamp
        );
    }

    /**
     * @dev Core voting evaluation logic dispatched by the configured VotingMethod.
     * @param positive  Votes in favour (upvotes / acceptVotes / upholdVotes).
     * @param negative  Votes against (downvotes / rejectVotes / appealVotes).
     * @param method    The VotingMethod to apply.
     * @return passed       True if the positive side wins under the given method.
     * @return quorumFailed True if a hard quorum was required but not met.
     */
    function _evaluateVote(
        uint256 positive,
        uint256 negative,
        VotingMethod method
    ) internal view returns (bool passed, bool quorumFailed) {
        uint256 total = positive + negative;

        if (method == VotingMethod.Majority51) {
            // Simple majority — no hard quorum
            passed = positive > negative;
            quorumFailed = false;
        } else if (method == VotingMethod.SuperMajority66) {
            // At least 2/3 of total votes must be positive
            passed = total > 0 && (positive * 3 >= total * 2);
            quorumFailed = false;
        } else if (method == VotingMethod.Threshold) {
            if (total < minVotesRequired) {
                quorumFailed = true;
                passed = false;
            } else {
                passed = positive > negative;
                quorumFailed = false;
            }
        } else {
            // Hybrid: both sub-methods must pass; either quorum failure propagates
            // Sub-methods are guaranteed non-Hybrid by setVotingConfig guards
            (bool p1, bool q1) = _evaluateVote(positive, negative, hybridMethods[0]);
            (bool p2, bool q2) = _evaluateVote(positive, negative, hybridMethods[1]);
            passed = p1 && p2;
            quorumFailed = q1 || q2;
        }
    }

    // ─── Authority Action Functions ───────────────────────────────────────────

    /**
     * @notice Authority claims a report and starts work on it.
     * @param reportId   The report to start working on.
     * @param comment    A free-text note from the authority (can be empty).
     * @param imageCid   IPFS CID of an optional evidence/progress image (can be empty).
     */
    function startWork(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthorityOrRelayer nonReentrant {
        Report storage report = reports[reportId];
        if (
            report.status != ReportStatus.Open &&
            report.status != ReportStatus.Reopened
        ) revert InvalidState();

        if (report.assignedAuthority == address(0) || authorizedAuthorities[msg.sender]) {
            report.assignedAuthority = msg.sender;
        }
        _changeStatus(reportId, ReportStatus.InProgress);
        _recordAuthorityAction(reportId, ReportStatus.InProgress, comment, imageCid);

        emit WorkStarted(reportId, msg.sender, comment, imageCid, block.timestamp);
    }

    /**
     * @notice Authority marks the report as solved and opens the community verification window.
     * @param reportId   The in-progress report.
     * @param comment    A free-text note describing what was done (can be empty).
     * @param imageCid   IPFS CID of completion evidence image (can be empty).
     */
    function markAsSolved(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthorityOrRelayer nonReentrant {
        Report storage report = reports[reportId];
        if (report.status != ReportStatus.InProgress) revert InvalidState();
        if (
            !authorizedRelayers[msg.sender] &&
            report.assignedAuthority != msg.sender
        ) revert Unauthorized();

        _changeStatus(reportId, ReportStatus.PendingVerification);
        report.phaseDeadline = block.timestamp + votingWindowDuration;
        _recordAuthorityAction(reportId, ReportStatus.PendingVerification, comment, imageCid);

        emit ReportMarkedSolved(reportId, msg.sender, comment, imageCid, block.timestamp);
    }

    /**
     * @notice Authority rejects the issue and opens the community appeal window.
     * @param reportId   The report to reject.
     * @param comment    A free-text note explaining the rejection (can be empty).
     * @param imageCid   IPFS CID of any supporting image (can be empty).
     */
    function rejectIssue(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthorityOrRelayer nonReentrant {
        Report storage report = reports[reportId];
        if (
            report.status != ReportStatus.Open &&
            report.status != ReportStatus.Reopened &&
            report.status != ReportStatus.InProgress
        ) revert InvalidState();

        if (
            report.status == ReportStatus.InProgress &&
            !authorizedRelayers[msg.sender] &&
            report.assignedAuthority != msg.sender
        ) {
            revert Unauthorized();
        }

        _changeStatus(reportId, ReportStatus.PendingRejectionReview);
        report.phaseDeadline = block.timestamp + votingWindowDuration;
        _recordAuthorityAction(reportId, ReportStatus.PendingRejectionReview, comment, imageCid);

        emit ReportRejectedByAuthority(reportId, msg.sender, comment, imageCid, block.timestamp);
    }

    /**
     * @notice Post a comment and/or image update on an assigned report without
     *         changing its status. Useful for mid-work progress updates.
     *
     * @dev    Only the currently assigned authority may call this. The report
     *         must be InProgress. The action is appended to the history log.
     *
     * @param reportId   The in-progress report.
     * @param comment    Progress note (can be empty if only an image is posted).
     * @param imageCid   IPFS CID of a progress image (can be empty if only a comment is posted).
     */
    function addAuthorityUpdate(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthority nonReentrant {
        Report storage report = reports[reportId];
        if (report.status != ReportStatus.InProgress) revert InvalidState();
        if (report.assignedAuthority != msg.sender) revert Unauthorized();

        _recordAuthorityAction(reportId, ReportStatus.InProgress, comment, imageCid);

        emit AuthorityUpdatePosted(reportId, msg.sender, comment, imageCid, block.timestamp);
    }
}
