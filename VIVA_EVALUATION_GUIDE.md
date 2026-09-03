# AuraChain: Blockchain-Based Community-Assisted Privacy-Preserving Reporting Service for Local Governance

## Final Viva & Presentation Evaluation Preparation Guide

---

## 📊 Executive Summary & Quick-Reference Card

### Key Project Statistics & Metrics (Must Know for Viva)

| Metric / Parameter | Value / Finding | Reference / Source |
| :--- | :--- | :--- |
| **Total Automated Test Cases** | **128 Passing Tests** (75 Smart Contracts, 25 Relayer, 20 AI Oracle, 8 IPFS) | Chapter 5, Table 5.8 / 5.11 |
| **Blockchain Network Type** | Private Ethereum Network using **Clique Proof-of-Authority (PoA)** | [`genesis.json`](file:///d:/Projects/git/local-governance/blockchain/genesis.json) |
| **Block Time (Interval)** | **5.0 seconds** (Configured & Observed in benchmarks) | Report Table 5.10 |
| **Chain ID** | `1337` | [`genesis.json`](file:///d:/Projects/git/local-governance/blockchain/genesis.json) |
| **Network Throughput** | **0.87 TPS** (Batch of 20 concurrent transactions confirmed in 22.95s) | Report Table 5.10 |
| **Average Latency (`submitReport`)** | **5,017 ms** (~5.0 seconds confirm time) | Report Table 5.10 |
| **Gas Cost: `submitReport()`** | **309,056 gas** | Report Table 5.10, Figure 5.6 |
| **Gas Cost: `castValidationVote()`**| **51,806 gas** | Report Table 5.10, Figure 5.6 |
| **Gas Cost: `batchFinalizeVotingWindows()`**| **251,909 gas** (total for 10 reports = **25,190 gas/report**) | Report Table 5.10, Figure 5.6 |
| **IPFS Upload Latency** | 1 KB: **518 ms** \| 100 KB: **1,034 ms** \| 1 MB: **1,331 ms** \| 5 MB: **4,308 ms** | Report Table 5.11, Figure 5.8 |
| **AI Oracle Test Performance** | **20/20 Test Cases Passed** in **21.33 seconds** | Report Table 5.9 |

---

## 📋 Section 1: Evaluation Guidelines & Strategy

### 1.1 Time Allocation & Structure
According to [`End Semester Evaluation_Guidelines.pdf`](file:///d:/Projects/git/local-governance/End%20Semester%20Evaluation_Guidelines.pdf):

1. **Group Presentation (15 minutes total)**:
   - All group members **must** present.
   - Strict time management is required (conclude within 15 minutes).
2. **Individual Viva (7 minutes per student)**:
   - Individual evaluation by external/internal examiners.
   - Direct questions on project role, architecture, code, math, security, and trade-offs.
3. **Practical Demonstration (20 minutes total)**:
   - **First 5 minutes**: One student presents the core essence and proposed solution.
   - **Remaining 15 minutes**: Live end-to-end system showcase (using live DApp, backend logs, contracts, posters/backup slides).
4. **Turnitin & AI Detection Guidelines**:
   - Plagiarism & AI-generated content **must be below 25%**.

---

## 🌟 Section 2: Novelty & System Architecture

### 2.1 Core Novelty of Our System

When examiners ask *"What is novel about your project compared to existing systems like FixMyStreet or previous research?"*, state the **6 Novel Pillars**:

```
                  ┌──────────────────────────────────────────────────┐
                  │                 AURACHAIN NOVELTY                │
                  └─────────────────────────┬────────────────────────┘
                                            │
   ┌───────────────────┬────────────────────┼────────────────────┬───────────────────┐
   │                   │                    │                    │                   │
┌──▼───────────────┐ ┌─▼────────────────┐ ┌─▼────────────────┐ ┌─▼───────────────┐ ┌──▼────────────────┐
│ 1. Zero Toxic    │ │ 2. Decoupled ZKP │ │ 3. 2-Stage FSM   │ │ 4. Gasless     │ │ 5. Emergency      │
│    Immutability  │ │    Ticket Scheme │ │    Community      │ │    Relayer &   │ │    Fast-Track &   │
│ (AI Oracle      │ │ (Pseudonyms +    │ │    Validation     │ │    Async Jobs  │ │    Authority      │
│  Pre-Moderation) │ │  Nullifiers)     │ │    Safeguards     │ │   (BullMQ+SSE) │ │    MultiSig       │
└──────────────────┘ └──────────────────┘ └─────────────────┘ └────────────────┘ └───────────────────┘
```

1. **Prevention of "Toxic Immutability" via Pre-Anchoring Multi-Classifier AI Oracle**:
   - *Problem in existing blockchains*: Anything written to a blockchain is permanent. If someone posts hate speech, PII, or NSFW imagery, it remains on the ledger forever.
   - *Our Solution*: Multi-classifier AI pipeline (Toxic-BERT text safety, Falconsai NSFW image safety, OpenCV Haar Cascade face blurring, BERT-tiny spam detector, MiniLM-L6 civic relevance) filters all submission payloads **before** they touch IPFS or the blockchain.
2. **Privacy-Preserving Decoupled Identity (ZKP Ticket-Based Nullifier Scheme)**:
   - Citizens authenticate via a simulated Government ID portal (`zkp-govid-simulator`) and receive cryptographically signed single-use ticket vouchers.
   - Citizens interact on-chain using deterministic pseudonyms \( \text{pseudonym} = \text{keccak256}(\text{walletAddress} \parallel \text{salt}) \) and single-use nullifiers, preventing Sybil attacks and double-voting without revealing PII or linking real identities to report histories.
3. **Two-Stage Community-Enforced Finite State Machine (FSM)**:
   - Integrates **Stage 1: Community Validation** (filtering spam before assignment) and **Stage 2: Post-Resolution Verification** (citizens verify that an authority actually fixed the issue before it closes).
   - Includes **Pending_Rejection_Review** safeguards so corrupt/lazy authorities cannot silently dismiss valid complaints.
4. **Gasless Citizen Experience via Backend Relayer Architecture**:
   - Zero crypto wallet or ETH requirement for citizens. The NestJS backend relayer pays gas fees, verifies signatures, and enqueues tasks using BullMQ Redis queues with real-time Server-Sent Events (SSE).
5. **Dedicated Emergency Fast-Track & Penalty Mechanism**:
   - `EmergencyReporting.sol` allows immediate dispatch for high-priority incidents (e.g., gas leaks, live hazards), bypassing standard validation delays while penalizing false emergency reporters.
6. **Integrated On-Chain Opinion Polling & Multisig Governance**:
   - `OpinionPolling.sol` enables local councils to consult citizens on public decisions using ticket nullifiers, while `AuthorityMultiSig.sol` manages council worker access control transparently.

---

### 2.2 System Component Topology

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       CITIZEN USER INTERFACE                                    │
│                              Web dApp (Next.js 15 / React / TailwindCSS)                        │
│                           [`web-dapp/app/report/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/report/page.tsx)                      │
└──────────────┬────────────────────────────────┬─────────────────────────────────┬───────────────┘
               │                                │                                 │
   1. Authenticate & Get Tickets     2. Submit Report Payload         3. Listen for Progress
               │                                │                                 │
┌──────────────▼───────────────┐      ┌─────────▼─────────────────────┐   ┌───────▼───────────────┐
│     ZKP GovID Simulator      │      │        Backend Relayer        │   │    SSE Notification   │
│   (Express.js / Node / DB)   │      │        (NestJS Middleware)    │   │        Stream         │
│[`zkp-govid-simulator/src/`](file:///d:/Projects/git/local-governance/zkp-govid-simulator/src/)   │      │   [`backend-relayer/src/`](file:///d:/Projects/git/local-governance/backend-relayer/src/)     │   │  [`reports.service.ts`](file:///d:/Projects/git/local-governance/backend-relayer/src/reporting/reports.service.ts)│
└──────────────────────────────┘      └─────────┬─────────────────────┘   └───────────────────────┘
                                                │
                                      BullMQ Async Job Pipeline
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │ (Step 1)                     │ (Step 2)                     │ (Step 3)
┌────────────────▼─────────────┐   ┌────────────▼─────────────┐   ┌────────────▼─────────────┐
│      AI Oracle Service       │   │       IPFS Storage       │   │    Private Geth Chain    │
│  (FastAPI / Python Models)   │   │     (Kubo / Pinning)     │   │   (Clique PoA 5s block)  │
│ [`ai-oracle-service/`](file:///d:/Projects/git/local-governance/ai-oracle-service/)       │   │   [`ipfs-service/`](file:///d:/Projects/git/local-governance/ipfs-service/)         │   │  [`smart-contracts/`](file:///d:/Projects/git/local-governance/smart-contracts/)      │
│ • Toxic-BERT / NSFW Classifier│   │ • Text & Image Pinning   │   │ • Reporting.sol          │
│ • OpenCV Face Blurring       │   │ • CID Generation         │   │ • EmergencyReporting.sol │
│ • MiniLM Civic Relevance     │   └──────────────────────────┘   │ • AuthorityMultiSig.sol  │
└──────────────────────────────┘                                  │ • OpinionPolling.sol     │
                                                                  └──────────────────────────┘
```

---

## 🛠️ Section 3: Technical Deep-Dive: File Map & Code Implementation

### 3.1 ZKP & Privacy-Preserving Identity (Ticket-Based Nullifier Scheme)

#### Key Concepts & Math Formulations
- **Ticket Generation**: Government authority signs a ticket string containing a unique ticket UUID, citizen identifier, expiry, and purpose:
  $$\text{ticketSignature} = \text{Sign}_{\text{GovPrivateKey}}(\text{ticketId} \parallel \text{purpose} \parallel \text{expiry})$$
- **Deterministic Nullifiers**: Used to guarantee one action per ticket without exposing identity:
  $$\text{submissionNullifier} = \text{keccak256}(\text{ticketId})$$
  $$\text{voteNullifier} = \text{keccak256}(\text{ticketId} \parallel \text{reportId} \parallel \text{voteType})$$
- **Citizen Pseudonym**:
  $$\text{citizenPseudonym} = \text{keccak256}(\text{citizenAddress} \parallel \text{PSEUDONYM\_DOMAIN\_SALT})$$

#### Where Code Lives
- **GovID Ticket Signing**: [`authService.ts`](file:///d:/Projects/git/local-governance/zkp-govid-simulator/src/services/authService.ts)
- **Nullifier Database Verification**: [`db.ts`](file:///d:/Projects/git/local-governance/zkp-govid-simulator/src/database/db.ts)
- **Relayer Verification of Ticket**: [`relayer.service.ts`](file:///d:/Projects/git/local-governance/backend-relayer/src/blockchain/relayer.service.ts)
- **On-Chain Nullifier Deduplication**: [`Reporting.sol`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/Reporting.sol#L233-L244)

---

### 3.2 Smart Contracts & Report Finite State Machine (FSM)

#### Contract Hierarchy & Deployment
- [`Reporting.sol`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/Reporting.sol): Main reporting ledger, validation voting, verification voting, pseudonyms, and nullifiers.
- [`EmergencyReporting.sol`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/EmergencyReporting.sol): Fast-track emergency channel with collateral/penalty tracking.
- [`AuthorityMultiSig.sol`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/AuthorityMultiSig.sol): 2-of-3 or m-of-n multisignature wallet for adding/removing authority workers.
- [`OpinionPolling.sol`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/OpinionPolling.sol): Citizens cast anonymous votes on governance proposals.

#### Report Finite State Machine (FSM)

```
                       ┌──────────────────────┐
                       │  PendingValidation   │ (Status 0)
                       └──────────┬───────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
      ┌───────────────────────┐       ┌───────────────────────┐
      │   CommunityRejected   │       │         Open          │ (Status 2)
      │      (Status 1)       │       └───────────┬───────────┘
      └───────────────────────┘                   │
                                                  ▼
                                      ┌───────────────────────┐
                                      │      InProgress       │ (Status 3)
                                      └───────────┬───────────┘
                                                  │
                  ┌───────────────────────────────┴───────────────────────────────┐
                  ▼                                                               ▼
      ┌───────────────────────┐                                       ┌───────────────────────┐
      │PendingRejectionReview │                                       │  PendingVerification  │ (Status 5)
      │      (Status 4)       │                                       └───────────┬───────────┘
      └───────────┬───────────┘                                                   │
                  │                                               ┌───────────────┴───────────────┐
         ┌────────┴────────┐                                      ▼                               ▼
         ▼                 ▼                          ┌───────────────────────┐       ┌───────────────────────┐
   [Rejection       [Overruled ->                     │        Closed         │       │       Reopened        │
    Upheld]             Open]                         │      (Status 6)       │       │      (Status 7)       │
                                                      └───────────────────────┘       └───────────────────────┘
```

#### Key Solidity Functions
- `submitReport(string ipfsCid, bytes32 reportHash, bytes32 submissionNullifier, bytes32 citizenPseudonym)`: [`Reporting.sol:L157-L183`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/Reporting.sol#L157-L183)
- `castValidationVote(uint256 reportId, bytes32 voteNullifier, bool support)`: [`Reporting.sol`](file:///d:/Projects/git/local-governance/smart-contracts/contracts/Reporting.sol)
- `startWork(uint256 reportId)`: Changes status from `Open` to `InProgress`.
- `markSolved(uint256 reportId, string resolutionIpfsCid)`: Changes status to `PendingVerification`.
- `castVerificationVote(uint256 reportId, bytes32 voteNullifier, bool verifySuccess)`: Moves status to `Closed` (if passed) or `Reopened` (if rejected).

---

### 3.3 Backend Relayer & Asynchronous Queue Pipeline

#### Relayer Order of Checks (3-Step Gatekeeper)
1. **Government Ticket Signature Verification**: Recovers government public key from ticket signature and checks against `GOV_PUBLIC_ADDRESS`.
2. **Image Keccak-256 Check**: Computes Keccak-256 hash of all attached image buffers and matches against hashes declared by DApp.
3. **Composite Report Hash & Citizen Signature Verification**: Reconstructs composite hash:
   $$\text{reportHash} = \text{keccak256}(\text{description} \parallel \text{ticketId} \parallel \text{imageHash}_1 \parallel \dots)$$
   Recovers citizen wallet address from payload signature and confirms match.

#### BullMQ Redis Queue Pipeline Architecture
- **Job 1: AI Moderation** (1 attempt maximum — non-transient decision).
- **Job 2: IPFS Upload** (3 retries with exponential backoff — handles network glitches).
- **Job 3: On-Chain Anchoring** (3 retries with exponential backoff — handles RPC timeouts).
- **Failure Isolation**: If any step fails, the flow fails atomically. Status is pushed to user via SSE (`Server-Sent Events`).

#### Where Code Lives
- **NestJS Gateway & Controllers**: [`reports.controller.ts`](file:///d:/Projects/git/local-governance/backend-relayer/src/reporting/reports.controller.ts)
- **BullMQ Processors & Handlers**: [`reports.processor.ts`](file:///d:/Projects/git/local-governance/backend-relayer/src/queue/reports.processor.ts)
- **Crypto Verification Service**: [`relayer.service.ts`](file:///d:/Projects/git/local-governance/backend-relayer/src/blockchain/relayer.service.ts)

---

### 3.4 AI Content Moderation & Anti-Toxic Immutability

#### Microservices Breakdown
1. **Safety Microservice**:
   - Text Safety: `unitary/toxic-bert` (evaluates first 512 characters).
     - Critical Flags (immediate rejection): `severe_toxic` (>0.50), `threat` (>0.40), `identity_hate` (>0.40).
     - Standard Flags: `toxic` (>0.50), `obscene` (>0.60), `insult` (>0.60).
   - Image Safety: `Falconsai/nsfw_image_detection` (threshold 0.70).
   - Privacy Enhancement: **OpenCV Haar Cascades** detects human faces in accepted images and applies **Gaussian Blur** before sending to IPFS.
2. **Spam Microservice**:
   - Model: `mrm8488/bert-tiny-finetuned-sms-spam-detection`.
   - Heuristic Rules Engine: Adds points for excessive URLs, repetitive characters, all-caps text, and blacklisted promotional keywords.
3. **Civic Relevance Microservice**:
   - Model: `sentence-transformers/all-MiniLM-L6-v2`.
   - Computes cosine similarity between input embedding and pre-calculated civic reference topic vectors. Rejects text if similarity < **0.38**.

#### Aggregator & Anti-Replay Protection
- Aggregator requires HMAC signature, timestamp window (<60 seconds), and unique `nonce`.
- Nonces are stored in SQLite database to block replay attacks on moderation API.
- Rejection policy: Rejects if ANY critical rule fires, OR if fewer than 2 of 3 classifiers accept.

#### Where Code Lives
- **Aggregator Service**: [`aggregator.py`](file:///d:/Projects/git/local-governance/ai-oracle-service/aggregator/aggregator.py)
- **Safety Classifier**: [`oracle_safety.py`](file:///d:/Projects/git/local-governance/ai-oracle-service/oracle-safety/app.py)
- **Spam Classifier**: [`oracle_spam.py`](file:///d:/Projects/git/local-governance/ai-oracle-service/oracle-spam/app.py)
- **Civic Relevance Classifier**: [`oracle_civic.py`](file:///d:/Projects/git/local-governance/ai-oracle-service/oracle-civic/app.py)

---

### 3.5 IPFS Storage & Off-Chain Pinning

- Raw complaint text, metadata (coordinates, timestamp, category), and blurred images are serialized into JSON and pinned to IPFS.
- IPFS returns a Content Identifier hash (e.g., `ipfs://QmXyz...`).
- The CID is passed as `ipfsCid` to `submitReport()` on-chain.
- Off-chain storage reduces smart contract storage fees while retaining tamper-evident verification.

#### Where Code Lives
- **IPFS Service Module**: [`ipfs.service.ts`](file:///d:/Projects/git/local-governance/backend-relayer/src/ipfs/ipfs.service.ts)
- **Standalone IPFS Service**: [`test-ipfs.ts`](file:///d:/Projects/git/local-governance/ipfs-service/test-ipfs.ts)

---

### 3.6 Frontend Web dApp & Interfaces

- Built with **Next.js 15**, **TypeScript**, **TailwindCSS**, **Ethers.js**, and **Leaflet Map**.
- Dynamic Views:
  - **Citizen Interface**: [`report/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/report/page.tsx), [`all-reports/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/all-reports/page.tsx), [`my-reports/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/my-reports/page.tsx), [`emergency/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/emergency/page.tsx), [`polls/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/polls/page.tsx).
  - **Authority Interface**: [`admin/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/admin/page.tsx), [`admin/reports/[id]/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/admin/reports/%5Bid%5D/page.tsx).
  - **Super Admin Interface**: [`super-admin/page.tsx`](file:///d:/Projects/git/local-governance/web-dapp/app/super-admin/page.tsx).

---

## ❓ Section 4: Viva Questions & Answers (Group & Individual Prep)

### Category A: High-Level Architecture & Governance Concept

#### Q1: Why use blockchain for civic issue reporting instead of a centralized SQL database like PostgreSQL?
> **Answer**: Centralized databases managed by municipal councils suffer from single points of control and failure. Reports can be silently deleted, status changes can be altered without audit trails, and citizens have no cryptographic guarantee that their complaints were received or handled fairly. 
> 
> Our permissioned Proof-of-Authority blockchain provides an immutable, transparent public ledger where report state transitions, voting tallies, and authority responses are permanently logged and verifiable by any citizen or auditor, while heavy media files remain on IPFS.

#### Q2: Why did you select a Private Permissioned PoA (Clique) network over Public Ethereum or Polygon?
> **Answer**: Public blockchains present three major barriers for local governance:
> 1. **Gas Cost Volatility**: Citizens should not pay transaction fees or need cryptocurrency to report a broken streetlight.
> 2. **Transaction Latency**: Public Ethereum block confirmation times (12+ seconds) and network congestion create poor UX.
> 3. **Governance & Privacy**: Municipal infrastructure records require predictable, authority-controlled consensus nodes.
> 
> Private Clique PoA provides a fixed 5-second block time, zero gas costs for citizens (sponsored by the relayer wallet), high transaction throughput (0.87 TPS in our benchmarks), and controlled validator participation.

---

### Category B: Cryptography, ZKP, & Privacy Mechanisms

#### Q3: How does your system preserve citizen privacy while preventing duplicate reports and Sybil attacks?
> **Answer**: We use a **Decoupled Ticket-Based Nullifier Scheme**. 
> 1. The citizen authenticates with our identity provider (`zkp-govid-simulator`) and receives a batch of cryptographically signed single-use tickets signed by the government's private key.
> 2. When submitting a report, the citizen generates a `submissionNullifier` = `keccak256(ticketId)` and an unlinkable deterministic pseudonym = `keccak256(walletAddress || DOMAIN_SALT)`.
> 3. The smart contract records the `submissionNullifier` in `usedSubmissionNullifiers[nullifier] = true`. If anyone attempts to submit a second report with the same ticket, the transaction reverts with `NullifierAlreadyUsed()`.
> 4. Thus, no personal identifiable information (PII) ever touches the blockchain, yet Sybil attacks and duplicate submissions are mathematically blocked.

#### Q4: What is the difference between a `submissionNullifier`, a `voteNullifier`, and a `citizenPseudonym`?
> **Answer**:
> - **Submission Nullifier**: Derived as `keccak256(ticketId)`. Used once when filing a report to prevent report replay/spam.
> - **Vote Nullifier**: Derived as `keccak256(ticketId || reportId || voteType)`. Used during community validation/verification voting to ensure a citizen can vote only once per report phase per ticket.
> - **Citizen Pseudonym**: Derived as `keccak256(walletAddress || salt)`. Links multiple reports from the same citizen on-chain without revealing their real wallet address or government ID.

---

### Category C: Smart Contracts, Blockchain Performance, & Gas Costs

#### Q5: Walk us through the gas consumption of your key smart contract operations.
> **Answer** (cite benchmark numbers from Table 5.10):
> - `submitReport()` consumes **309,056 gas** on average because it initializes the `Report` struct, updates mappings, stores CIDs, writes hashes, and flags nullifiers.
> - `castValidationVote()` consumes **51,806 gas** as a lightweight state update.
> - `batchFinalizeVotingWindows()` consumes **251,909 gas** total for 10 reports (**25,190 gas per report**), demonstrating that batch operations significantly optimize validator gas efficiency.

#### Q6: What security patterns were implemented in `Reporting.sol`?
> **Answer**:
> 1. **ReentrancyGuard**: Uses OpenZeppelin's `nonReentrant` modifier on state-changing functions like `submitReport()`.
> 2. **Checks-Effects-Interactions Pattern**: Mappings like `usedSubmissionNullifiers[nullifier] = true` are updated *before* firing events or performing internal state transitions.
> 3. **Role-Based Access Control (RBAC)**: Functions restricted with `onlyRelayer` and `onlyAuthority` modifiers.
> 4. **Input Sanitization**: Reverts on empty IPFS CIDs (`bytes32(0)`), invalid nullifiers, or out-of-bound array queries.

---

### Category D: Backend Relayer & Asynchronous Execution

#### Q7: Why do you need a Backend Relayer? Why doesn't the citizen DApp connect directly to MetaMask and call the smart contract?
> **Answer**: Requiring citizens to install MetaMask, buy ETH, and manage private keys creates immense friction for non-technical users. 
> 
> The NestJS Relayer acts as a trusted transaction sponsor:
> - It accepts standard REST API HTTP payloads from the frontend.
> - It validates government ticket signatures and citizen payload signatures off-chain.
> - It pays gas fees and broadcasts transactions to the PoA network using its pre-funded relayer wallet.
> - It decouples heavy off-chain tasks (AI filtering, IPFS upload) from blockchain consensus.

#### Q8: How does BullMQ handle job failures across the 3-stage pipeline (AI Moderation -> IPFS Upload -> On-Chain Anchoring)?
> **Answer**:
> - **AI Moderation (Job 1)**: Configured with **1 attempt max** because an AI rejection is a content decision; retrying with identical input will yield the same rejection.
> - **IPFS Upload (Job 2)** & **Blockchain Anchoring (Job 3)**: Configured with **3 attempts each** with exponential backoff to recover from transient network drops or RPC delays.
> - If any child job fails permanently, the parent flow terminates atomically, preventing partial states (e.g., an image pinned on IPFS that is never anchored on-chain).

---

### Category E: AI Oracle Moderation & Anti-Toxic Immutability

#### Q9: What is "Toxic Immutability" and how does your AI service resolve it?
> **Answer**: Blockchains are permanent and immutable. If a malicious user submits illegal content, hate speech, adult content, or doxed personal data, it becomes permanently embedded in the ledger and cannot be erased.
> 
> To solve this, our **AI Oracle pre-screens all content off-chain before on-chain anchoring**:
> - Text is screened using `toxic-bert` (toxic, threat, identity hate) and `MiniLM-L6` (civic relevance).
> - Images are screened using `Falconsai NSFW` model.
> - Facial features are automatically blurred using OpenCV Haar Cascades to protect bystander privacy.
> - If content fails moderation, it is rejected at the relayer gate and never touches IPFS or the blockchain.

#### Q10: How do you prevent replay attacks on your AI Oracle Aggregator?
> **Answer**: Each request from the relayer to the AI Aggregator includes an API Key, Relayer HMAC Signature, Timestamp, and unique Nonce. 
> The Aggregator checks that the timestamp is within a 60-second window and verifies that the nonce does not exist in its local SQLite `nonce` database. If a duplicate nonce is detected, the request is rejected immediately.

---

### Category F: IPFS Storage & Integration

#### Q11: Why not store report descriptions and images directly on Solidity smart contracts?
> **Answer**: Storing 1 MB of image data directly in Ethereum contract storage would cost over 64 million gas (far exceeding the block gas limit of 8,000,000). 
> 
> By utilizing IPFS (InterPlanetary File System), we achieve content-addressed decentralized storage where we only pay for a 46-character string (`ipfsCid`) on-chain. The cryptographic integrity is guaranteed because modifying even 1 byte of the IPFS media file changes its CID hash, breaking the on-chain composite hash check.

---

### Category G: Benchmarks & Empirical Test Validation

#### Q12: Summarize your automated test coverage.
> **Answer**: We have **128 passing automated tests** across 4 test suites:
> 1. **75 Smart Contract Unit Tests**: Verifying state transitions, role enforcement, voting rules, and nullifier reuse.
> 2. **25 Relayer Integration Tests**: Testing ticket verification, signature recovery, and BullMQ queue flow.
> 3. **20 AI Oracle Tests**: 8 API security tests and 12 text/image classification tests.
> 4. **8 IPFS Integration Tests**: Verifying CID hashing accuracy, concurrent uploads, and error handling.
> 5. **6 Manual E2E Scenarios**: Exercising the full life cycle from citizen submission to authority resolution.

---

## 🖼️ Section 5: Backup Slides & External Visual Assets Checklist

To answer panel questions effectively during your Viva and Demonstration, prepare these **10 Backup Slides** immediately after your conclusion slide:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               BACKUP SLIDES INDEX FOR VIVA                              │
├───────┬────────────────────────────────────────────┬────────────────────────────────────┤
│ Slide │ Topic / Slide Title                        │ Recommended Visual Asset           │
├───────┼────────────────────────────────────────────┼────────────────────────────────────┤
│ B-01  │ Full System Component Interaction Diagram  │ Architectural Topology Diagram     │
│ B-02  │ Cryptographic ZKP Ticket & Nullifier Math  │ Equations + Flow Diagram           │
│ B-03  │ Complete Report FSM State Transition Map   │ FSM State Diagram (8 States)       │
│ B-04  │ Relayer 3-Step Check & BullMQ Async Flow   │ Relayer Pipeline Diagram           │
│ B-05  │ AI Oracle Architecture & Safety Thresholds │ Table 4.2 + Haar Cascade Screenshot│
│ B-06  │ On-Chain Smart Contract Structure & Storage│ Solidity Structs Code Snippet      │
│ B-07  │ Blockchain Performance Benchmark Graphs    │ Gas & Latency Bar Charts           │
│ B-08  │ IPFS Upload Latency vs File Size Benchmark │ Latency vs Size Curve Graph        │
│ B-09  │ Comparative Matrix with Literature         │ Table 6.3 (6 Feature Coverage)     │
│ B-10  │ Comprehensive Automated Test Matrix        │ Table 5.8 (128 Test Cases Breakdown│
└───────┴────────────────────────────────────────────┴────────────────────────────────────┘
```

---

## 🚀 Section 6: Step-by-Step Live Demonstration Walkthrough Guide

Follow this protocol during your **20-Minute Practical Demonstration**:

### Phase 1: High-Level Overview (First 5 Minutes)
- **Speaker**: Designated Group Representative.
- **Action**: Display Slide B-01 (Architecture Topology). Briefly explain the core problem (centralized control, lack of citizen privacy, spam/toxic immutability) and introduce AuraChain's 5 key components (DApp, GovID Simulator, Relayer, AI Oracle, PoA Blockchain).

### Phase 2: Live System Showcase (15 Minutes)

#### Step 1: Citizen Login & Ticket Generation
1. Open DApp (`http://localhost:3000`) and navigate to Login.
2. Authenticate using GovID credentials (`citizen1` / `password`).
3. Point out: The `zkp-govid-simulator` issues a batch of 5 cryptographically signed tickets without storing wallet links.

#### Step 2: Filing a Civic Report (Standard Flow)
1. Navigate to `/report`. Upload a photo of a road pothole, select category, write description.
2. Click **Submit Report**.
3. **Show Backend Terminal**: Point to NestJS logs showing:
   - Step 1: Gov Ticket signature verification `[PASSED]`
   - Step 2: Composite Keccak-256 hash match `[PASSED]`
   - Step 3: BullMQ job dispatched.
4. **Show AI Oracle Terminal**: Point to Python FastAPI logs showing Toxic-BERT text score (<0.10), Falconsai NSFW score (<0.05), OpenCV face detection run, and MiniLM civic relevance score (0.78 > 0.38 threshold) `[ACCEPTED]`.
5. **Show Real-Time Progress Bar**: Point out SSE stream updating DApp UI in real time without browser freezing.
6. **Show Blockchain Confirmation**: Display transaction hash on PoA Explorer/Geth node. Point out `submitReport()` gas cost (~309k gas) and status updated to `PendingValidation`.

#### Step 3: Anti-Spam & Toxicity Rejection Demo (Edge Case)
1. Try submitting a report with toxic text or inappropriate image.
2. Show immediate rejection at AI Aggregator layer. Show that **no transaction was broadcast to the blockchain**, demonstrating anti-toxic immutability.

#### Step 4: Double-Submission Nullifier Replay Attack Demo (Security)
1. Attempt to resubmit a report using an already spent `ticketId`.
2. Show relayer or smart contract revert with `NullifierAlreadyUsed()`.

#### Step 5: Community Validation & Authority Resolution
1. Switch to a second citizen account and cast a Validation Upvote (`castValidationVote`).
2. Show status transition from `PendingValidation` -> `Open`.
3. Log in as Authority (`/admin`). Claim the issue, mark `InProgress`, upload resolution photo evidence, and click `Mark Solved`. Status changes to `PendingVerification`.
4. Return as Citizen (`/my-reports`), cast positive verification vote -> Status transitions to `Closed`.
