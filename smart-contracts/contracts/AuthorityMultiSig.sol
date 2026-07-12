// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReporting {
    function setAuthority(address authority, bool authorized) external;
    function transferOwnership(address newOwner) external;
    function authorizedAuthorities(address account) external view returns (bool);
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
 * Profiles:
 *   - Every Super Admin and Authority Worker has an on-chain Profile (name, position, department).
 *   - Initial Super Admins have their details hardcoded in the constructor.
 *   - The initial hardcoded Authority in Reporting.sol also has a profile stored here.
 *   - Profiles are set when a proposal to add a member is executed.
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

    /**
     * @notice On-chain identity profile for Super Admins and Authority Workers.
     * @dev    isSet acts as an existence flag — false means no profile has been assigned.
     */
    struct Profile {
        string name;
        string position;
        string department;
        bool isSet;
    }

    struct Proposal {
        uint256 id;
        address target;
        ActionType actionType;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 deadline;
        bool executed;
        // Profile details carried in the proposal so they are immutably recorded
        string name;
        string position;
        string department;
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

    // On-chain profiles for all Super Admins and Authority Workers
    mapping(address => Profile) public profiles;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => VoteInfo)) public voteInfo;

    IReporting public reportingContract;

    // ─── Events ───────────────────────────────────────────────────────────────
    event ProposalSubmitted(uint256 indexed proposalId, address indexed target, ActionType actionType, address indexed proposer);
    event VoteCast(uint256 indexed proposalId, address indexed voter);
    event ProposalExecuted(uint256 indexed proposalId, address indexed target, ActionType actionType);
    event ReportingContractUpdated(address indexed newContract);
    event ProfileUpdated(address indexed account, string name, string position, string department);

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlySuperAdmin() {
        require(isSuperAdmin[msg.sender], "Not a Super Admin");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @notice Deploy the multi-sig and register all initial members with their profiles.
     *
     * @param initialSuperAdmins  Wallet addresses for the initial Super Admins.
     * @param initialNames        Full names — must be the same length as initialSuperAdmins.
     * @param initialPositions    Job titles — must be the same length as initialSuperAdmins.
     * @param initialDepartments  Departments — must be the same length as initialSuperAdmins.
     * @param _reportingContract  Address of the deployed Reporting.sol contract.
     *
     * @dev The hardcoded initial Authority Worker in Reporting.sol
     *      (0xEE8670A4d50cdcf0afE7C99bF9a45976BaF576c2) also gets a profile
     *      here so they appear in the directory alongside super admins.
     */
    constructor(
        address[] memory initialSuperAdmins,
        string[] memory initialNames,
        string[] memory initialPositions,
        string[] memory initialDepartments,
        address _reportingContract
    ) {
        require(initialSuperAdmins.length > 0, "Must have at least 1 super admin");
        require(
            initialNames.length == initialSuperAdmins.length &&
            initialPositions.length == initialSuperAdmins.length &&
            initialDepartments.length == initialSuperAdmins.length,
            "Profile arrays length mismatch"
        );

        for (uint256 i = 0; i < initialSuperAdmins.length; i++) {
            address admin = initialSuperAdmins[i];
            require(admin != address(0), "Invalid admin address");
            require(!isSuperAdmin[admin], "Duplicate admin");

            isSuperAdmin[admin] = true;
            superAdminsList.push(admin);
            superAdminCount++;

            profiles[admin] = Profile({
                name: initialNames[i],
                position: initialPositions[i],
                department: initialDepartments[i],
                isSet: true
            });

            emit ProfileUpdated(admin, initialNames[i], initialPositions[i], initialDepartments[i]);
        }

        if (_reportingContract != address(0)) {
            reportingContract = IReporting(_reportingContract);

            // Register the hardcoded initial Authority Worker from Reporting.sol
            address initialAuthority = 0xEE8670A4d50cdcf0afE7C99bF9a45976BaF576c2;
            profiles[initialAuthority] = Profile({
                name: "Initial Authority",
                position: "Field Officer",
                department: "Municipal Works Department",
                isSet: true
            });
            emit ProfileUpdated(initialAuthority, "Initial Authority", "Field Officer", "Municipal Works Department");
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
     *
     * @param target          The address to apply the action to.
     * @param actionType      The type of action (AddSuperAdmin, RemoveSuperAdmin, AddAuthority, RemoveAuthority).
     * @param durationInDays  Number of days until the proposal expires.
     * @param name            Full name of the target (required for Add actions; ignored for Remove).
     * @param position        Job title of the target (required for Add actions; ignored for Remove).
     * @param department      Department of the target (required for Add actions; ignored for Remove).
     *
     * @dev The proposer automatically casts a YES vote upon submission.
     *      The proposal executes immediately if quorum is reached (useful when there is only 1 super admin).
     */
    function submitProposal(
        address target,
        ActionType actionType,
        uint256 durationInDays,
        string calldata name,
        string calldata position,
        string calldata department
    ) external onlySuperAdmin returns (uint256) {
        require(target != address(0), "Invalid target address");
        require(durationInDays > 0, "Duration must be > 0");

        // Logical checks before creating proposal
        if (actionType == ActionType.AddSuperAdmin) {
            require(!isSuperAdmin[target], "Already a super admin");
            require(bytes(name).length > 0, "Name is required");
            require(bytes(position).length > 0, "Position is required");
            require(bytes(department).length > 0, "Department is required");
        } else if (actionType == ActionType.RemoveSuperAdmin) {
            require(isSuperAdmin[target], "Not a super admin");
            require(superAdminCount > 1, "Cannot remove last super admin");
        } else if (actionType == ActionType.AddAuthority) {
            require(bytes(name).length > 0, "Name is required");
            require(bytes(position).length > 0, "Position is required");
            require(bytes(department).length > 0, "Department is required");
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
            executed: false,
            name: name,
            position: position,
            department: department
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

                // Set profile for the newly added Super Admin
                profiles[proposal.target] = Profile({
                    name: proposal.name,
                    position: proposal.position,
                    department: proposal.department,
                    isSet: true
                });
                emit ProfileUpdated(proposal.target, proposal.name, proposal.position, proposal.department);
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

                // Clear the profile
                delete profiles[proposal.target];
            }
        } else if (proposal.actionType == ActionType.AddAuthority) {
            require(address(reportingContract) != address(0), "Reporting contract not set");
            reportingContract.setAuthority(proposal.target, true);

            // Set profile for the newly added Authority Worker
            profiles[proposal.target] = Profile({
                name: proposal.name,
                position: proposal.position,
                department: proposal.department,
                isSet: true
            });
            emit ProfileUpdated(proposal.target, proposal.name, proposal.position, proposal.department);
        } else if (proposal.actionType == ActionType.RemoveAuthority) {
            require(address(reportingContract) != address(0), "Reporting contract not set");
            reportingContract.setAuthority(proposal.target, false);

            // Clear the profile
            delete profiles[proposal.target];
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
     * @notice Returns the profile of any Super Admin or Authority Worker.
     * @param account The address to look up.
     * @return name       Full name (empty string if not set).
     * @return position   Job title (empty string if not set).
     * @return department Department (empty string if not set).
     * @return isSet      True if a profile has been assigned for this address.
     */
    function getProfile(address account)
        external
        view
        returns (
            string memory name,
            string memory position,
            string memory department,
            bool isSet
        )
    {
        Profile storage p = profiles[account];
        return (p.name, p.position, p.department, p.isSet);
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
