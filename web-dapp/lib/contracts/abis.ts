export const AuthorityMultiSigABI = [
    {
      "inputs": [
        {
          "internalType": "address[]",
          "name": "initialSuperAdmins",
          "type": "address[]"
        },
        {
          "internalType": "address",
          "name": "_reportingContract",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "proposalId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "target",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "enum AuthorityMultiSig.ActionType",
          "name": "actionType",
          "type": "uint8"
        }
      ],
      "name": "ProposalExecuted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "proposalId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "target",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "enum AuthorityMultiSig.ActionType",
          "name": "actionType",
          "type": "uint8"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "proposer",
          "type": "address"
        }
      ],
      "name": "ProposalSubmitted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "address",
          "name": "newContract",
          "type": "address"
        }
      ],
      "name": "ReportingContractUpdated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "proposalId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "voter",
          "type": "address"
        }
      ],
      "name": "VoteCast",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "REQUIRED_APPROVALS",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "proposalId",
          "type": "uint256"
        }
      ],
      "name": "executeProposal",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getSuperAdmins",
      "outputs": [
        {
          "internalType": "address[]",
          "name": "",
          "type": "address[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "hasVoted",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "name": "isSuperAdmin",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "proposalCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "proposals",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "address",
          "name": "target",
          "type": "address"
        },
        {
          "internalType": "enum AuthorityMultiSig.ActionType",
          "name": "actionType",
          "type": "uint8"
        },
        {
          "internalType": "uint256",
          "name": "votes",
          "type": "uint256"
        },
        {
          "internalType": "bool",
          "name": "executed",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "reportingContract",
      "outputs": [
        {
          "internalType": "contract IReporting",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_reportingContract",
          "type": "address"
        }
      ],
      "name": "setReportingContract",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "target",
          "type": "address"
        },
        {
          "internalType": "enum AuthorityMultiSig.ActionType",
          "name": "actionType",
          "type": "uint8"
        }
      ],
      "name": "submitProposal",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "superAdminCount",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "superAdminsList",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "proposalId",
          "type": "uint256"
        }
      ],
      "name": "vote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ];
export const ReportingABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"EmptyCID","type":"error"},{"inputs":[],"name":"InvalidHash","type":"error"},{"inputs":[],"name":"InvalidNullifier","type":"error"},{"inputs":[],"name":"InvalidPagination","type":"error"},{"inputs":[],"name":"InvalidPseudonym","type":"error"},{"inputs":[],"name":"InvalidReportId","type":"error"},{"inputs":[],"name":"InvalidState","type":"error"},{"inputs":[],"name":"NullifierAlreadyUsed","type":"error"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},{"inputs":[],"name":"ReentrancyGuardReentrantCall","type":"error"},{"inputs":[],"name":"Unauthorized","type":"error"},{"inputs":[],"name":"VotingWindowClosed","type":"error"},{"inputs":[],"name":"VotingWindowStillOpen","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":true,"internalType":"address","name":"authority","type":"address"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"ReportMarkedSolved","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":true,"internalType":"address","name":"authority","type":"address"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"ReportRejectedByAuthority","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":false,"internalType":"enum Reporting.ReportStatus","name":"previousStatus","type":"uint8"},{"indexed":false,"internalType":"enum Reporting.ReportStatus","name":"newStatus","type":"uint8"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"ReportStatusChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":false,"internalType":"string","name":"ipfsCid","type":"string"},{"indexed":true,"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"indexed":true,"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"indexed":false,"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"ReportSubmitted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":true,"internalType":"bytes32","name":"voteNullifier","type":"bytes32"},{"indexed":false,"internalType":"bool","name":"support","type":"bool"},{"indexed":false,"internalType":"uint256","name":"upvotes","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"downvotes","type":"uint256"}],"name":"ValidationVoteCast","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":false,"internalType":"enum Reporting.ReportStatus","name":"previousStatus","type":"uint8"},{"indexed":false,"internalType":"enum Reporting.ReportStatus","name":"newStatus","type":"uint8"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"VotingWindowFinalized","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"reportId","type":"uint256"},{"indexed":true,"internalType":"address","name":"authority","type":"address"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"WorkStarted","type":"event"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"authorizedAuthorities","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"authorizedRelayers","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"offset","type":"uint256"},{"internalType":"uint256","name":"limit","type":"uint256"}],"name":"getAllReports","outputs":[{"components":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"internalType":"address","name":"submittedByRelayer","type":"address"},{"internalType":"enum Reporting.ReportStatus","name":"status","type":"uint8"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint256","name":"phaseDeadline","type":"uint256"},{"internalType":"address","name":"assignedAuthority","type":"address"},{"components":[{"internalType":"uint256","name":"validationUpvotes","type":"uint256"},{"internalType":"uint256","name":"validationDownvotes","type":"uint256"},{"internalType":"uint256","name":"verificationAcceptVotes","type":"uint256"},{"internalType":"uint256","name":"verificationRejectVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionUpholdVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionAppealVotes","type":"uint256"}],"internalType":"struct Reporting.VoteCounters","name":"votes","type":"tuple"}],"internalType":"struct Reporting.Report[]","name":"page","type":"tuple[]"},{"internalType":"uint256","name":"total","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAuthorities","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"reportId","type":"uint256"}],"name":"getReport","outputs":[{"components":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"internalType":"address","name":"submittedByRelayer","type":"address"},{"internalType":"enum Reporting.ReportStatus","name":"status","type":"uint8"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint256","name":"phaseDeadline","type":"uint256"},{"internalType":"address","name":"assignedAuthority","type":"address"},{"components":[{"internalType":"uint256","name":"validationUpvotes","type":"uint256"},{"internalType":"uint256","name":"validationDownvotes","type":"uint256"},{"internalType":"uint256","name":"verificationAcceptVotes","type":"uint256"},{"internalType":"uint256","name":"verificationRejectVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionUpholdVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionAppealVotes","type":"uint256"}],"internalType":"struct Reporting.VoteCounters","name":"votes","type":"tuple"}],"internalType":"struct Reporting.Report","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"}],"name":"getReportCountByCitizen","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"}],"name":"getReportIdsByCitizen","outputs":[{"internalType":"uint256[]","name":"ids","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"internalType":"uint256","name":"offset","type":"uint256"},{"internalType":"uint256","name":"limit","type":"uint256"}],"name":"getReportsByCitizen","outputs":[{"components":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"internalType":"address","name":"submittedByRelayer","type":"address"},{"internalType":"enum Reporting.ReportStatus","name":"status","type":"uint8"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint256","name":"phaseDeadline","type":"uint256"},{"internalType":"address","name":"assignedAuthority","type":"address"},{"components":[{"internalType":"uint256","name":"validationUpvotes","type":"uint256"},{"internalType":"uint256","name":"validationDownvotes","type":"uint256"},{"internalType":"uint256","name":"verificationAcceptVotes","type":"uint256"},{"internalType":"uint256","name":"verificationRejectVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionUpholdVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionAppealVotes","type":"uint256"}],"internalType":"struct Reporting.VoteCounters","name":"votes","type":"tuple"}],"internalType":"struct Reporting.Report[]","name":"page","type":"tuple[]"},{"internalType":"uint256","name":"total","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256[]","name":"ids","type":"uint256[]"}],"name":"getReportsByIds","outputs":[{"components":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"internalType":"address","name":"submittedByRelayer","type":"address"},{"internalType":"enum Reporting.ReportStatus","name":"status","type":"uint8"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint256","name":"phaseDeadline","type":"uint256"},{"internalType":"address","name":"assignedAuthority","type":"address"},{"components":[{"internalType":"uint256","name":"validationUpvotes","type":"uint256"},{"internalType":"uint256","name":"validationDownvotes","type":"uint256"},{"internalType":"uint256","name":"verificationAcceptVotes","type":"uint256"},{"internalType":"uint256","name":"verificationRejectVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionUpholdVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionAppealVotes","type":"uint256"}],"internalType":"struct Reporting.VoteCounters","name":"votes","type":"tuple"}],"internalType":"struct Reporting.Report[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"reportCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"reports","outputs":[{"internalType":"uint256","name":"id","type":"uint256"},{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"},{"internalType":"address","name":"submittedByRelayer","type":"address"},{"internalType":"enum Reporting.ReportStatus","name":"status","type":"uint8"},{"internalType":"uint256","name":"createdAt","type":"uint256"},{"internalType":"uint256","name":"updatedAt","type":"uint256"},{"internalType":"uint256","name":"phaseDeadline","type":"uint256"},{"internalType":"address","name":"assignedAuthority","type":"address"},{"components":[{"internalType":"uint256","name":"validationUpvotes","type":"uint256"},{"internalType":"uint256","name":"validationDownvotes","type":"uint256"},{"internalType":"uint256","name":"verificationAcceptVotes","type":"uint256"},{"internalType":"uint256","name":"verificationRejectVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionUpholdVotes","type":"uint256"},{"internalType":"uint256","name":"rejectionAppealVotes","type":"uint256"}],"internalType":"struct Reporting.VoteCounters","name":"votes","type":"tuple"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"authority","type":"address"},{"internalType":"bool","name":"authorized","type":"bool"}],"name":"setAuthority","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"relayer","type":"address"},{"internalType":"bool","name":"authorized","type":"bool"}],"name":"setRelayer","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"duration","type":"uint256"}],"name":"setVotingWindowDuration","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"string","name":"ipfsCid","type":"string"},{"internalType":"bytes32","name":"reportHash","type":"bytes32"},{"internalType":"bytes32","name":"submissionNullifier","type":"bytes32"},{"internalType":"bytes32","name":"citizenPseudonym","type":"bytes32"}],"name":"submitReport","outputs":[{"internalType":"uint256","name":"reportId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"usedRejectionReviewVoteNullifiers","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"usedSubmissionNullifiers","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"usedValidationVoteNullifiers","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"usedVerificationVoteNullifiers","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"votingWindowDuration","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
