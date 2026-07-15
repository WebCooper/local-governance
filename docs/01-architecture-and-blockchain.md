# AuraChain Local Governance — Part 1: Architecture & Blockchain Layer

## 1. System Overview

AuraChain is a **privacy-first, decentralized civic reporting platform**. Citizens can submit local government issues (potholes, broken streetlights, illegal dumping, etc.) **without revealing their identity**, while the reports are permanently recorded on a private blockchain.

The system is split into five major services that work together:

| Service | Technology | Role |
|---|---|---|
| `web-dapp` | Next.js 15 (TypeScript) | Citizen-facing UI |
| `zkp-govid-simulator` | Express.js (TypeScript) | Government identity & ticket issuer |
| `backend-relayer` | NestJS (TypeScript) | Trusted submission gateway |
| `ai-oracle-service` | FastAPI (Python) | AI content moderation |
| `blockchain` + `smart-contracts` | Geth (Clique PoA) + Solidity | Immutable report ledger |

---

## 2. How Services Connect — High-Level Flow

```
Citizen Browser
      │
      │ 1. Login (GovID + Password)
      ▼
ZKP GovID Simulator  ──► issues signed ticket batch + citizenSeed
      │
      │ 2. Submit report (FormData + ticket + citizen signature)
      ▼
Backend Relayer (NestJS)
      │── 3. Verify gov ticket signature
      │── 4. Verify citizen payload signature
      │── 5. Send to AI Oracle for moderation
      │── 6. Upload to IPFS node
      │── 7. Call smart contract submitReport()
      ▼
Private Geth Blockchain (Clique PoA)
      │
      ▼
Smart Contract (Reporting.sol) — stores CID + hashes + pseudonym
```

---

## 3. Blockchain Layer

### 3.1 Geth Private Network

The blockchain is a **private Ethereum network** running the **Clique Proof-of-Authority (PoA)** consensus algorithm.

**Why Clique PoA?**
- No mining needed — blocks are sealed by pre-approved authority nodes.
- Near-zero gas cost — the relayer wallet has pre-funded balance, so citizens never pay gas.
- Predictable block times — configured to seal a block every **20 seconds**.
- Permissioned — only whitelisted relayer addresses can call write functions.

**Genesis Configuration** (`blockchain/genesis.json`):

```json
{
  "config": {
    "chainId": 1337,
    "clique": { "period": 20, "epoch": 30000 }
  },
  "gasLimit": "8000000",
  "alloc": {
    "0x7E687086...": { "balance": "1000000000000000000000" },
    "0x151e6113...": { "balance": "1000000000000000000000" },
    "0xAD0A0ed0...": { "balance": "1000000000000000000000" },
    "0x3253678a...": { "balance": "1000000000000000000000" }
  }
}
```

- `chainId: 1337` — standard local dev chain ID (also used by Hardhat).
- Three Clique sealers (Node 1, 2, 3) are pre-approved in `extraData`.
- The relayer address `0x3253678a...` is pre-funded so it can pay gas for submissions.

**Network endpoints:**
- RPC: `https://rpc.internalbuildtools.online` (or `http://127.0.0.1:8545` locally)
- Chain ID: `1337`

---

### 3.2 Smart Contract: `Reporting.sol`

**Location:** `smart-contracts/contracts/Reporting.sol`  
**Deployed at:** `0xf57d47Da140B0439c71D9259997778A4B5dE9aCC`

The single contract that acts as the **immutable public ledger** for all civic reports.

#### Report Lifecycle — Status Enum

```solidity
enum ReportStatus {
    PendingValidation,      // 0 — just submitted, awaiting community vote
    CommunityRejected,      // 1 — community voted it invalid
    Open,                   // 2 — validated, awaiting authority action
    InProgress,             // 3 — authority has started work
    PendingRejectionReview, // 4 — authority rejected, under appeal
    PendingVerification,    // 5 — authority marked solved, awaiting community check
    Closed,                 // 6 — verified solved
    Reopened                // 7 — re-opened after being closed
}
```

#### Report Struct

```solidity
struct Report {
    uint256 id;
    string  ipfsCid;              // IPFS URI e.g. "ipfs://QmXyz..."
    bytes32 reportHash;           // keccak256(description + ticketId + imageHashes)
    bytes32 submissionNullifier;  // = zkpTicketId — prevents replay attacks
    bytes32 citizenPseudonym;     // keccak256(citizenAddress + DOMAIN_SALT)
    address submittedByRelayer;   // relayer wallet address
    ReportStatus status;
    uint256 createdAt;
    uint256 updatedAt;
    uint256 phaseDeadline;        // voting window end timestamp
    address assignedAuthority;
    VoteCounters votes;
}

struct VoteCounters {
    uint256 validationUpvotes;
    uint256 validationDownvotes;
    uint256 verificationAcceptVotes;
    uint256 verificationRejectVotes;
    uint256 rejectionUpholdVotes;
    uint256 rejectionAppealVotes;
}
```

#### Access Control

```solidity
mapping(address => bool) public authorizedRelayers;
mapping(address => bool) public authorizedAuthorities;
```

- **Owner** (deployer): can add/remove relayers and authorities via `setRelayer()` / `setAuthority()`.
- **Relayer** (`onlyRelayer` modifier): the only address allowed to call `submitReport()`.
- **Authority** (`onlyAuthority` modifier): government officials who update report status.

Hardcoded in constructor:
- Relayer: `0x3253678aF33758255f6d97069d9102597AFFf92c`
- Authority: `0xEE8670A4d50cdcf0afE7C99bF9a45976BaF576c2`

---

#### Contract Write Functions

##### `submitReport()`

```solidity
function submitReport(
    string calldata ipfsCid,
    bytes32 reportHash,
    bytes32 submissionNullifier,
    bytes32 citizenPseudonym
) external onlyRelayer nonReentrant returns (uint256 reportId)
```

**What it does:**
1. Validates all inputs are non-zero/non-empty.
2. Checks `submissionNullifier` has NOT been used before (replay attack prevention).
3. Marks nullifier as used **before** any state changes (Checks-Effects-Interactions pattern).
4. Increments `reportCount` and assigns `reportId`.
5. Writes the full `Report` struct to storage.
6. Sets `phaseDeadline = block.timestamp + 12 hours` (community voting window).
7. Pushes `reportId` to `reportsByCitizen[citizenPseudonym]` index.
8. Emits `ReportSubmitted` event.

**Why the nullifier?** The `submissionNullifier` is the `zkpTicketId` — a one-time hash signed by the government. Once used, it's permanently flagged on-chain. This means even if someone intercepts a submission, they cannot replay it to spam the ledger.

**Why citizenPseudonym?** Instead of storing the citizen's real Ethereum address, we store `keccak256(address + "CivicReport-v1")`. This is:
- **Unlinkable** on-chain (no one can reverse-derive the address from the hash).
- **Deterministic** — the same citizen always produces the same pseudonym, so they can query their own reports.

---

#### Contract Read Functions

##### `getReport(uint256 reportId)`
Returns a single `Report` struct. Used by the issue detail page (`/issues/[id]`).

##### `getAllReports(uint256 offset, uint256 limit)`
Returns a paginated array of all reports, **newest first** (iterates from `reportCount` downward).
- `limit` is capped at 100 to bound gas cost.
- Returns `(Report[] page, uint256 total)` — the total lets the frontend compute page count.
- Used by the Community Feed page.

##### `getReportsByCitizen(bytes32 citizenPseudonym, uint256 offset, uint256 limit)`
Returns paginated reports for a specific pseudonym, **newest first**.
- Used by the My Reports page after the relayer resolves the pseudonym.

##### `getReportIdsByCitizen(bytes32 citizenPseudonym)`
Returns the raw array of report IDs for a pseudonym. Useful for bulk lookups.

##### `getReportsByIds(uint256[] calldata ids)`
Bulk-fetches a specific set of report IDs in one call.

##### `getReportCountByCitizen(bytes32 citizenPseudonym)`
Returns how many reports a given pseudonym has ever submitted.

---

#### Contract Events

```solidity
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
```

> **Note:** Voting functions (`castValidationVote`, `castVerificationVote`, etc.) are not yet implemented — marked as `// TODO` in the contract. The current status transitions are managed off-chain via the authority.

---

#### Replay-Attack Guards

The contract maintains four separate nullifier maps:

```solidity
mapping(bytes32 => bool) public usedSubmissionNullifiers;
mapping(uint256 => mapping(bytes32 => bool)) public usedValidationVoteNullifiers;
mapping(uint256 => mapping(bytes32 => bool)) public usedVerificationVoteNullifiers;
mapping(uint256 => mapping(bytes32 => bool)) public usedRejectionReviewVoteNullifiers;
```

Each of these prevents the same ZKP ticket from being used twice for the same purpose. For example, once ticket `0xABCD...` is used to submit Report #5, that exact bytes32 value is permanently flagged — any future attempt to submit again with the same ticket is reverted with `NullifierAlreadyUsed()`.

---

### 3.3 Hardhat Setup

**Location:** `smart-contracts/`

Used for local development, testing, and deployment.

```ts
// hardhat.config.ts — key settings
networks: {
  geth: {
    url: "https://rpc.internalbuildtools.online",
    chainId: 1337,
    accounts: [DEPLOYER_PRIVATE_KEY]
  },
  hardhat: { chainId: 1337 }
}
```

**Useful scripts:**
- `npx hardhat compile` — compile Solidity contracts.
- `npx hardhat run scripts/deploy.ts --network geth` — deploy to private network.
- `npx hardhat test` — run unit tests against local Hardhat node.

The compiled ABI artifact at `smart-contracts/artifacts/contracts/Reporting.sol/Reporting.json` is copied directly into the relayer at `backend-relayer/src/blockchain/Reporting.json` — this is how the relayer imports the ABI without duplicating it manually.

---

### 3.4 Environment Variables

**Relayer `.env`:**

| Variable | Value | Purpose |
|---|---|---|
| `RPC_URL` | `https://rpc.internalbuildtools.online` | Geth node JSON-RPC endpoint |
| `CONTRACT_ADDRESS` | `0x39398c47...` | Deployed Reporting.sol address |
| `RELAYER_PRIVATE_KEY` | `0xda7a888d...` | Signs transactions as the relayer wallet |
| `BLOCKCHAIN_SUBMISSION_ENABLED` | `true` | Feature flag — set to `false` to skip on-chain submission |
| `GOV_PUBLIC_ADDRESS` | `0xAf315861...` | Government authority's public key for ticket verification |
| `PSEUDONYM_DOMAIN_SALT` | `CivicReport-v1` | Salt used in pseudonym derivation |
| `ORACLE_API_KEY` | (secret) | API key sent to AI oracle |

**Web-DApp `.env.local`:**

| Variable | Value | Purpose |
|---|---|---|
| `NEXT_PUBLIC_RELAYER_URL` | `https://relayer.internalbuildtools.online` | Backend relayer URL |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.internalbuildtools.online` | Direct RPC for read-only contract calls |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `0xf57d47Da...` | Contract address for ethers.js queries |
