// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReporting {
    function setAuthority(address authority, bool authorized) external;
    function transferOwnership(address newOwner) external;
}

/**
 * @title AuthorityMultiSig
 * @notice Two-tier governance contract for the local governance reporting system.
 *
 * Role Hierarchy:
 *   - Super Admins : A small fixed group (e.g. 3 department heads) who govern the system.
 *                   They vote on proposals to add/remove other Super Admins and Authority Workers.
 *   - Authority Workers : Government staff who act on submitted reports in Reporting.sol
 *                         (startWork, markAsSolved, rejectIssue). Their access is granted
 *                         and revoked exclusively through Super Admin multi-sig proposals.
 *
 * Quorum: majority of current Super Admin count (superAdminCount / 2 + 1).
 * Proposals auto-execute once quorum is reached.
 */
contract AuthorityMultiSig {
    // ─── Enums ───────────────────────────────────────────────────────────────

    /**
     * @notice The four governance actions Super Admins can propose.
     * AddAuthority / RemoveAuthority manage Authority Worker access in Reporting.sol.
     */
    enum ActionType {
        AddSuperAdmin,
        RemoveSuperAdmin,
        AddAuthority,    // Grants an Authority Worker access to act on reports
        RemoveAuthority  // Revokes an Authority Worker's access
    }

    // ─── Structs ─────────────────────────────────────────────────────────────
    struct Proposal {
        uint256 id;
        address target;
        ActionType actionType;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 deadline;
        bool executed;
    }

    struct VoteInfo {
        bool hasVoted;
        bool support; // true for yes, false for no
        uint8 changes;
    }

    // ─── State Variables ─────────────────────────────────────────────────────

    // Kept for ABI compatibility but actual quorum is dynamic: (superAdminCount / 2) + 1
    uint256 public constant REQUIRED_APPROVALS = 2;

    mapping(address => bool) public isSuperAdmin;
    address[] public superAdminsList;
    uint256 public superAdminCount;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteInfo)) public voteInfo;

    IReporting public reportingContract;

    // ─── Events ───────────────────────────────────────────────────────────────
    event ProposalSubmitted(uint256 indexed proposalId, address indexed target, ActionType actionType, address indexed proposer);
    event VoteCast(uint256 indexed proposalId, address indexed voter);
    event ProposalExecuted(uint256 indexed proposalId, address indexed target, ActionType actionType);
    event ReportingContractUpdated(address indexed newContract);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlySuperAdmin() {
        require(isSuperAdmin[msg.sender], "Not a Super Admin");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param initialSuperAdmins Array of wallet addresses for the initial Super Admins.
     *        These are collected from government officers who create their own MetaMask wallets
     *        and share their public address before deployment.
     * @param _reportingContract Address of the deployed Reporting.sol contract.
     *        Reporting.sol ownership must be transferred to this contract after deployment
     *        so that only multi-sig approved proposals can add/remove Authority Workers.
     */
    constructor(address[] memory initialSuperAdmins, address _reportingContract) {
        require(initialSuperAdmins.length > 0, "Must have at least 1 super admin");
        
        for (uint256 i = 0; i < initialSuperAdmins.length; i++) {
            address admin = initialSuperAdmins[i];
            require(admin != address(0), "Invalid admin address");
            require(!isSuperAdmin[admin], "Duplicate admin");
            
            isSuperAdmin[admin] = true;
            superAdminsList.push(admin);
            superAdminCount++;
        }
        
        if (_reportingContract != address(0)) {
            reportingContract = IReporting(_reportingContract);
        }
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────
    function setReportingContract(address _reportingContract) external onlySuperAdmin {
        reportingContract = IReporting(_reportingContract);
        emit ReportingContractUpdated(_reportingContract);
    }

    // ─── Core Functions ───────────────────────────────────────────────────────
    
    /**
     * @notice Submit a new proposal to add/remove a Super Admin or Authority Worker.
     * @param target The address to apply the action to.
     * @param actionType The type of action:
     *        0 = AddSuperAdmin, 1 = RemoveSuperAdmin,
     *        2 = AddAuthority (grant report actions), 3 = RemoveAuthority (revoke report actions).
     * @param durationInDays Number of days until the proposal expires.
     * @dev The proposer automatically casts a YES vote upon submission.
     *      The proposal executes immediately if quorum is reached (useful when there is only 1 super admin).
     */
    function submitProposal(address target, ActionType actionType, uint256 durationInDays) external onlySuperAdmin returns (uint256) {
        require(target != address(0), "Invalid target address");
        require(durationInDays > 0, "Duration must be > 0");
        
        // Logical checks before creating proposal
        if (actionType == ActionType.AddSuperAdmin) {
            require(!isSuperAdmin[target], "Already a super admin");
        } else if (actionType == ActionType.RemoveSuperAdmin) {
            require(isSuperAdmin[target], "Not a super admin");
            require(superAdminCount > 1, "Cannot remove last super admin");
        }
        
        proposalCount++;
        uint256 proposalId = proposalCount;
        
        proposals[proposalId] = Proposal({
            id: proposalId,
            target: target,
            actionType: actionType,
            yesVotes: 0,
            noVotes: 0,
            deadline: block.timestamp + (durationInDays * 1 days),
            executed: false
        });
        
        emit ProposalSubmitted(proposalId, target, actionType, msg.sender);
        
        // Automatically cast a yes vote for the proposer
        vote(proposalId, true);
        
        return proposalId;
    }

    /**
     * @notice Vote on a proposal.
     * @param proposalId The ID of the proposal to vote on.
     * @param support True for Yes, False for No.
     */
    function vote(uint256 proposalId, bool support) public onlySuperAdmin {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id == proposalId, "Proposal does not exist");
        require(!proposal.executed, "Proposal already executed");
        require(block.timestamp <= proposal.deadline, "Proposal expired");
        
        VoteInfo storage info = voteInfo[proposalId][msg.sender];
        
        if (!info.hasVoted) {
            info.hasVoted = true;
            info.support = support;
            if (support) {
                proposal.yesVotes++;
            } else {
                proposal.noVotes++;
            }
        } else {
            require(info.support != support, "Already cast this vote");
            require(info.changes < 3, "Max vote changes reached");
            
            info.changes++;
            info.support = support;
            
            if (support) {
                proposal.noVotes--;
                proposal.yesVotes++;
            } else {
                proposal.yesVotes--;
                proposal.noVotes++;
            }
        }
        
        emit VoteCast(proposalId, msg.sender);
        
        // Execute automatically if majority reached
        uint256 requiredVotes = (superAdminCount / 2) + 1;
        if (proposal.yesVotes >= requiredVotes) {
            executeProposal(proposalId);
        }
    }

    /**
     * @notice Execute a proposal once it reaches the required majority.
     * @param proposalId The ID of the proposal.
     */
    function executeProposal(uint256 proposalId) public {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id == proposalId, "Proposal does not exist");
        require(!proposal.executed, "Proposal already executed");
        
        uint256 requiredVotes = (superAdminCount / 2) + 1;
        require(proposal.yesVotes >= requiredVotes, "Not enough yes votes");
        
        proposal.executed = true;
        
        if (proposal.actionType == ActionType.AddSuperAdmin) {
            if (!isSuperAdmin[proposal.target]) {
                isSuperAdmin[proposal.target] = true;
                superAdminsList.push(proposal.target);
                superAdminCount++;
            }
        } else if (proposal.actionType == ActionType.RemoveSuperAdmin) {
            if (isSuperAdmin[proposal.target]) {
                isSuperAdmin[proposal.target] = false;
                
                // Remove from array
                for (uint256 i = 0; i < superAdminsList.length; i++) {
                    if (superAdminsList[i] == proposal.target) {
                        superAdminsList[i] = superAdminsList[superAdminsList.length - 1];
                        superAdminsList.pop();
                        break;
                    }
                }
                
                superAdminCount--;
            }
        } else if (proposal.actionType == ActionType.AddAuthority) {
            require(address(reportingContract) != address(0), "Reporting contract not set");
            reportingContract.setAuthority(proposal.target, true);
        } else if (proposal.actionType == ActionType.RemoveAuthority) {
            require(address(reportingContract) != address(0), "Reporting contract not set");
            reportingContract.setAuthority(proposal.target, false);
        }
        
        emit ProposalExecuted(proposalId, proposal.target, proposal.actionType);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Returns all current Super Admin addresses.
     */
    function getSuperAdmins() external view returns (address[] memory) {
        return superAdminsList;
    }

    /**
     * @notice Returns the full details of a single proposal by ID.
     * @param proposalId The 1-indexed proposal ID.
     */
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposalId > 0 && proposalId <= proposalCount, "Proposal does not exist");
        return proposals[proposalId];
    }

    /**
     * @notice Returns how a specific Super Admin voted on a proposal.
     * @param proposalId The proposal ID.
     * @param voter The Super Admin address.
     * @return hasVoted Whether the voter has cast a vote.
     * @return support True if they voted YES, false if NO.
     * @return changes How many times they changed their vote (max 3).
     */
    function getProposalVote(uint256 proposalId, address voter)
        external
        view
        returns (bool hasVoted, bool support, uint8 changes)
    {
        VoteInfo storage info = voteInfo[proposalId][voter];
        return (info.hasVoted, info.support, info.changes);
    }

    /**
     * @notice Returns a paginated list of proposals, newest first.
     * @param offset Number of proposals to skip from the newest end (0 = start from latest).
     * @param limit  Maximum number of proposals to return (capped at 50).
     * @return page  Array of Proposal structs.
     * @return total Total number of proposals ever created.
     */
    function getProposals(uint256 offset, uint256 limit)
        external
        view
        returns (Proposal[] memory page, uint256 total)
    {
        require(limit > 0 && limit <= 50, "Limit must be 1-50");
        total = proposalCount;

        if (total == 0 || offset >= total) {
            return (new Proposal[](0), total);
        }

        uint256 available = total - offset;
        uint256 count = available < limit ? available : limit;
        page = new Proposal[](count);

        uint256 startId = total - offset; // newest first
        for (uint256 i = 0; i < count; i++) {
            page[i] = proposals[startId - i];
        }
    }

    /**
     * @notice Returns the current quorum threshold (majority of current super admin count).
     */
    function getRequiredVotes() external view returns (uint256) {
        return (superAdminCount / 2) + 1;
    }
}
