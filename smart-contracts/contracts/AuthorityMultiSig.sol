// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReporting {
    function setAuthority(address authority, bool authorized) external;
    function transferOwnership(address newOwner) external;
}

contract AuthorityMultiSig {
    // ─── Enums ───────────────────────────────────────────────────────────────
    enum ActionType {
        AddSuperAdmin,
        RemoveSuperAdmin,
        AddAuthority,
        RemoveAuthority
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
    // Threshold for a proposal to pass (2 out of 3 super admins)
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
     * @notice Submit a new proposal to add/remove a super admin or authority.
     * @param target The address to apply the action to.
     * @param actionType The type of action (0: AddSuperAdmin, 1: RemoveSuperAdmin, 2: AddAuthority, 3: RemoveAuthority).
     * @param durationInDays Number of days until the proposal expires.
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
    
    function getSuperAdmins() external view returns (address[] memory) {
        return superAdminsList;
    }
}
