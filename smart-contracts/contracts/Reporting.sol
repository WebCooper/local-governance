// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract Reporting is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant AUTHORITY_ROLE = keccak256("AUTHORITY_ROLE");

    // The 7 states of our civic issue lifecycle
    enum ReportStatus {
        Pending_Validation,       // 0
        Community_Rejected,       // 1
        Open,                     // 2
        Pending_Rejection_Review, // 3
        Pending_Verification,     // 4
        Closed,                   // 5
        Reopened                  // 6
    }

    enum VotingPhase {
        Validation,
        Rejection_Review,
        Verification
    }

    struct Report {
        uint256 id;
        string ipfsCID;
        bytes32 submissionNullifier;
        ReportStatus status;
        uint256 createdAt;
        address actionedBy;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 reopenCount;     // Tracks number of times report was reopened (prevents infinite loops)
        uint256 expiresAt;       // Timestamp when report expires due to stalling (7 days default)
    }

    uint256 public nextReportId;
    mapping(uint256 => Report) public reports;
    mapping(bytes32 => bool) public submissionNullifiers;
    
    // Sybil resistance: reportId => votingPhase => votingNullifier => hasVoted
    mapping(uint256 => mapping(VotingPhase => mapping(bytes32 => bool))) public reportVotes;
    
    // Sentinel value used to indicate automatic status transitions triggered by community voting.
    // When changedBy == address(0), the transition was driven by threshold votes, not manual authority action.
    address public constant AUTOMATIC_TRANSITION = address(0); 

    // Hardcoded thresholds for the community consensus (can be made dynamic later)
    uint256 public constant VALIDATION_THRESHOLD = 3;
    uint256 public constant REJECTION_THRESHOLD = 3;
    uint256 public constant VERIFICATION_THRESHOLD = 3;
    uint256 public constant REOPEN_THRESHOLD = 3;
    uint256 public constant APPEAL_THRESHOLD = 3;
    uint256 public constant UPHOLD_REJECTION_THRESHOLD = 3;
    
    // Workflow protection constants
    uint256 public constant REOPEN_LIMIT = 3;              // Maximum number of times a report can be reopened
    uint256 public constant EXPIRATION_TIMEOUT = 7 days;   // Reports expire after 7 days of stalling

    event ReportCreated(uint256 indexed reportId, string ipfsCID, uint256 timestamp);
    
    /// @dev Emitted when a report's status changes.
    ///      If changedBy == address(0) (AUTOMATIC_TRANSITION), the change was triggered by community voting reaching a threshold.
    ///      Otherwise, changedBy is the authority address that manually triggered the transition.
    event StatusChanged(uint256 indexed reportId, ReportStatus oldStatus, ReportStatus newStatus, address indexed changedBy);
    
    event VoteCast(uint256 indexed reportId, bool voteDirection, ReportStatus currentStatus);

    constructor(address _relayer, address _govNode, address _ngoNode, address _intlNode) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // The deployer is admin
        _grantRole(RELAYER_ROLE, _relayer);         // NestJS Backend Wallet
        _grantRole(AUTHORITY_ROLE, _govNode);       // Local Governance Node
        _grantRole(AUTHORITY_ROLE, _ngoNode);       // NGO Node
        _grantRole(AUTHORITY_ROLE, _intlNode);      // International Node
    }

    // --------------------------------------------------------
    // CITIZEN ACTION (Submitted via Relayer to pay gas)
    // --------------------------------------------------------
    function createReport(string memory _ipfsCID, bytes32 _submissionNullifier) external onlyRole(RELAYER_ROLE) {
        require(!submissionNullifiers[_submissionNullifier], "Report already submitted by this citizen");

        submissionNullifiers[_submissionNullifier] = true;
        uint256 reportId = nextReportId++;
        
        reports[reportId] = Report({
            id: reportId,
            ipfsCID: _ipfsCID,
            submissionNullifier: _submissionNullifier,
            status: ReportStatus.Pending_Validation,
            createdAt: block.timestamp,
            actionedBy: address(0),
            votesFor: 0,
            votesAgainst: 0,
            reopenCount: 0,
            expiresAt: block.timestamp + EXPIRATION_TIMEOUT
        });

        emit ReportCreated(reportId, _ipfsCID, block.timestamp);
    }

    function voteOnReport(uint256 _reportId, bool _voteDirection, bytes32 _votingNullifier, VotingPhase _phase) external onlyRole(RELAYER_ROLE) {
        require(!reportVotes[_reportId][_phase][_votingNullifier], "Citizen already voted in this phase");
        
        Report storage report = reports[_reportId];
        
        require(reports[_reportId].createdAt != 0, "Report does not exist");
        require(block.timestamp <= report.expiresAt, "Report has expired - no further voting allowed");
        
        if (_phase == VotingPhase.Validation) {
            require(report.status == ReportStatus.Pending_Validation, "Not in validation phase");
            _processValidationVote(report, _voteDirection);
        } else if (_phase == VotingPhase.Rejection_Review) {
            require(report.status == ReportStatus.Pending_Rejection_Review, "Not in rejection review phase");
            _processRejectionReviewVote(report, _voteDirection);
        } else if (_phase == VotingPhase.Verification) {
            require(report.status == ReportStatus.Pending_Verification, "Not in verification phase");
            _processVerificationVote(report, _voteDirection);
        } else {
            revert("Invalid voting phase");
        }

        reportVotes[_reportId][_phase][_votingNullifier] = true;
        emit VoteCast(_reportId, _voteDirection, report.status);
    }

    // --------------------------------------------------------
    // AUTHORITY ACTIONS
    // --------------------------------------------------------
    function markAsSolved(uint256 _reportId) external onlyRole(AUTHORITY_ROLE) {
        Report storage report = reports[_reportId];
        require(report.status == ReportStatus.Open || report.status == ReportStatus.Reopened, "Invalid state to mark as solved");

        ReportStatus oldStatus = report.status;
        report.status = ReportStatus.Pending_Verification;
        report.actionedBy = msg.sender;
        report.votesFor = 0;      // Reset counters for the community verification phase
        report.votesAgainst = 0;

        emit StatusChanged(_reportId, oldStatus, ReportStatus.Pending_Verification, msg.sender);
    }

    function rejectIssue(uint256 _reportId) external onlyRole(AUTHORITY_ROLE) {
        Report storage report = reports[_reportId];
        require(report.status == ReportStatus.Open, "Invalid state to reject");

        ReportStatus oldStatus = report.status;
        report.status = ReportStatus.Pending_Rejection_Review;
        report.actionedBy = msg.sender;
        report.votesFor = 0;      // Reset counters for the community appeal phase
        report.votesAgainst = 0;

        emit StatusChanged(_reportId, oldStatus, ReportStatus.Pending_Rejection_Review, msg.sender);
    }

    // --------------------------------------------------------
    // INTERNAL STATE MACHINE LOGIC
    // --------------------------------------------------------
    
    /// @dev Internal function to handle automatic status transitions driven by voting thresholds.
    ///      This function is called from the voting logic when accumulated votes reach the required threshold.
    ///      It always emits with changedBy = address(0) to indicate an automatic/community-driven transition.
    function _changeStatus(Report storage report, ReportStatus newStatus) internal {
        ReportStatus oldStatus = report.status;
        report.status = newStatus;
        emit StatusChanged(report.id, oldStatus, newStatus, AUTOMATIC_TRANSITION);
    }
    
    function _processValidationVote(Report storage report, bool _voteDirection) internal {
        if (_voteDirection) { // True = Valid Issue
            report.votesFor++;
            if (report.votesFor >= VALIDATION_THRESHOLD) _changeStatus(report, ReportStatus.Open);
        } else {              // False = Spam/Fake
            report.votesAgainst++;
            if (report.votesAgainst >= REJECTION_THRESHOLD) _changeStatus(report, ReportStatus.Community_Rejected);
        }
    }

    function _processRejectionReviewVote(Report storage report, bool _voteDirection) internal {
        if (_voteDirection) { // True = Uphold authority's rejection
            report.votesFor++;
            if (report.votesFor >= UPHOLD_REJECTION_THRESHOLD) _changeStatus(report, ReportStatus.Closed);
        } else {              // False = Appeal / Overturn the authority
            report.votesAgainst++;
            if (report.votesAgainst >= APPEAL_THRESHOLD) _changeStatus(report, ReportStatus.Open);
        }
    }

    function _processVerificationVote(Report storage report, bool _voteDirection) internal {
        if (_voteDirection) { // True = Yes, the authority actually fixed it
            report.votesFor++;
            if (report.votesFor >= VERIFICATION_THRESHOLD) _changeStatus(report, ReportStatus.Closed);
        } else {              // False = No, they lied or did a poor job
            report.votesAgainst++;
            if (report.votesAgainst >= REOPEN_THRESHOLD) {
                // Increment reopenCount first
                report.reopenCount++;
                
                // Check if reopen limit has been reached
                if (report.reopenCount >= REOPEN_LIMIT) {
                    // Force closure after reaching maximum reopens to prevent infinite loops
                    _changeStatus(report, ReportStatus.Closed);
                } else {
                    // Allow reopening since we haven't hit the limit yet
                    _changeStatus(report, ReportStatus.Reopened);
                }
            }
        }
    }
}