// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IReporting {
    function authorizedAuthorities(address account) external view returns (bool);
}

contract OpinionPolling is ReentrancyGuard {
    enum PollType { TrueFalse, MultiChoice }

    struct Poll {
        uint256 id;
        address creator;
        string ipfsMetadataCid; 
        uint256 deadline;
        PollType pollType;
        bool isActive;
    }

    IReporting public immutable reportingContract;
    uint256 public pollCount;

    mapping(uint256 => Poll) public polls;
    // pollId => optionIndex => voteCount
    mapping(uint256 => mapping(uint256 => uint256)) public pollResults;
    // pollId => uniqueNullifier => hasVoted
    mapping(uint256 => mapping(bytes32 => bool)) public nullifierVoted;

    event PollCreated(uint256 indexed pollId, address indexed creator, string ipfsMetadataCid, uint256 deadline);
    event VoteCast(uint256 indexed pollId, bytes32 indexed nullifier, uint256 optionIndex);
    event PollFinalized(uint256 indexed pollId, uint256 finalizedAt);

    error UnauthorizedAuthority();
    error PollInactiveOrClosed();
    error AlreadyVotedWithNullifier();
    error InvalidDeadline();
    error PollDoesNotExist();

    constructor(address _reportingContract) {
        reportingContract = IReporting(_reportingContract);
    }

    function createOfficialPoll(
        string calldata _ipfsMetadataCid,
        uint256 _deadline,
        PollType _pollType
    ) external returns (uint256) {
        if (!reportingContract.authorizedAuthorities(msg.sender)) revert UnauthorizedAuthority();
        if (_deadline <= block.timestamp) revert InvalidDeadline();

        pollCount++;
        polls[pollCount] = Poll({
            id: pollCount,
            creator: msg.sender,
            ipfsMetadataCid: _ipfsMetadataCid,
            deadline: _deadline,
            pollType: _pollType,
            isActive: true
        });

        emit PollCreated(pollCount, msg.sender, _ipfsMetadataCid, _deadline);
        return pollCount;
    }

    function castVote(uint256 _pollId, uint256 _optionIndex, bytes32 _nullifier) external nonReentrant {
        Poll storage poll = polls[_pollId];
        if (!poll.isActive || block.timestamp >= poll.deadline) revert PollInactiveOrClosed();
        if (nullifierVoted[_pollId][_nullifier]) revert AlreadyVotedWithNullifier();

        nullifierVoted[_pollId][_nullifier] = true;
        pollResults[_pollId][_optionIndex]++;

        emit VoteCast(_pollId, _nullifier, _optionIndex);
    }

    function finalizePoll(uint256 _pollId) external {
        if (_pollId == 0 || _pollId > pollCount) revert PollDoesNotExist();
        Poll storage poll = polls[_pollId];
        if (!poll.isActive) revert PollInactiveOrClosed();
        
        poll.isActive = false;
        emit PollFinalized(_pollId, block.timestamp);
    }

    function getPollResults(uint256 _pollId, uint256 _optionCount) external view returns (uint256[] memory) {
        uint256[] memory results = new uint256[](_optionCount);
        for (uint256 i = 0; i < _optionCount; i++) {
            results[i] = pollResults[_pollId][i];
        }
        return results;
    }
}