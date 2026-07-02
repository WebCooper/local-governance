# AuraChain Local Governance — Part 4: Cross-Service Workflows & Integration

---

## 1. Service Dependency Map

Every service depends on some other service. Here is who calls whom:

```
web-dapp (Next.js)
  │
  ├──► zkp-govid-simulator    [login only]  POST /api/govid/verify-citizen
  │
  ├──► backend-relayer         [submit]      POST /report
  │         │
  │         ├──► ai-oracle-service           POST /moderate/report
  │         │         └──► oracle-safety     POST /analyze  (internal Docker)
  │         │         └──► oracle-spam       POST /analyze  (internal Docker)
  │         │         └──► oracle-civic      POST /analyze  (internal Docker)
  │         │
  │         ├──► IPFS node                   POST /api/ipfs/complaint/store
  │         │
  │         └──► blockchain (Geth)           eth_sendRawTransaction
  │
  ├──► blockchain (Geth)       [read-only]   eth_call  (feed, detail, my-reports)
  │
  └──► Next.js IPFS proxy      [read-only]   GET /api/ipfs/[cid]
            └──► IPFS node                   GET /api/ipfs/complaint/:cid
```

The `web-dapp` is the **only entry point for citizens**. Nothing else is exposed publicly except:
- ZKP server (for login)
- Relayer (for submit + pseudonym)
- Geth RPC (for public reads)
- IPFS node (via Next.js proxy only — not called directly by browser)

---

## 2. Shared Data Contracts (What Each Service Passes to the Next)

### 2.1 ZKP Simulator → Web-DApp

**What is shared:**
```json
{
  "citizenSeed": "some-secret-string",
  "ticketBatch": [
    { "ticketId": "0xabc...", "signature": "0x123..." }
  ]
}
```

**Who uses what:**
- `citizenSeed` → `walletUtils.deriveCitizenWallet()` → `privateKey` + `publicKey` (Ethereum address). The seed is discarded after derivation; only the wallet is kept.
- `ticketBatch` → stored in `CitizenContext` + `sessionStorage` as `ac_tickets`. Consumed one-by-one per report submission.
- `ticketId` → used as `zkpTicketId` in the relayer POST body AND as `submissionNullifier` on-chain.
- `signature` → used as `zkpSignature` in the relayer POST body. The relayer verifies it against `GOV_PUBLIC_ADDRESS`.

**Connection point in code:**
```ts
// web-dapp/app/auth/page.tsx
const citizenWallet = deriveCitizenWallet(data.citizenSeed);
login(citizenWallet, data.ticketBatch);
```

---

### 2.2 Web-DApp → Backend Relayer

**What is shared** (multipart/form-data to `POST /report`):

| Field | Produced by | Consumed by relayer for |
|---|---|---|
| `description` | Citizen types it | AI oracle text hash, citizen sig verification, IPFS upload |
| `category` | Citizen selects | IPFS upload, AI oracle metadata |
| `location` | LocationPicker JSON | IPFS upload |
| `zkpTicketId` | ZKP ticket batch | Gov signature verification, submission nullifier on-chain |
| `zkpSignature` | ZKP ticket batch | Gov signature verification (Step 1) |
| `citizenPubKey` | Derived wallet `.address` | Citizen signature recovery (Step 3), pseudonym derivation |
| `signature` | `wallet.signMessage(messageHash)` | Citizen payload integrity verification (Step 3) |
| `imageHashes` | `keccak256(webpBytes)[]` | Hash integrity check vs uploaded images (Step 2) |
| `images` | WebP files | Hash verification, AI moderation, IPFS upload |

**Connection point in code:**
```ts
// web-dapp/app/report/page.tsx
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL;
const response = await fetch(`${RELAYER_URL}/report`, { method: 'POST', body: formData });
```

**How the messageHash ties everything together:**
```
messageHash = solidityPackedKeccak256(
  ['string', 'string', 'string'],
  [description, zkpTicketId, imageHashes.join('')]
)
```
This single hash commits to the **entire payload**. It:
- Is signed by the citizen → proves authorship.
- Is sent to the AI oracle as `payload_hash` → oracle can reference it.
- Is stored on-chain as `reportHash` → permanent proof of exact report content.

---

### 2.3 Backend Relayer → AI Oracle Aggregator

**What is shared** (multipart/form-data to `POST /moderate/report`):

**Headers:**
```
x-api-key:            ORACLE_API_KEY (shared secret in both .env files)
x-relayer-signature:  ECDSA sig of SHA256(canonicalRequestObject)
x-request-timestamp:  ISO timestamp
x-request-nonce:      UUID v4
```

**Body:**
```json
{
  "metadata": {
    "report_id": "RPT-<uuid>",
    "text": "<description>",
    "category": "General Civic Issue",
    "location": "Unknown",
    "ticket_hash": "<zkpTicketId>",
    "payload_hash": "<messageHash>",
    "citizen_signature": "<signature>",
    "government_ticket_signature": "<zkpSignature>"
  },
  "files": [ ...image blobs... ]
}
```

**What the oracle returns that matters:**
```json
{ "final_decision": "ACCEPT", "summary_explanation": "..." }
```

The relayer only checks `final_decision === 'ACCEPT'`. Everything else is logged.

**Connection point in code:**
```ts
// backend-relayer/src/ai-oracle/ai-oracle.service.ts
const response = await fetch(
  'https://ai-oracle.internalbuildtools.online/moderate/report',
  { method: 'POST', headers: { 'x-api-key': ..., 'x-relayer-signature': ... }, body: formData }
);
const result = await response.json();
return { isApproved: result.final_decision === 'ACCEPT', reason: result.summary_explanation };
```

**Shared secret:** `ORACLE_API_KEY` must be identical in:
- `backend-relayer/.env` → `ORACLE_API_KEY`
- `ai-oracle-service/aggregator` environment (Docker Compose)

**Shared address:** `RELAYER_PRIVATE_KEY` is in the relayer `.env`. Its derived Ethereum address (`wallet.address`) must match `TRUSTED_RELAYER_ADDRESS` in the aggregator environment.

---

### 2.4 AI Oracle Aggregator → Three Sub-Oracles

**What is shared** (JSON POST to each oracle's `/analyze`):
```json
{
  "metadata": { "text": "...", "category": "...", ... },
  "media": [
    {
      "file_name": "photo.webp",
      "mime_type": "image/webp",
      "sha256": "abc123...",
      "base64": "iVBORw...",
      "size_bytes": 45231
    }
  ],
  "text_hash": "sha256_of_text",
  "media_hashes": ["sha256_1", "sha256_2"],
  "report_hash": "sha256_of_full_bundle",
  "request_hash": "sha256_of_signed_request"
}
```

All three oracles receive the **same payload**. Each independently returns:
```json
{
  "oracle_id": "ORACLE_1_SAFETY",
  "vote": "ACCEPT",
  "confidence": 0.92,
  "explanation_code": "TEXT_AND_IMAGES_SAFE",
  "critical_violation": false,
  "details": { ... }
}
```

**Docker internal hostnames** (from `docker-compose.yml`):
```
http://oracle-safety:8001/analyze
http://oracle-spam:8002/analyze
http://oracle-civic:8003/analyze
```

These are not publicly exposed — only the aggregator can reach them on the internal Docker network.

---

### 2.5 Backend Relayer → IPFS Node

**What is shared** (multipart/form-data to `/api/ipfs/complaint/store`):

```
description  →  text field
category     →  text field
location     →  text field (JSON string)
images       →  binary files (WebP)
```

**What comes back:**
```json
{ "cid": "QmXyz..." }
```

The CID is normalized to `ipfs://QmXyz...` and:
- Stored on-chain as `ipfsCid` in the `Report` struct.
- Returned to the citizen in the success response.
- Later used by the frontend to fetch report metadata.

**Connection point in code:**
```ts
// backend-relayer/src/ipfs/ipfs.service.ts
const response = await axios.post(
  process.env.IPFS_COMPLAINT_STORE_ENDPOINT,  // https://ipfs.../api/ipfs/complaint/store
  formData,
  { headers: formData.getHeaders(), timeout: 30000 }
);
const cid = response.data?.cid;
```

---

### 2.6 Backend Relayer → Blockchain (Geth)

**What is shared** (via ethers.js contract call):

```ts
contract.submitReport(
  ipfsCID,          // string  — "ipfs://QmXyz..."
  reportHashBytes,  // bytes32 — solidityPackedKeccak256 of payload
  nullifierBytes,   // bytes32 — zkpTicketId (one-time use)
  citizenPseudonym  // bytes32 — keccak256(citizenAddress + DOMAIN_SALT)
)
```

**What comes back:**
```ts
{ transactionHash: "0xdef...", blockNumber: 812 }
```

**Shared config:**
- `RPC_URL` — Geth node JSON-RPC endpoint (same URL used by web-dapp for reads).
- `CONTRACT_ADDRESS` — deployed `Reporting.sol` address (must match `NEXT_PUBLIC_CONTRACT_ADDRESS` in web-dapp).
- `RELAYER_PRIVATE_KEY` — must match the address in `authorizedRelayers` mapping in the contract.

---

### 2.7 Web-DApp → Blockchain (Direct Read)

The frontend calls the contract **directly** for read-only operations. No relayer is involved.

```ts
// web-dapp/app/feed/page.tsx and issues/[id]/page.tsx and my-reports/page.tsx
const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
```

**Calls made by each page:**

| Page | Contract call | Returns |
|---|---|---|
| `/feed` | `getAllReports(offset, 20)` | `Report[]`, `total` |
| `/issues/[id]` | `getReport(id)` | Single `Report` |
| `/my-reports` | `getReportsByCitizen(pseudonym, 0, 50)` | `Report[]`, `total` |

**Why no relayer for reads?** The relayer only exists to handle **writes** (gas payment + verification). Reads are free on any Ethereum-compatible node — the web-dapp calls the Geth RPC directly using the public ABI.

---

### 2.8 Web-DApp → IPFS Node (via Next.js Proxy)

The browser never calls the IPFS node directly — it calls the Next.js proxy which then calls the IPFS node server-side.

```
Browser → GET /api/ipfs/QmXyz...
            ↓ (Next.js server)
          GET https://ipfs.internalbuildtools.online/api/ipfs/complaint/QmXyz...
            ↓
          JSON response passed back to browser
```

**Why the proxy?** The IPFS node at `51.210.111.188:4000` does not include CORS headers that allow browser-originated cross-origin requests. The Next.js server-side route has no CORS restrictions because it's a server-to-server call.

**Connection point in code:**
```ts
// web-dapp/app/api/ipfs/[cid]/route.ts
const upstream = await fetch(`${IPFS_BASE_URL}/api/ipfs/complaint/${cid}`);
return NextResponse.json(await upstream.json(), { status: upstream.status });
```

---

## 3. Environment Variable Dependency Matrix

This table shows which env vars are shared or must match across services:

| Variable | Set in | Used in | Must match |
|---|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | web-dapp `.env.local` | ethers.js provider | Same Geth node as relayer |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | web-dapp `.env.local` | ethers.js contract | Same as relayer `CONTRACT_ADDRESS` |
| `NEXT_PUBLIC_RELAYER_URL` | web-dapp `.env.local` | fetch() calls | Relayer public URL |
| `CONTRACT_ADDRESS` | relayer `.env` | BlockchainService | Same as `NEXT_PUBLIC_CONTRACT_ADDRESS` |
| `RPC_URL` | relayer `.env` | BlockchainService | Geth node endpoint |
| `RELAYER_PRIVATE_KEY` | relayer `.env` | BlockchainService + AiOracleService | Address must be in `authorizedRelayers` on-chain AND match `TRUSTED_RELAYER_ADDRESS` in oracle |
| `GOV_PUBLIC_ADDRESS` | relayer `.env` | ReportingService Step 1 | Must equal ZKP server's gov wallet address |
| `PSEUDONYM_DOMAIN_SALT` | relayer `.env` | ReportingService (pseudonym) | Must be constant — changing breaks all existing pseudonym lookups |
| `ORACLE_API_KEY` | relayer `.env` + oracle env | AiOracleService + aggregator | Must be identical |
| `TRUSTED_RELAYER_ADDRESS` | oracle aggregator env | verify_relayer_signature() | Must equal relayer wallet address derived from `RELAYER_PRIVATE_KEY` |
| `IPFS_UPLOAD_ENDPOINT` | relayer `.env` | IpfsService | IPFS node upload URL |
| `NEXT_PUBLIC_IPFS_URL` | web-dapp `.env.local` | IPFS proxy route | IPFS node base URL |

---

## 4. The Pseudonym — How It Stays Consistent Across Services

The citizen pseudonym is the key that links the citizen's submissions together without revealing identity. It must be computed the same way everywhere:

```
pseudonym = keccak256(abi.encodePacked(citizenAddress, "CivicReport-v1"))
```

**Where it is computed:**

| Location | Code | When |
|---|---|---|
| Relayer `reporting.service.ts` | `ethers.keccak256(ethers.solidityPacked(['address','string'], [citizenPubKey, PSEUDONYM_DOMAIN_SALT]))` | During `POST /report` — stored on-chain |
| Relayer `reporting.service.ts` | Same formula | During `GET /report/my-pseudonym` — returned to frontend |
| Smart contract `Reporting.sol` | `citizenPseudonym` parameter accepted as-is | Not recomputed on-chain — relayer is trusted |

**Why the relayer computes it instead of the contract:**  
The contract cannot verify the derivation — it just stores whatever `bytes32` the relayer sends. The relayer is the **trusted party** that has already verified the citizen's identity through the ZKP ticket. The salt `CivicReport-v1` is a domain separator that prevents the same Ethereum address from being pseudonymous-linked across different applications.

---

## 5. The Nullifier — How Replay Is Blocked Across Services

```
zkpTicketId (issued by ZKP server)
    │
    ├── Frontend: consumeTicket() removes it from session
    │
    ├── Relayer Step 1: verifies gov signature over ticketId
    │       → Proves ticket is real
    │
    ├── Relayer Step 3: messageHash includes ticketId
    │       → Binds ticket to this specific report content
    │
    ├── AI Oracle: receives ticketId as ticket_hash in metadata
    │       → Oracle logs it for audit trail
    │
    └── Smart Contract: usedSubmissionNullifiers[ticketId] = true
            → Permanent on-chain replay block
```

A captured ticket cannot be replayed because:
1. The citizen's `signature` binds it to a specific `description` + `imageHashes`. Changing any field breaks the signature.
2. Even if the entire request is replayed verbatim, the on-chain nullifier check rejects it with `NullifierAlreadyUsed()`.

---

## 6. Report Content Integrity Chain

The `reportHash` (stored on-chain) creates a cryptographic chain from the citizen's input all the way to the blockchain:

```
description + zkpTicketId + imageHashes.join('')
        │
        ▼  solidityPackedKeccak256(['string','string','string'], ...)
   messageHash  ←── citizen signs this with their wallet
        │
        ├── relayer verifies signature (Step 3)
        ├── sent to AI oracle as payload_hash
        └── stored on-chain as reportHash (bytes32)

Images
   │
   ▼  keccak256(imageBytes)  ← computed client-side before upload
imageHashes[]  ←── included in messageHash (so tampering breaks sig)
   │
   └── relayer recomputes keccak256(image.buffer) and checks match (Step 2)
```

If anyone tampers with the description, images, or ticket between the citizen's browser and the relayer, the signature verification in Step 3 will fail. If the images are swapped but the text is kept, Step 2 will fail (hash mismatch). The chain is unbreakable end-to-end.

---

## 7. Deployment Topology

```
Internet
  │
  ├── web-dapp        → Vercel / Docker container (port 3000)
  │
  ├── zkp-govid-simulator  → VPS (port 5000)
  │       └── SQLite DB (citizens, issued_tickets)
  │
  ├── backend-relayer → VPS (port 3001)
  │
  ├── ai-oracle-service → VPS with Docker Compose
  │       ├── aggregator    (port 8000, publicly accessible)
  │       ├── oracle-safety (port 8001, internal only)
  │       ├── oracle-spam   (port 8002, internal only)
  │       └── oracle-civic  (port 8003, internal only)
  │               └── /data/nonces.db (SQLite, nonce deduplication)
  │
  ├── IPFS node       → VPS (port 4000)
  │
  └── Geth network    → 3 VPS nodes (ports 8545 RPC, 30303 P2P)
          ├── Node 1 (sealer + RPC)
          ├── Node 2 (sealer)
          └── Node 3 (sealer)
```

**Public URLs (production):**
- Web-DApp: (hosted separately)
- ZKP Server: `https://zkp.internalbuildtools.online`
- Relayer: `https://relayer.internalbuildtools.online`
- AI Oracle: `https://ai-oracle.internalbuildtools.online`
- IPFS Node: `https://ipfs.internalbuildtools.online`
- Geth RPC: `https://rpc.internalbuildtools.online`

**Local development URLs:**
- ZKP Server: `http://localhost:5000`
- Relayer: `http://localhost:3001`
- Geth: `http://localhost:8545`

---

## 8. Docker Compose — AI Oracle Internal Networking

The four AI oracle containers share an internal Docker network. The aggregator reaches the sub-oracles by Docker service name:

```yaml
# ai-oracle-service/docker-compose.yml
services:
  aggregator:
    ports: ["8000:8000"]        # only aggregator is publicly exposed
  oracle-safety:
    ports: ["8001:8001"]        # internal only
  oracle-spam:
    ports: ["8002:8002"]        # internal only
  oracle-civic:
    ports: ["8003:8003"]        # internal only
```

The aggregator uses these hardcoded internal URLs:
```python
ORACLE_URLS = {
    "safety": "http://oracle-safety:8001/analyze",
    "spam":   "http://oracle-spam:8002/analyze",
    "civic":  "http://oracle-civic:8003/analyze",
}
```

The sub-oracles are **not reachable from outside Docker** — only the aggregator can call them. This means even if someone knows the oracle API key, they cannot directly bypass the aggregator's security checks to manipulate individual oracle votes.

---

## 9. Where Each Config Value Is Used (Quick Reference)

| Config value | Lives in | Used by | Purpose |
|---|---|---|---|
| Gov wallet private key | ZKP simulator `.env` | Signs every ticket | Proves ticket authenticity |
| Gov wallet address | Relayer `.env` as `GOV_PUBLIC_ADDRESS` | Step 1 verification | Confirm ticket is from real gov |
| Citizen private key | Browser `sessionStorage` only | Signs report payload | Proves report authorship |
| Citizen public key (address) | Browser → sent to relayer as `citizenPubKey` | Step 3 recovery check | Identify which wallet signed |
| `PSEUDONYM_DOMAIN_SALT` | Relayer `.env` | Pseudonym derivation | Privacy separator |
| `RELAYER_PRIVATE_KEY` | Relayer `.env` | Signs txs + oracle requests | Pay gas + authenticate to oracle |
| `ORACLE_API_KEY` | Relayer + Oracle `.env` | Request authentication | Prevent unauthorized oracle use |
| `TRUSTED_RELAYER_ADDRESS` | Oracle aggregator `.env` | Verify relayer signature | Only allow trusted relayer |
| `CONTRACT_ADDRESS` | Relayer + Web-DApp `.env` | ethers.Contract init | Point to correct deployed contract |
| IPFS CID | IPFS node → relayer → on-chain | Frontend IPFS proxy | Link chain record to IPFS content |
