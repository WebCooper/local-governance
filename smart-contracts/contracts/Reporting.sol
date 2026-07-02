// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
        bytes32 citizenPseudonym;      // keccak256(citizenPubKey + domainSalt) — derived off-chain by relayer
        address submittedByRelayer;
        ReportStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 phaseDeadline;
        address assignedAuthority;
        VoteCounters votes; 
    }

    // ─── State Variables ─────────────────────────────────────────────────────

    uint256 public reportCount;
    uint256 public votingWindowDuration = 12 hours;

    // Primary store: reportId → Report
    mapping(uint256 => Report) public reports;

    // Index: citizenPseudonym → list of reportIds submitted by that citizen
    mapping(bytes32 => uint256[]) private reportsByCitizen;

    // Replay-attack guards
    mapping(bytes32 => bool) public usedSubmissionNullifiers;
    mapping(uint256 => mapping(bytes32 => bool)) public usedValidationVoteNullifiers;
    mapping(uint256 => mapping(bytes32 => bool)) public usedVerificationVoteNullifiers;
    mapping(uint256 => mapping(bytes32 => bool)) public usedRejectionReviewVoteNullifiers;

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
    error InvalidNullifier();
    error InvalidPseudonym();
    error VotingWindowStillOpen();
    error VotingWindowClosed();
    error InvalidPagination();

    // ─── Events ───────────────────────────────────────────────────────────────

    event ReportSubmitted(
        uint256 indexed reportId,
        string ipfsCid,
        bytes32 indexed reportHash,
        bytes32 indexed submissionNullifier,
        bytes32 citizenPseudonym,
        uint256 timestamp
    );
    event ValidationVoteCast(uint256 indexed reportId, bytes32 indexed voteNullifier, bool support, uint256 upvotes, uint256 downvotes);
    event ReportStatusChanged(uint256 indexed reportId, ReportStatus previousStatus, ReportStatus newStatus, uint256 timestamp);
    event VotingWindowFinalized(uint256 indexed reportId, ReportStatus previousStatus, ReportStatus newStatus, uint256 timestamp);
    event WorkStarted(uint256 indexed reportId, address indexed authority, uint256 timestamp);
    event ReportMarkedSolved(uint256 indexed reportId, address indexed authority, uint256 timestamp);
    event ReportRejectedByAuthority(uint256 indexed reportId, address indexed authority, uint256 timestamp);
    event VerificationVoteCast(uint256 indexed reportId,bytes32 indexed voteNullifier, bool accept, uint256 acceptVotes, uint256 rejectVotes); 
    event RejectionReviewVoteCast(uint256 indexed reportId, bytes32 indexed voteNullifier, bool uphold, uint256 upholdVotes, uint256 appealVotes);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyRelayer() {
        if (!authorizedRelayers[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyAuthority() {
        if (!authorizedAuthorities[msg.sender]) revert Unauthorized();
        _;
    }

    constructor() Ownable(msg.sender) {
        // Hardcoded relayer
        authorizedRelayers[0x3253678aF33758255f6d97069d9102597AFFf92c] = true;

        // Hardcoded authority
        address initialAuthority = 0xEE8670A4d50cdcf0afE7C99bF9a45976BaF576c2;
        authorizedAuthorities[initialAuthority] = true;
        authoritiesList.push(initialAuthority);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    function setRelayer(address relayer, bool authorized) external onlyOwner {
        authorizedRelayers[relayer] = authorized;
    }

    function setAuthority(address authority, bool authorized) external onlyOwner {
        if (authorized && !authorizedAuthorities[authority]) {
            authorizedAuthorities[authority] = true;
            authoritiesList.push(authority);
        } else if (!authorized && authorizedAuthorities[authority]) {
            authorizedAuthorities[authority] = false;
            // Remove from array
            for (uint256 i = 0; i < authoritiesList.length; i++) {
                if (authoritiesList[i] == authority) {
                    authoritiesList[i] = authoritiesList[authoritiesList.length - 1];
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

        if (bytes(ipfsCid).length == 0)    revert EmptyCID();
        if (reportHash == bytes32(0))       revert InvalidHash();
        if (submissionNullifier == bytes32(0)) revert InvalidNullifier();
        if (citizenPseudonym == bytes32(0)) revert InvalidPseudonym();

        // Nullifier must not have been used before (replay attack prevention)
        if (usedSubmissionNullifiers[submissionNullifier]) revert NullifierAlreadyUsed();

        // ── Consume nullifier before state changes (CEI pattern) ──────────────
        usedSubmissionNullifiers[submissionNullifier] = true;

        // ── Assign report ID ──────────────────────────────────────────────────
        reportCount++;
        reportId = reportCount;

        // ── Write report to storage ───────────────────────────────────────────
        Report storage report = reports[reportId];

        report.id                  = reportId;
        report.ipfsCid             = ipfsCid;
        report.reportHash          = reportHash;
        report.submissionNullifier = submissionNullifier;
        report.citizenPseudonym    = citizenPseudonym;
        report.submittedByRelayer  = msg.sender;
        report.status              = ReportStatus.PendingValidation;
        report.createdAt           = block.timestamp;
        report.updatedAt           = block.timestamp;

        // ── Open the validation voting window ─────────────────────────────────
        report.phaseDeadline = block.timestamp + votingWindowDuration;

        // ── Update citizen index ───────────────────────────────────────────────
        reportsByCitizen[citizenPseudonym].push(reportId);

        // ── Emit event ────────────────────────────────────────────────────────
        emit ReportSubmitted(reportId, ipfsCid, reportHash, submissionNullifier, citizenPseudonym, block.timestamp);
    }

    // ─── Internal State Transition Helper ────────────────────────────────────

    function _changeStatus(
        uint256 reportId,
        ReportStatus newStatus
    ) internal {
        Report storage report = reports[reportId];

        ReportStatus previousStatus = report.status;

        report.status    = newStatus;
        report.updatedAt = block.timestamp;

        // Clear phaseDeadline when entering a non-voting state
        if (
            newStatus == ReportStatus.Open              ||
            newStatus == ReportStatus.InProgress        ||
            newStatus == ReportStatus.Closed            ||
            newStatus == ReportStatus.CommunityRejected ||
            newStatus == ReportStatus.Reopened
        ) {
            report.phaseDeadline = 0;
        }

        emit ReportStatusChanged(reportId, previousStatus, newStatus, block.timestamp);
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
        uint256 count     = available < limit ? available : limit;

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
        uint256 count     = available < limit ? available : limit;

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
    function castValidationVote(uint256 reportId, bytes32 voteNullifier, bool support) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];
        
        // Ensure the report is currently in the validation phase
        if (report.status != ReportStatus.PendingValidation) revert InvalidState();

        // ─── LAZY EVALUATION ──────────────────────────────────────────────────
        // If the window has expired, do NOT count the vote. 
        // Instead, use this transaction to finalize the voting window.
        if (block.timestamp > report.phaseDeadline) {
            _finalizeSingleReport(reportId, report);
            return; // Exit early so the vote is not counted
        }

        // ─── NORMAL VOTING LOGIC ──────────────────────────────────────────────
        if (usedValidationVoteNullifiers[reportId][voteNullifier]) revert NullifierAlreadyUsed();
        usedValidationVoteNullifiers[reportId][voteNullifier] = true;

        if (support) {
            report.votes.validationUpvotes++;
        } else {
            report.votes.validationDownvotes++;
        }

        emit ValidationVoteCast(reportId, voteNullifier, support, report.votes.validationUpvotes, report.votes.validationDownvotes);
    }

    function castVerificationVote(uint256 reportId, bytes32 voteNullifier, bool accept) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];
        
        if (report.status != ReportStatus.PendingVerification) revert InvalidState();

        // ─── LAZY EVALUATION ───
        if (block.timestamp > report.phaseDeadline) {
            _finalizeSingleReport(reportId, report);
            return;
        }

        if (usedVerificationVoteNullifiers[reportId][voteNullifier]) revert NullifierAlreadyUsed();
        usedVerificationVoteNullifiers[reportId][voteNullifier] = true;

        if (accept) {
            report.votes.verificationAcceptVotes++;
        } else {
            report.votes.verificationRejectVotes++;
        }

        emit VerificationVoteCast(reportId, voteNullifier, accept, report.votes.verificationAcceptVotes, report.votes.verificationRejectVotes);
    }

    function castRejectionReviewVote(uint256 reportId, bytes32 voteNullifier, bool uphold) external onlyRelayer nonReentrant {
        Report storage report = reports[reportId];
        
        if (report.status != ReportStatus.PendingRejectionReview) revert InvalidState();

        // ─── LAZY EVALUATION ───
        if (block.timestamp > report.phaseDeadline) {
            _finalizeSingleReport(reportId, report);
            return;
        }

        if (usedRejectionReviewVoteNullifiers[reportId][voteNullifier]) revert NullifierAlreadyUsed();
        usedRejectionReviewVoteNullifiers[reportId][voteNullifier] = true;

        if (uphold) {
            report.votes.rejectionUpholdVotes++;
        } else {
            report.votes.rejectionAppealVotes++;
        }

        emit RejectionReviewVoteCast(reportId, voteNullifier, uphold, report.votes.rejectionUpholdVotes, report.votes.rejectionAppealVotes);
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
                (
                    report.status == ReportStatus.PendingValidation || 
                    report.status == ReportStatus.PendingVerification || 
                    report.status == ReportStatus.PendingRejectionReview
                )
            ) {
                _finalizeSingleReport(reportId, report);
            }
        }
    }

    function finalizeVotingWindow(uint256 reportId) external nonReentrant {
        Report storage report = reports[reportId];
        if (report.phaseDeadline == 0) revert InvalidState();
        if (block.timestamp <= report.phaseDeadline) revert VotingWindowStillOpen();
        
        _finalizeSingleReport(reportId, report);
    }

    /**
     * @dev Internal logic extracted to support both single (lazy) and batch finalization.
     */
    function _finalizeSingleReport(uint256 reportId, Report storage report) internal {
        ReportStatus previousStatus = report.status;
        ReportStatus newStatus;

        if (previousStatus == ReportStatus.PendingValidation) {
            newStatus = report.votes.validationUpvotes > report.votes.validationDownvotes 
                ? ReportStatus.Open 
                : ReportStatus.CommunityRejected;
        } else if (previousStatus == ReportStatus.PendingVerification) {
            newStatus = report.votes.verificationAcceptVotes >= report.votes.verificationRejectVotes 
                ? ReportStatus.Closed 
                : ReportStatus.Reopened;
        } else if (previousStatus == ReportStatus.PendingRejectionReview) {
            newStatus = report.votes.rejectionUpholdVotes >= report.votes.rejectionAppealVotes 
                ? ReportStatus.Closed 
                : ReportStatus.Reopened;
        } else {
            return; // Not in a resolvable state, gracefully exit
        }

        _changeStatus(reportId, newStatus);
        emit VotingWindowFinalized(reportId, previousStatus, newStatus, block.timestamp);
    }

    function startWork(uint256 reportId) external onlyAuthority nonReentrant {
        Report storage report = reports[reportId];
        if (report.status != ReportStatus.Open && report.status != ReportStatus.Reopened) revert InvalidState();
        
        report.assignedAuthority = msg.sender;
        _changeStatus(reportId, ReportStatus.InProgress);
        
        emit WorkStarted(reportId, msg.sender, block.timestamp);
    }

    function markAsSolved(uint256 reportId) external onlyAuthority nonReentrant {
        Report storage report = reports[reportId];
        if (report.status != ReportStatus.InProgress) revert InvalidState();
        if (report.assignedAuthority != msg.sender) revert Unauthorized();
        
        _changeStatus(reportId, ReportStatus.PendingVerification);
        report.phaseDeadline = block.timestamp + votingWindowDuration;
        
        emit ReportMarkedSolved(reportId, msg.sender, block.timestamp);
    }

    function rejectIssue(uint256 reportId) external onlyAuthority nonReentrant {
        Report storage report = reports[reportId];
        if (
            report.status != ReportStatus.Open && 
            report.status != ReportStatus.Reopened && 
            report.status != ReportStatus.InProgress
        ) revert InvalidState();
        
        if (report.status == ReportStatus.InProgress && report.assignedAuthority != msg.sender) {
            revert Unauthorized();
        }
        
        _changeStatus(reportId, ReportStatus.PendingRejectionReview);
        report.phaseDeadline = block.timestamp + votingWindowDuration;
        
        emit ReportRejectedByAuthority(reportId, msg.sender, block.timestamp);
    }
}
