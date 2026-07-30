// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EmergencyReporting
 * @notice Dedicated smart contract for Civic Emergency Reports in AuraChain.
 *         Emergency reports bypass standard community triage voting and open immediately
 *         in 'Open' status so authorities can respond rapidly.
 *         Includes a 30-day penalty box for citizens who submit false alarms.
 */
contract EmergencyReporting is Ownable, ReentrancyGuard {
    // ─── Enums ───────────────────────────────────────────────────────────────

    enum EmergencyStatus {
        Open,
        InProgress,
        Resolved,
        Reclassified
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    struct EmergencyReport {
        uint256 id;
        string ipfsCid;
        bytes32 reportHash;
        bytes32 submissionNullifier;
        bytes32 citizenPseudonym; // keccak256(citizenPubKey + domainSalt)
        address submittedByRelayer;
        EmergencyStatus status;
        uint256 createdAt;
        uint256 updatedAt;
        address assignedAuthority;
        // Latest authority update (comment + image) for quick display
        string authorityComment;
        string authorityImageCid;
        bool isReclassified;
    }

    struct AuthorityAction {
        address authority;
        EmergencyStatus stage;
        string comment;
        string imageCid;
        uint256 timestamp;
    }

    // ─── State Variables ─────────────────────────────────────────────────────

    uint256 public reportCount;

    // Primary store: reportId → EmergencyReport
    mapping(uint256 => EmergencyReport) public reports;

    // Index: citizenPseudonym → list of reportIds submitted by that citizen
    mapping(bytes32 => uint256[]) private reportsByCitizen;

    // Penalty box for false emergency reports: citizenPseudonym -> unlock timestamp
    mapping(bytes32 => uint256) public emergencyPenaltyBox;

    // Full authority action history per report
    mapping(uint256 => AuthorityAction[]) public reportActions;

    // Replay-attack guards
    mapping(bytes32 => bool) public usedSubmissionNullifiers;

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
    error InvalidPagination();
    error EmergencyReportingLocked();

    // ─── Events ───────────────────────────────────────────────────────────────

    event EmergencyReportSubmitted(
        uint256 indexed reportId,
        string ipfsCid,
        bytes32 indexed reportHash,
        bytes32 indexed submissionNullifier,
        bytes32 citizenPseudonym,
        uint256 timestamp
    );
    event EmergencyStatusChanged(
        uint256 indexed reportId,
        EmergencyStatus previousStatus,
        EmergencyStatus newStatus,
        uint256 timestamp
    );
    event EmergencyWorkStarted(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );
    event EmergencyResolved(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );
    event EmergencyReclassified(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        uint256 penaltyUntil,
        uint256 timestamp
    );
    event AuthorityUpdatePosted(
        uint256 indexed reportId,
        address indexed authority,
        string comment,
        string imageCid,
        uint256 timestamp
    );

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyRelayer() {
        if (!authorizedRelayers[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyAuthority() {
        if (!authorizedAuthorities[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyAuthorityOrRelayer() {
        if (!authorizedAuthorities[msg.sender] && !authorizedRelayers[msg.sender])
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

    // ─── Core Functions ───────────────────────────────────────────────────────

    /**
     * @notice Submit a new emergency civic report on behalf of an authenticated citizen.
     *         Emergency reports bypass community voting and open immediately in 'Open' state.
     */
    function submitEmergencyReport(
        string calldata ipfsCid,
        bytes32 reportHash,
        bytes32 submissionNullifier,
        bytes32 citizenPseudonym
    ) external onlyRelayer nonReentrant returns (uint256 reportId) {
        if (bytes(ipfsCid).length == 0) revert EmptyCID();
        if (reportHash == bytes32(0)) revert InvalidHash();
        if (submissionNullifier == bytes32(0)) revert InvalidNullifier();
        if (citizenPseudonym == bytes32(0)) revert InvalidPseudonym();

        if (block.timestamp <= emergencyPenaltyBox[citizenPseudonym]) {
            revert EmergencyReportingLocked();
        }

        if (usedSubmissionNullifiers[submissionNullifier])
            revert NullifierAlreadyUsed();

        usedSubmissionNullifiers[submissionNullifier] = true;

        reportCount++;
        reportId = reportCount;

        EmergencyReport storage report = reports[reportId];
        report.id = reportId;
        report.ipfsCid = ipfsCid;
        report.reportHash = reportHash;
        report.submissionNullifier = submissionNullifier;
        report.citizenPseudonym = citizenPseudonym;
        report.submittedByRelayer = msg.sender;
        report.status = EmergencyStatus.Open;
        report.createdAt = block.timestamp;
        report.updatedAt = block.timestamp;
        report.isReclassified = false;

        reportsByCitizen[citizenPseudonym].push(reportId);

        emit EmergencyReportSubmitted(
            reportId,
            ipfsCid,
            reportHash,
            submissionNullifier,
            citizenPseudonym,
            block.timestamp
        );
    }

    /**
     * @notice Reclassifies an emergency report as a false alarm / non-emergency
     *         and places the citizen pseudonym in a 30-day penalty box.
     */
    function reclassifyEmergency(
        uint256 reportId,
        string calldata comment
    ) external onlyAuthorityOrRelayer {
        EmergencyReport storage report = reports[reportId];
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        if (report.status == EmergencyStatus.Reclassified) revert InvalidState();

        EmergencyStatus previousStatus = report.status;
        report.status = EmergencyStatus.Reclassified;
        report.isReclassified = true;
        report.updatedAt = block.timestamp;
        report.authorityComment = comment;

        uint256 penaltyUntil = block.timestamp + 30 days;
        emergencyPenaltyBox[report.citizenPseudonym] = penaltyUntil;

        reportActions[reportId].push(
            AuthorityAction({
                authority: msg.sender,
                stage: EmergencyStatus.Reclassified,
                comment: comment,
                imageCid: "",
                timestamp: block.timestamp
            })
        );

        emit EmergencyStatusChanged(reportId, previousStatus, EmergencyStatus.Reclassified, block.timestamp);
        emit EmergencyReclassified(reportId, msg.sender, comment, penaltyUntil, block.timestamp);
    }

    // ─── Authority Action Functions ───────────────────────────────────────────

    function startWork(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthorityOrRelayer nonReentrant {
        EmergencyReport storage report = reports[reportId];
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        if (report.status != EmergencyStatus.Open) revert InvalidState();

        if (report.assignedAuthority == address(0) || authorizedAuthorities[msg.sender]) {
            report.assignedAuthority = msg.sender;
        }

        EmergencyStatus previousStatus = report.status;
        report.status = EmergencyStatus.InProgress;
        report.updatedAt = block.timestamp;
        report.authorityComment = comment;
        report.authorityImageCid = imageCid;

        reportActions[reportId].push(
            AuthorityAction({
                authority: msg.sender,
                stage: EmergencyStatus.InProgress,
                comment: comment,
                imageCid: imageCid,
                timestamp: block.timestamp
            })
        );

        emit EmergencyStatusChanged(reportId, previousStatus, EmergencyStatus.InProgress, block.timestamp);
        emit EmergencyWorkStarted(reportId, msg.sender, comment, imageCid, block.timestamp);
    }

    function resolveEmergency(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthorityOrRelayer nonReentrant {
        EmergencyReport storage report = reports[reportId];
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        if (report.status != EmergencyStatus.InProgress && report.status != EmergencyStatus.Open)
            revert InvalidState();

        EmergencyStatus previousStatus = report.status;
        report.status = EmergencyStatus.Resolved;
        report.updatedAt = block.timestamp;
        report.authorityComment = comment;
        report.authorityImageCid = imageCid;

        reportActions[reportId].push(
            AuthorityAction({
                authority: msg.sender,
                stage: EmergencyStatus.Resolved,
                comment: comment,
                imageCid: imageCid,
                timestamp: block.timestamp
            })
        );

        emit EmergencyStatusChanged(reportId, previousStatus, EmergencyStatus.Resolved, block.timestamp);
        emit EmergencyResolved(reportId, msg.sender, comment, imageCid, block.timestamp);
    }

    function addAuthorityUpdate(
        uint256 reportId,
        string calldata comment,
        string calldata imageCid
    ) external onlyAuthority nonReentrant {
        EmergencyReport storage report = reports[reportId];
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        if (report.status != EmergencyStatus.InProgress) revert InvalidState();
        if (report.assignedAuthority != msg.sender && report.assignedAuthority != address(0))
            revert Unauthorized();

        report.authorityComment = comment;
        report.authorityImageCid = imageCid;

        reportActions[reportId].push(
            AuthorityAction({
                authority: msg.sender,
                stage: EmergencyStatus.InProgress,
                comment: comment,
                imageCid: imageCid,
                timestamp: block.timestamp
            })
        );

        emit AuthorityUpdatePosted(reportId, msg.sender, comment, imageCid, block.timestamp);
    }

    // ─── Query / View Functions ───────────────────────────────────────────────

    function getReport(uint256 reportId) external view returns (EmergencyReport memory) {
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        return reports[reportId];
    }

    function getReportActions(
        uint256 reportId
    ) external view returns (AuthorityAction[] memory) {
        if (reportId == 0 || reportId > reportCount) revert InvalidReportId();
        return reportActions[reportId];
    }

    function getAllReports(
        uint256 offset,
        uint256 limit
    ) external view returns (EmergencyReport[] memory page, uint256 total) {
        if (limit == 0 || limit > 100) revert InvalidPagination();

        total = reportCount;
        if (total == 0 || offset >= total) {
            return (new EmergencyReport[](0), total);
        }

        uint256 available = total - offset;
        uint256 count = available < limit ? available : limit;

        page = new EmergencyReport[](count);
        uint256 startId = total - offset;
        for (uint256 i = 0; i < count; i++) {
            page[i] = reports[startId - i];
        }
    }

    function getReportIdsByCitizen(
        bytes32 citizenPseudonym
    ) external view returns (uint256[] memory ids) {
        return reportsByCitizen[citizenPseudonym];
    }

    function getReportsByCitizen(
        bytes32 citizenPseudonym,
        uint256 offset,
        uint256 limit
    ) external view returns (EmergencyReport[] memory page, uint256 total) {
        if (limit == 0 || limit > 100) revert InvalidPagination();

        uint256[] storage ids = reportsByCitizen[citizenPseudonym];
        total = ids.length;

        if (total == 0 || offset >= total) {
            return (new EmergencyReport[](0), total);
        }

        uint256 available = total - offset;
        uint256 count = available < limit ? available : limit;

        page = new EmergencyReport[](count);
        uint256 startIdx = total - 1 - offset;
        for (uint256 i = 0; i < count; i++) {
            page[i] = reports[ids[startIdx - i]];
        }
    }

    function getReportCountByCitizen(
        bytes32 citizenPseudonym
    ) external view returns (uint256) {
        return reportsByCitizen[citizenPseudonym].length;
    }
}
