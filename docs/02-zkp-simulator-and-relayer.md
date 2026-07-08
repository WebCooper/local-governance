# AuraChain Local Governance — Part 2: ZKP GovID Simulator & Backend Relayer

---

## 4. ZKP GovID Simulator

**Location:** `zkp-govid-simulator/`  
**Framework:** Express.js (TypeScript)  
**Port:** `5000`  
**Public URL:** `https://zkp.internalbuildtools.online`

### 4.1 What It Is

This service simulates a **Government Identity Authority**. In a real system this would be a secure government-operated server that verifies a citizen's national ID. For this project, it:

1. Holds a SQLite database of registered citizens (name, GovID, hashed password).
2. Authenticates citizens by GovID + password.
3. Issues a **batch of one-time cryptographic tickets** — each ticket is a `keccak256` hash signed by the Government's private key.
4. Returns a `citizenSeed` — a secret string derived from the citizen's record — which the frontend uses to deterministically derive a private/public key pair (the "citizen wallet").

**Why tickets instead of a JWT?**  
A JWT can be replayed. A ZKP-style ticket batch means each submission consumes one ticket permanently. Once a ticket is used on-chain (as a `submissionNullifier`), it can never be reused — preventing the same citizen from spamming reports by replaying a token.

---

### 4.2 Government Authority Key

The simulator holds a **Government Ethereum wallet** (private key loaded from `.env`). Every ticket it issues is signed with this wallet's private key using `ethers.signMessage()`.

The corresponding public address (`GOV_PUBLIC_ADDRESS`) is loaded into the backend relayer. When a submission arrives, the relayer recovers the signer from the ticket signature and checks it matches the expected government address. This proves the ticket genuinely came from the government authority — not a forged one.

---

### 4.3 API Endpoints

#### `POST /api/govid/verify-citizen`

**Purpose:** Authenticate a citizen and receive a batch of signed ZKP tickets.

**Request Body:**
```json
{
  "govId": "199812345678",
  "password": "mypassword"
}
```

| Field | Type | Description |
|---|---|---|
| `govId` | string | 12-digit government ID number |
| `password` | string | Citizen's account password |

**Success Response `200`:**
```json
{
  "success": true,
  "citizenSeed": "some-unique-secret-string-for-this-citizen",
  "ticketBatch": [
    {
      "ticketId": "0xabc123...def456",
      "signature": "0x1a2b3c...ff"
    },
    {
      "ticketId": "0xbbb222...aaa111",
      "signature": "0x4d5e6f...ee"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `citizenSeed` | string | A deterministic secret for this citizen. The frontend hashes this with `keccak256` to derive a private key. |
| `ticketBatch` | array | Array of `{ ticketId, signature }` pairs. Default batch size is 10. |
| `ticketId` | string | `ethers.id(uuidv4())` — a `keccak256` hash of a random UUID. |
| `signature` | string | Gov wallet's ECDSA signature over the raw bytes of `ticketId`. |

**Error Response `401`:**
```json
{ "error": "Invalid citizen credentials" }
```

**How ticket generation works internally:**
```ts
for (let i = 0; i < batchSize; i++) {
  const rawUuid = uuidv4();
  const ticketId  = ethers.id(rawUuid);           // keccak256 of UUID string
  const signature = await govWallet.signMessage(
    ethers.getBytes(ticketId)                      // signs raw bytes, not hex string
  );
  ticketBatch.push({ ticketId, signature });
}
```

> `TICKET_BATCH_SIZE` (default: 10) is configurable via `.env`. Each ticket in the batch is independent — the citizen consumes one per report submission.

---

#### `POST /api/govid/add-citizen`

**Purpose:** Admin-only endpoint to register a new citizen in the SQLite database.

**Request Body:**
```json
{
  "adminSecret": "super-secret-admin-key",
  "govId": "199812345678",
  "password": "securepassword",
  "name": "Ahmad bin Ali",
  "email": "ahmad@example.com",
  "phone": "0123456789",
  "address": "123 Jalan Merdeka, KL",
  "status": "Active"
}
```

| Field | Required | Description |
|---|---|---|
| `adminSecret` | ✅ | Must match `ADMIN_SECRET` env var |
| `govId` | ✅ | Must be exactly 12 digits |
| `name` | ✅ | Full name |
| `password` | ✅ | Plain text (stored in SQLite) |
| `email` | ❌ | Optional |
| `phone` | ❌ | Optional |
| `address` | ❌ | Optional |
| `status` | ❌ | `"Active"` (default) or `"Inactive"` |

**Success Response `201`:**
```json
{
  "success": true,
  "message": "Citizen Ahmad bin Ali added successfully.",
  "citizen": {
    "govId": "199812345678",
    "name": "Ahmad bin Ali",
    "status": "Active"
  }
}
```

**Error Response `409`:**
```json
{ "error": "A citizen with this GovID already exists." }
```

---

#### `GET /api/govid/public-key`

**Purpose:** Returns the Ethereum address of the Government Authority wallet. Used by the relayer to verify ticket signatures.

**Response `200`:**
```json
{
  "success": true,
  "authorityAddress": "0xAf315861A19429c11d5461df6f6e80e492Fa6D0e",
  "description": "The official public address of the Government Authority node"
}
```

---

#### `GET /health`

**Purpose:** Health check.

**Response `200`:**
```json
{ "status": "ok" }
```

---

### 4.4 Citizen Wallet Derivation (Frontend)

**File:** `web-dapp/lib/walletUtils.ts`

After receiving `citizenSeed` from the ZKP server, the browser derives an ephemeral Ethereum wallet:

```ts
export const deriveCitizenWallet = (citizenSeed: string): CitizenWallet => {
  // 1. Hash the seed → guaranteed 32-byte valid private key
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(citizenSeed));

  // 2. Instantiate wallet
  const wallet = new ethers.Wallet(privateKey);

  return {
    privateKey: wallet.privateKey,
    publicKey: wallet.address,   // Ethereum address
  };
};
```

**Why this design?**
- The `citizenSeed` from the server is deterministic per citizen — so every login produces the **same** wallet address.
- The wallet is **never sent to the server** — it stays in the browser's `sessionStorage`.
- The citizen's `publicKey` (Ethereum address) is used as `citizenPubKey` in report submissions so the relayer can verify the citizen signed their own payload.

---

### 4.5 Session State — `CitizenContext`

**File:** `web-dapp/context/CitizenContext.tsx`

A React Context that stores the session state in `sessionStorage` (not `localStorage`, so it clears when the tab closes):

```ts
sessionStorage keys:
  'ac_wallet'   → { privateKey, publicKey }
  'ac_tickets'  → [ { ticketId, signature }, ... ]
```

**Key methods:**

| Method | Description |
|---|---|
| `login(wallet, tickets)` | Saves wallet + ticket batch to state and sessionStorage |
| `logout()` | Clears state and sessionStorage |
| `consumeTicket()` | Pops the first ticket off the batch, persists the rest |
| `availableTicketsCount` | How many tickets remain |

The `consumeTicket()` call is irreversible per session — once consumed, the ticket is gone from the browser. Even if the submission fails after this point, the ticket cannot be recovered (by design — the ZKP server has already recorded it as issued).

---

## 5. Backend Relayer (NestJS)

**Location:** `backend-relayer/`  
**Framework:** NestJS (TypeScript)  
**Port:** `3001`  
**Public URL:** `https://relayer.internalbuildtools.online`

### 5.1 What It Is & Why It Exists

Citizens cannot call the smart contract directly because:
1. They don't have ETH to pay gas.
2. We don't want their real Ethereum address on-chain.
3. We need a trusted intermediary to verify ZKP tickets and run AI moderation before anything hits the blockchain.

The relayer is this trusted intermediary. It is the **only** address authorized to call `submitReport()` on the smart contract. It acts as a meta-transaction gateway — it pays the gas on behalf of citizens.

### 5.2 Module Structure

```
src/
├── app.module.ts           — root module, wires everything together
├── main.ts                 — bootstraps NestJS, enables CORS, multipart
├── reporting/
│   ├── reporting.controller.ts   — HTTP route handlers
│   ├── reporting.service.ts      — core submission pipeline logic
│   ├── dto/                      — Data Transfer Objects
│   └── guards/
│       └── citizen-auth.guard.ts — authenticates citizens by signature
├── blockchain/
│   ├── blockchain.service.ts     — ethers.js contract interaction
│   └── Reporting.json            — compiled ABI (copied from Hardhat)
├── ipfs/
│   └── ipfs.service.ts           — uploads report bundle to IPFS node
└── ai-oracle/
    └── ai-oracle.service.ts      — sends content to AI moderation service
```

---

### 5.3 API Endpoints

#### `POST /report`

**Purpose:** The main submission endpoint. Accepts a full report with images and runs the complete 6-step verification pipeline.

**Content-Type:** `multipart/form-data`

**Request Fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | ✅ | Report text (max 1000 chars) |
| `category` | string | ✅ | One of the predefined categories |
| `location` | string | ✅ | JSON string: `{"lat": 3.14, "lng": 101.7, "address": "..."}` |
| `zkpTicketId` | string | ✅ | The `ticketId` from the ZKP ticket batch (bytes32 hex) |
| `zkpSignature` | string | ✅ | Government's ECDSA signature over `ticketId` |
| `citizenPubKey` | string | ✅ | Citizen's Ethereum address (from derived wallet) |
| `signature` | string | ✅ | Citizen's ECDSA signature over the report payload hash |
| `imageHashes` | string | ✅ | JSON array of keccak256 hashes of each WebP image |
| `images` | file[] | ❌ | Up to 5 WebP image files |

**How the frontend prepares the signature:**
```ts
// 1. Hash each WebP image with keccak256
const imageHashes = await Promise.all(images.map(file => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return ethers.keccak256(bytes);
}));

// 2. Compute the payload hash
const messageHash = ethers.solidityPackedKeccak256(
  ['string', 'string', 'string'],
  [description, currentTicket.ticketId, imageHashes.join('')]
);

// 3. Sign with citizen wallet
const signature = await ethersWallet.signMessage(ethers.getBytes(messageHash));
```

**Success Response `201`:**
```json
{
  "success": true,
  "message": "Report successfully validated and accepted.",
  "data": {
    "success": true,
    "submissionStatus": "confirmed_onchain",
    "zkpTicketId": "0xabc123...",
    "ipfsCID": "ipfs://QmXyz...",
    "transactionHash": "0xdef456...",
    "blockNumber": 812
  }
}
```

**Error Responses:**

| Status | Condition |
|---|---|
| `400` | Missing fields, invalid imageHashes JSON, image/hash mismatch |
| `401` | Invalid government ticket signature, invalid citizen signature |
| `400` | AI oracle rejected the content |
| `502` | IPFS upload failed |
| `500` | Blockchain submission failed |

---

#### `GET /report/my-pseudonym`

**Purpose:** Returns the caller's on-chain pseudonym. Used by the My Reports page so it can query `getReportsByCitizen()` on the contract.

**Authentication:** Custom `CitizenAuthGuard` (see §5.5).

**Request Headers:**
```
Authorization: <citizenAddress>:<timestamp>:<signature>
```

Where `signature` is the citizen's ECDSA signature over the string:
```
"get-pseudonym:<citizenAddress>:<timestamp>"
```

**Success Response `200`:**
```json
{
  "pseudonym": "0x3f8a92bc...1d44ef"
}
```

The pseudonym is computed as:
```ts
ethers.keccak256(
  ethers.solidityPacked(
    ['address', 'string'],
    [citizenAddress, 'CivicReport-v1']   // PSEUDONYM_DOMAIN_SALT from .env
  )
)
```

This is the **exact same formula** used inside `submitReport()` service code, so the pseudonym is always consistent between the relayer and the contract.

---

### 5.4 The 6-Step Submission Pipeline

**File:** `backend-relayer/src/reporting/reporting.service.ts`

When `POST /report` is called, these steps execute in sequence:

#### Step 1 — Verify Government Ticket

```ts
const recoveredGovAddress = ethers.verifyMessage(
  ethers.getBytes(zkpTicketId),  // raw bytes of the ticket hash
  zkpSignature
);

if (recoveredGovAddress.toLowerCase() !== GOV_PUBLIC_ADDRESS.toLowerCase()) {
  throw new UnauthorizedException('Invalid or forged government ticket');
}
```

**Why:** Proves the ticket was issued by the real government authority and not fabricated by the citizen. The government's private key is the only key that can produce a valid `zkpSignature` over `zkpTicketId`.

---

#### Step 2 — Verify Image Hashes

```ts
for (let i = 0; i < images.length; i++) {
  const computedHash = ethers.keccak256(images[i].buffer);
  if (computedHash !== parsedImageHashes[i]) {
    throw new UnauthorizedException(`Image at index ${i} tampered in transit`);
  }
}
```

**Why:** The frontend computed `keccak256` hashes of the images **before** uploading. The relayer recomputes them server-side. Any tampering in transit (e.g. a man-in-the-middle swapping an image) will be caught here because the hashes won't match.

---

#### Step 3 — Verify Citizen Payload Signature

```ts
const messageHash = ethers.solidityPackedKeccak256(
  ['string', 'string', 'string'],
  [description, zkpTicketId, imageHashes.join('')]
);

const recoveredCitizenAddress = ethers.verifyMessage(
  ethers.getBytes(messageHash),
  signature
);

if (recoveredCitizenAddress.toLowerCase() !== citizenPubKey.toLowerCase()) {
  throw new UnauthorizedException('Invalid citizen signature. Payload may be tampered.');
}
```

**Why:** Proves the report content (description + ticket + images) was signed by the citizen who owns `citizenPubKey`. No one else could produce a valid signature. This also binds the ticket to this specific report — the same ticket cannot be reused for a different report.

---

#### Step 4 — AI Moderation

```ts
const aiVerdict = await this.aiOracleService.moderateContent(
  description,
  images,
  zkpTicketId,
  signature,
  zkpSignature,
  messageHash
);

if (!aiVerdict.isApproved) {
  throw new BadRequestException(`Content rejected by AI: ${aiVerdict.reason}`);
}
```

The AI oracle returns `{ isApproved: boolean, reason: string }`. If rejected, the pipeline stops here and the ticket is effectively consumed without a blockchain record. See Part 3 for AI oracle details.

---

#### Step 5 — IPFS Upload

```ts
const ipfsStoreResult = await this.ipfsService.uploadComplaint({
  description,
  category,
  location,
  images,
});
const ipfsCID = ipfsStoreResult.ipfsUri;  // e.g. "ipfs://QmXyz..."
```

Sends a `multipart/form-data` POST to the IPFS node at `https://ipfs.internalbuildtools.online/api/ipfs/complaint/store`. The node stores the bundle and returns a CID. See §5.7 for details.

---

#### Step 6 — Blockchain Submission

```ts
const chainResult = await this.blockchainService.submitReportToChain(
  ipfsCID,       // e.g. "ipfs://QmXyz..."
  messageHash,   // bytes32 reportHash
  zkpTicketId,   // bytes32 submissionNullifier
  citizenPseudonym  // bytes32 citizenPseudonym
);
```

Calls `Reporting.submitReport()` on-chain as the relayer wallet. Waits for the transaction to be mined (`.wait()`). Returns `{ transactionHash, blockNumber }`.

---

### 5.5 CitizenAuthGuard — How Pseudonym Auth Works

**File:** `backend-relayer/src/reporting/guards/citizen-auth.guard.ts`

Protects the `GET /report/my-pseudonym` endpoint. Validates the custom `Authorization` header.

**Expected header format:**
```
Authorization: <citizenAddress>:<timestamp>:<signature>
```

**Validation steps:**
1. Split header by `:` — must produce exactly 3 parts.
2. Validate `citizenAddress` is a valid Ethereum address.
3. Parse `timestamp` as integer.
4. Reject if challenge is older than **5 minutes** (`CHALLENGE_TTL_MS = 300_000`).
5. Reconstruct the challenge string: `"get-pseudonym:<citizenAddress>:<timestamp>"`.
6. Call `ethers.verifyMessage(challenge, signature)` to recover the signer.
7. Confirm recovered address === claimed `citizenAddress`.
8. Attach `{ address: recoveredAddress }` to `request.citizen`.

**Why a timestamp?** Prevents replay attacks — a captured `Authorization` header becomes useless after 5 minutes.

---

### 5.6 Blockchain Service

**File:** `backend-relayer/src/blockchain/blockchain.service.ts`

Initialized on module startup with:

```ts
// 1. Connect to Geth node
this.provider = new ethers.JsonRpcProvider(RPC_URL);

// 2. Load relayer wallet (pays gas)
this.relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, this.provider);

// 3. Instantiate contract with relayer as signer
this.reportingContract = new ethers.Contract(
  CONTRACT_ADDRESS,
  ReportingArtifact.abi,
  this.relayerWallet
);
```

**`submitReportToChain()` method:**
```ts
const tx = await this.reportingContract.submitReport(
  ipfsCID,           // string
  reportHashBytes,   // bytes32
  nullifierBytes,    // bytes32
  citizenPseudonym   // bytes32
);
const receipt = await tx.wait();  // waits for block confirmation
return { transactionHash: tx.hash, blockNumber: receipt.blockNumber };
```

**Feature flag:** If `BLOCKCHAIN_SUBMISSION_ENABLED=false`, this method returns immediately with `submissionStatus: 'skipped_blockchain_disabled'` — useful during development when you want to test IPFS/AI without hitting the chain.

---

### 5.7 IPFS Service

**File:** `backend-relayer/src/ipfs/ipfs.service.ts`

Sends the report bundle to the IPFS node using `axios` with `form-data`:

**Upstream endpoint called:**
```
POST https://ipfs.internalbuildtools.online/api/ipfs/complaint/store
```

**Fields sent:**
```
description  (text)
category     (text)
location     (text — JSON string)
images       (binary files, up to 5, MIME: image/webp)
```

**Response expected from IPFS node:**
```json
{ "cid": "QmXyz..." }
```

The service normalizes the CID to `ipfs://QmXyz...` format before returning.

**What the IPFS node stores:** A structured JSON bundle containing the description, category, location, and base64-encoded images — all retrievable later by CID. This is what the frontend fetches via the Next.js IPFS proxy.

---

### 5.8 AI Oracle Service (Relayer side)

**File:** `backend-relayer/src/ai-oracle/ai-oracle.service.ts`

The relayer calls the AI oracle aggregator at:
```
POST https://ai-oracle.internalbuildtools.online/moderate/report
```

**How the request is secured:**

1. Build a **canonical JSON object** (keys sorted alphabetically):
```json
{
  "category": "General Civic Issue",
  "location": "Unknown",
  "media_hashes": ["sha256_hash_1", "sha256_hash_2"],
  "nonce": "uuid-v4",
  "payload_hash": "0xmessageHash",
  "report_id": "RPT-uuid",
  "text_hash": "sha256_of_description",
  "ticket_hash": "0xzkpTicketId",
  "timestamp": "2026-05-13T20:00:00.000Z"
}
```

2. Hash the canonical JSON with SHA-256 → `requestHash`.

3. Sign `requestHash` with the **relayer's Ethereum wallet** → `relayerSignature`.

4. Send as `multipart/form-data` with these headers:
```
x-api-key:             <ORACLE_API_KEY>
x-relayer-signature:   <relayerSignature>
x-request-timestamp:   <timestamp>
x-request-nonce:       <nonce>
```

5. Body fields:
   - `metadata`: JSON string with `report_id`, `text`, `category`, `location`, `ticket_hash`, `payload_hash`, `citizen_signature`, `government_ticket_signature`
   - `files`: image blobs

**Why sign the request?** The AI oracle verifies that only the trusted relayer (whose address is in `TRUSTED_RELAYER_ADDRESS`) can call it. The canonical JSON + nonce + timestamp prevents replay attacks against the oracle.

**AI Oracle Response:**
```json
{
  "final_decision": "ACCEPT",
  "final_confidence": 0.87,
  "risk_level": "LOW",
  "summary_explanation": "Report accepted. Text and media passed moderation checks.",
  "oracle_votes": [...],
  "processing_time_ms": 342.5
}
```

The relayer checks `result.final_decision === 'ACCEPT'`. If not, the submission is rejected with the `summary_explanation` as the error message.
