# AuraChain Local Governance — Part 3: AI Oracle & Web-DApp Frontend

---

## 6. AI Oracle Service

**Location:** `ai-oracle-service/`  
**Framework:** FastAPI (Python)  
**Deployment:** Docker Compose (4 containers)  
**Public URL:** `https://ai-oracle.internalbuildtools.online`

### 6.1 Architecture Overview

The AI Oracle is a **microservices ensemble** — one aggregator that coordinates three specialist oracle services:

```
Relayer
  │
  │ POST /moderate/report
  ▼
Aggregator (port 8000)
  ├─── POST http://oracle-safety:8001/analyze   → Oracle 1: Safety
  ├─── POST http://oracle-spam:8002/analyze     → Oracle 2: Spam/Abuse
  └─── POST http://oracle-civic:8003/analyze    → Oracle 3: Civic Relevance
            │
            ▼
      Aggregate votes → final ACCEPT / REJECT
```

**Why three oracles instead of one?**  
Each oracle specialises in a different failure mode:
- A racist rant could pass civic relevance but fail safety.
- An advertisement could pass safety but fail spam and civic checks.
- An off-topic rant could pass safety and spam but fail civic relevance.

Separating concerns makes the system more robust and easier to tune each oracle independently.

---

### 6.2 Aggregator — Entry Point

**File:** `ai-oracle-service/aggregator/app.py`

#### `POST /moderate/report`

**Purpose:** Main moderation endpoint called by the backend relayer.

**Security checks (in order):**
1. `x-api-key` header must match `ORACLE_API_KEY` env var.
2. `x-relayer-signature` must be present.
3. `x-request-timestamp` must be present and within 300 seconds of server time.
4. `x-request-nonce` must be present and not seen before (stored in SQLite `used_nonces` table).
5. Canonical JSON of the signed request object is SHA-256 hashed → `request_hash`.
6. The relayer's Ethereum address is recovered from the signature over `request_hash`.
7. Recovered address must match `TRUSTED_RELAYER_ADDRESS` env var.

**Request — multipart/form-data:**

| Field | Type | Description |
|---|---|---|
| `metadata` | string (JSON) | Report metadata object |
| `files` | file[] (optional) | Up to 3 image files (JPEG/PNG/WebP, max 5 MB each) |

**Metadata JSON fields:**
```json
{
  "report_id": "RPT-uuid-v4",
  "text": "There is a large pothole on Jalan Ampang...",
  "category": "Road & Traffic",
  "location": "Unknown",
  "ticket_hash": "0xabc123...",
  "payload_hash": "0xdef456...",
  "citizen_signature": "0x...",
  "government_ticket_signature": "0x..."
}
```

**Required metadata fields:** `report_id`, `text`, `category`, `location`, `ticket_hash`, `payload_hash`.

**Headers:**
```
x-api-key:             <ORACLE_API_KEY>
x-relayer-signature:   <ECDSA sig of SHA-256(canonical_request_object)>
x-request-timestamp:   2026-05-13T15:00:00.000Z
x-request-nonce:       uuid-v4
```

**What the aggregator does after security checks:**
1. Processes uploaded files → builds `MediaItem` list (sha256, base64, mime, size).
2. Computes `text_hash = SHA-256(metadata.text)`.
3. Calls all three oracle `/analyze` endpoints **sequentially** with the same `OracleRequest` payload.
4. Aggregates the three votes.
5. Signs the decision object with the aggregator's own Ethereum wallet.
6. Returns the full result.

**Success Response `200`:**
```json
{
  "final_decision": "ACCEPT",
  "final_confidence": 0.8712,
  "risk_level": "LOW",
  "report_hash": "sha256_of_metadata_and_hashes",
  "request_hash": "sha256_of_signed_request_object",
  "decision_hash": "sha256_of_decision_object",
  "aggregator_signature": "0x...",
  "summary_explanation": "Report accepted. Text and media passed moderation checks.",
  "oracle_votes": [
    {
      "oracle_id": "ORACLE_1_SAFETY",
      "vote": "ACCEPT",
      "confidence": 0.92,
      "explanation_code": "TEXT_AND_IMAGES_SAFE",
      "critical_violation": false
    },
    {
      "oracle_id": "ORACLE_2_SPAM_ABUSE",
      "vote": "ACCEPT",
      "confidence": 0.88,
      "explanation_code": "NO_SPAM_DETECTED",
      "critical_violation": false
    },
    {
      "oracle_id": "ORACLE_3_CIVIC_RELEVANCE",
      "vote": "ACCEPT",
      "confidence": 0.79,
      "explanation_code": "SEMANTIC_CIVIC_RELEVANCE_AND_CATEGORY_MATCH",
      "critical_violation": false
    }
  ],
  "security": {
    "relayer_signature_verified": true,
    "recovered_relayer_address": "0x3253678a...",
    "timestamp_validated": true,
    "nonce_accepted": true
  },
  "processing_time_ms": 342.5
}
```

---

### 6.3 Vote Aggregation Logic

```python
def aggregate_votes(oracle_votes):
    accept_count = sum(1 for v in oracle_votes if v["vote"] == "ACCEPT")
    critical_violation = any(v["critical_violation"] is True for v in oracle_votes)

    civic_rejection = any(
        v["oracle_id"] == "ORACLE_3_CIVIC_RELEVANCE"
        and v["vote"] == "REJECT"
        and v["explanation_code"] in ["LOW_CIVIC_RELEVANCE", "NON_CIVIC_CONTENT"]
        for v in oracle_votes
    )

    if critical_violation:
        return "REJECT", "HIGH"          # Any critical violation → immediate reject
    elif civic_rejection:
        return "REJECT", "MEDIUM"        # Not civic → reject
    elif accept_count >= 2:
        return "ACCEPT", "LOW"           # Majority accept → pass
    else:
        return "REJECT", "MEDIUM"        # Majority reject → fail
```

**Rules in plain English:**
- **Any critical violation** (e.g. NSFW image, threat language) → **always REJECT**, regardless of other votes.
- **Oracle 3 rejects as non-civic** → REJECT (even if safety + spam say ACCEPT).
- **2 or more oracles ACCEPT** → ACCEPT.
- **Fewer than 2 ACCEPTs** → REJECT.

---

### 6.4 Oracle 1 — Safety Oracle

**File:** `ai-oracle-service/oracle-safety/app.py`  
**Port:** `8001`  
**Models:** `unitary/toxic-bert` (text) + `Falconsai/nsfw_image_detection` (images)

Checks for toxic/harmful **text** and unsafe/NSFW **images**.

**Text safety thresholds (toxic-bert scores):**

| Label | Reject threshold |
|---|---|
| `toxic` | ≥ 0.70 |
| `severe_toxic` | ≥ 0.60 (also critical) |
| `threat` | ≥ 0.50 (also critical) |
| `identity_hate` | ≥ 0.50 (also critical) |
| `insult` | ≥ 0.80 |
| `obscene` | ≥ 0.80 |

If the AI model fails to load, a **fallback keyword list** is used (`kill`, `bomb`, `attack`, etc. → critical; `idiot`, `hate`, `racist` × 2 → unsafe).

**Image safety:** NSFW score ≥ 0.70 (from `Falconsai/nsfw_image_detection`) → REJECT with `critical_violation: true`.

**Response from `/analyze`:**
```json
{
  "oracle_id": "ORACLE_1_SAFETY",
  "vote": "ACCEPT",
  "confidence": 0.9241,
  "explanation_code": "TEXT_AND_IMAGES_SAFE",
  "model_name": "unitary/toxic-bert + Falconsai/nsfw_image_detection",
  "model_version": "1.0.0",
  "critical_violation": false,
  "details": {
    "text_result": { "safe": true, "confidence": 0.92, ... },
    "image_result": { "safe": true, "confidence": 0.95, ... }
  }
}
```

---

### 6.5 Oracle 2 — Spam & Abuse Oracle

**File:** `ai-oracle-service/oracle-spam/app.py`  
**Port:** `8002`  
**Model:** `mrm8488/bert-tiny-finetuned-sms-spam-detection`

Uses a **hybrid** approach — AI model + rule-based scoring.

**Rule-based spam signals:**

| Signal | Score added |
|---|---|
| Fewer than 5 words | +0.35 |
| Spam phrase detected (`buy now`, `free money`, etc.) | +0.80 |
| Promotional words (`discount`, `offer`, etc.) | +0.35 |
| More than 1 URL | +0.60 |
| 1 URL | +0.25 |
| Repeated character pattern (e.g. `aaaaaaa`) | +0.50 |
| Excessive symbols (> 10 of `!@#$%^&*`) | +0.40 |

**Combined decision logic:**

| Condition | Result |
|---|---|
| AI spam probability ≥ 0.85 | REJECT (strong AI signal) |
| Rule score ≥ 0.60 | REJECT (rule-based) |
| AI ≥ 0.65 AND rule score ≥ 0.25 | REJECT (joint signal) |
| None of the above | ACCEPT |

`critical_violation` is always `false` for this oracle — spam is never a critical safety issue.

---

### 6.6 Oracle 3 — Civic Relevance Oracle

**File:** `ai-oracle-service/oracle-civic/app.py`  
**Port:** `8003`  
**Model:** `sentence-transformers/all-MiniLM-L6-v2`

Checks whether the report text actually describes a **real civic/governance issue** — not a personal complaint, advertisement, or random text.

**How it works:**
1. Encodes the report text as a semantic embedding using the sentence-transformer model.
2. Compares it (cosine similarity) against a library of **30 reference descriptions** covering 10 civic categories (Road Damage, Waste Management, Streetlight Issue, Drainage, Water Supply, Flooding, Public Property Damage, Traffic Safety, Environmental Issue, General Civic).
3. Finds the overall best match and the best match within the user's selected category.

**Decision rules:**

| Condition | Code | Vote |
|---|---|---|
| Overall similarity < 0.38 | `LOW_SEMANTIC_CIVIC_RELEVANCE` | REJECT |
| Similarity ≥ 0.38 AND selected category matches (≥ 0.40) | `SEMANTIC_CIVIC_RELEVANCE_AND_CATEGORY_MATCH` | ACCEPT |
| Similarity ≥ 0.38 BUT category doesn't match (generic) | `SEMANTIC_CIVIC_RELEVANCE_CATEGORY_MISMATCH_OR_GENERIC_CATEGORY` | ACCEPT |

If the semantic model fails to load, a **keyword fallback** is used (lists of civic keywords per category).

`critical_violation` is always `false`. However, a REJECT from this oracle with code `LOW_CIVIC_RELEVANCE` or `NON_CIVIC_CONTENT` causes the aggregator to always reject, regardless of the other two oracles' votes.

---

## 7. Web-DApp Frontend

**Location:** `web-dapp/`  
**Framework:** Next.js 15 (App Router, TypeScript)  
**Port:** `3000`

### 7.1 Pages Overview

| Route | Page | Auth required |
|---|---|---|
| `/` | Landing / Home | No |
| `/auth` | GovID Login | No |
| `/feed` | Community Feed | No (read-only) |
| `/issues/[id]` | Report Detail | No (read-only) |
| `/report` | Submit Report | Yes (wallet + ticket) |
| `/my-reports` | My Reports | Yes (wallet) |
| `/dashboard` | Dashboard | — |
| `/polls` | Polls | — |
| `/profile` | Profile | — |

---

### 7.2 Auth Page — `/auth`

**File:** `web-dapp/app/auth/page.tsx`

**What happens step by step:**
1. Citizen enters GovID (12 digits) + password.
2. `POST https://zkp.internalbuildtools.online/api/govid/verify-citizen` is called.
3. On success, `citizenSeed` is received along with `ticketBatch` (array of `{ticketId, signature}`).
4. `deriveCitizenWallet(citizenSeed)` derives the Ethereum wallet client-side.
5. `login(citizenWallet, ticketBatch)` saves both to `CitizenContext` + `sessionStorage`.
6. Redirect to `/feed` after 1.5s (with "Proof Generating…" animation).

**Key state:**
- `isGenerating: boolean` — shows the ZKP animation while processing.
- On error, the error message from the server is shown inline.

---

### 7.3 Report Submission Page — `/report`

**File:** `web-dapp/app/report/page.tsx`

**Available categories:**
`Infrastructure Damage`, `Public Safety`, `Environmental Issue`, `Road & Traffic`, `Utilities Outage`, `Illegal Activity`, `Other`

**Image handling:**
- Max 5 images. Any JPEG/PNG is automatically converted to WebP at 0.8 quality using a canvas element.
- Each WebP image is hashed with `keccak256` (via ethers.js) **before** upload.

**Submit flow:**
1. `consumeTicket()` — pops first ticket from context (irreversible).
2. Compute `keccak256` hash of each WebP file.
3. Build `messageHash = solidityPackedKeccak256(['string','string','string'], [description, ticketId, imageHashes.join('')])`.
4. Sign `messageHash` bytes with citizen's private key.
5. Build `FormData` with all fields + image files.
6. `POST ${RELAYER_URL}/report` — sends to backend relayer.
7. On success, show confirmation with remaining ticket count.

**Location picker:** Uses Leaflet.js (dynamically imported, SSR disabled) via `LocationPicker` component. Returns `{ lat, lng, address }` — serialised as JSON string in `location` field.

---

### 7.4 Community Feed — `/feed`

**File:** `web-dapp/app/feed/page.tsx`

**Data source:** Reads directly from the smart contract via `ethers.JsonRpcProvider` (no relayer involved — this is a public read).

**ABI used (minimal human-readable ABI):**
```ts
"function getAllReports(uint256 offset, uint256 limit) view returns (
  tuple(uint256 id, string ipfsCid, ..., tuple(...) votes)[] page,
  uint256 total
)"
```

**Two-phase loading:**

| Phase | What loads | When |
|---|---|---|
| Phase 1 | `id`, `ipfsCid`, `status`, `createdAt`, `votes` | Immediately from contract |
| Phase 2 | `description`, `category`, `location`, `imageUrl` | Async from IPFS proxy |

Phase 1 is instant (blockchain read). Phase 2 fetches IPFS metadata in parallel for all 20 reports. Cards show a loading spinner overlay until `ipfsLoaded: true`.

**IPFS metadata fetch (client-side):**
```ts
const res = await fetch(`/api/ipfs/${cid}`);
const data = await res.json();
// data.description, data.category, data.location, data.images[0]
```

**Visual display logic per card:**
- If `imageUrl` exists → show image.
- Else if `coordinates` exist → show `MapPreview` (static Leaflet tile).
- Else → show "No Media" placeholder.

**Status badge mapping:**

| Code | Label | Color |
|---|---|---|
| 0 | Pending Validation | Amber |
| 1 | Community Rejected | Red |
| 2 | Open | Blue |
| 3 | In Progress | Indigo |
| 4 | Rejection Under Review | Orange |
| 5 | Pending Verification | Purple |
| 6 | Closed / Solved | Green |
| 7 | Reopened | Slate |

**Pagination:** `offset` + `limit=20`. Previous/Next buttons update `offset` state and trigger a re-fetch.

---

### 7.5 Issue Detail Page — `/issues/[id]`

**File:** `web-dapp/app/issues/[id]/page.tsx`

Fetches a single report by its on-chain ID using:
```ts
contract.getReport(Number(id))
```

Then fetches IPFS metadata via `/api/ipfs/${cid}` for description, category, location, and full image array.

**Desktop layout (2-column grid):**
- **Left column:** Hero image/map, status badge, category, description, evidence gallery (all images in 2-col grid).
- **Right column (sticky):** Democratic Voting panel (upvote/downvote buttons, consensus % progress bar), Assigned Authority panel.

**Mobile layout:** Single column — hero image at top, description card, meta card (location, timestamp, IPFS CID).

**Consensus percentage:**
```ts
const pct = Math.round((upvotes / (upvotes + downvotes)) * 100);
```
Displayed as a progress bar with the percentage.

> **Note:** The vote buttons on the UI (`Legitimate` / `Spam-Invalid`) are currently UI-only — they set local state but do not call the contract (voting functions are `TODO` in Solidity).

---

### 7.6 My Reports Page — `/my-reports`

**File:** `web-dapp/app/my-reports/page.tsx`

This page combines **relayer authentication + contract read** to show only the current citizen's reports.

**Load sequence:**
1. Create an `ethers.Wallet` from `wallet.privateKey`.
2. Sign the challenge: `"get-pseudonym:<publicKey>:<timestamp>"`.
3. `GET ${RELAYER_URL}/report/my-pseudonym` with `Authorization: <publicKey>:<timestamp>:<signature>`.
4. Receive `{ pseudonym: "0x..." }` — the citizen's on-chain bytes32 identifier.
5. Call `contract.getReportsByCitizen(pseudonym, 0, 50)` directly via RPC.
6. Fetch IPFS metadata for each report in parallel.

**Desktop layout:** Stats row (total/resolved/active) + table view with search + filter tabs.

**Mobile layout:** Card list with status badges and progress bars.

**Filter tabs:** `All`, `In Progress` (statuses 2/3/4/5), `Resolved` (status 6).

**Progress bar values per status:**

| Status | Progress |
|---|---|
| 0 (Pending Validation) | 15% |
| 2 (Open) | 40% |
| 3 (In Progress) | 65% |
| 4 (Rejection Review) | 30% |
| 5 (In Review) | 85% |
| 6 (Resolved) | 100% |

---

### 7.7 IPFS Proxy — `/api/ipfs/[cid]`

**File:** `web-dapp/app/api/ipfs/[cid]/route.ts`

A Next.js **server-side API route** that proxies IPFS requests. This exists because the IPFS node does not have CORS headers that allow browser-direct requests — so the Next.js server acts as an intermediary.

**Request:** `GET /api/ipfs/<CID>`

**What it does:**
```ts
const upstream = await fetch(
  `${IPFS_BASE_URL}/api/ipfs/complaint/${cid}`,
  { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) }
);
return NextResponse.json(data, { status: upstream.status });
```

**Upstream URL:** `https://ipfs.internalbuildtools.online/api/ipfs/complaint/<CID>`

**Response from IPFS node (passed through):**
```json
{
  "success": true,
  "description": "Large pothole on Jalan Ampang...",
  "category": "Road & Traffic",
  "location": "{\"lat\":3.14,\"lng\":101.7,\"address\":\"Jalan Ampang, KL\"}",
  "images": [
    {
      "data": "base64encodedstring...",
      "mimeType": "image/webp",
      "originalName": "photo.webp"
    }
  ]
}
```

Images are returned as base64 strings and rendered directly as `data:image/webp;base64,...` URIs in the browser.

---

### 7.8 Map Components

**LocationPicker** (`components/LocationPicker.tsx`):
- Full interactive Leaflet map for the report submission page.
- Citizen clicks to pin a location, or searches by address using Nominatim (OpenStreetMap geocoding).
- Returns `{ lat, lng, address }` via `onChange` prop.
- Dynamically imported (`ssr: false`) to avoid Next.js server-side rendering issues with `window`.

**MapPreview** (`components/MapPreview.tsx`):
- Lightweight read-only Leaflet map tile used in feed cards and report detail pages.
- Accepts `{ lat, lng, interactive? }` props.
- In the feed, `interactive=false` (static tile). In report detail desktop, `interactive=true`.

---

## 8. End-to-End Flows Summary

### 8.1 Citizen Login Flow

```
1. Browser → POST /api/govid/verify-citizen { govId, password }
2. ZKP Server verifies credentials in SQLite
3. ZKP Server generates 10 signed tickets using gov wallet
4. Browser receives { citizenSeed, ticketBatch }
5. Browser: privateKey = keccak256(citizenSeed)
6. Browser: wallet = new ethers.Wallet(privateKey)
7. CitizenContext.login(wallet, ticketBatch) → sessionStorage
8. Redirect to /feed
```

### 8.2 Report Submission Flow

```
1. Citizen fills form: category, description, images, location
2. Browser: images → compress to WebP (canvas, 0.8 quality)
3. Browser: imageHashes = images.map(img => keccak256(img.bytes))
4. Browser: ticket = CitizenContext.consumeTicket()
5. Browser: messageHash = solidityPackedKeccak256(description, ticketId, imageHashes.join(''))
6. Browser: signature = wallet.signMessage(messageHash.bytes)
7. Browser → POST /report (FormData with all fields + images)
   │
   ├─ Relayer Step 1: verifyMessage(ticketId.bytes, zkpSignature) === GOV_ADDRESS
   ├─ Relayer Step 2: keccak256(image.buffer) === imageHashes[i] for each image
   ├─ Relayer Step 3: verifyMessage(messageHash.bytes, signature) === citizenPubKey
   ├─ Relayer Step 4: POST /moderate/report to AI Oracle
   │    ├─ Oracle 1: toxic-bert + NSFW detection
   │    ├─ Oracle 2: spam model + rules
   │    └─ Oracle 3: semantic civic relevance
   ├─ Relayer Step 5: POST /api/ipfs/complaint/store → get CID
   └─ Relayer Step 6: contract.submitReport(ipfsCID, messageHash, ticketId, pseudonym)
              │
              └─ On-chain: nullifier flagged, report stored, event emitted
8. Browser receives { transactionHash, blockNumber, ipfsCID }
```

### 8.3 Feed / Read Flow

```
1. Browser: ethers.JsonRpcProvider(RPC_URL)
2. Browser: contract.getAllReports(offset=0, limit=20) → page[], total
3. Browser: renders base cards immediately (id, status, timestamps, votes)
4. Browser: for each card, GET /api/ipfs/${cid} (server-side proxy)
5. Next.js server: fetches from IPFS node, returns JSON
6. Browser: enriches cards with description, category, location, image
```

### 8.4 My Reports Flow

```
1. Browser: signs challenge "get-pseudonym:<address>:<timestamp>"
2. Browser → GET /report/my-pseudonym (Authorization header)
3. Relayer CitizenAuthGuard: verifies signature, TTL, address
4. Relayer: keccak256(address + PSEUDONYM_DOMAIN_SALT) → pseudonym
5. Browser receives { pseudonym: "0x..." }
6. Browser: contract.getReportsByCitizen(pseudonym, 0, 50) → reports[]
7. Browser: enriches with IPFS metadata (parallel fetch)
```

---

## 9. Key Design Decisions

| Decision | Reason |
|---|---|
| Clique PoA instead of PoW/PoS | Zero gas cost for citizens, fast deterministic finality, permissioned access |
| Pseudonym instead of real address | Privacy — pseudonym is one-way derived, unlinkable on-chain |
| ZKP ticket as nullifier | One ticket = one submission; replay attacks blocked both on-chain and off |
| Image → WebP compression client-side | Reduces upload size; keccak256 pre-hash prevents man-in-the-middle image swap |
| Three-oracle AI ensemble | Each oracle independently specialises; a single model would have blind spots |
| Next.js IPFS proxy route | Browser CORS blocks direct IPFS node access; server-side proxy is transparent |
| NestJS relayer as meta-transaction gateway | Citizens never need ETH; relayer pays gas; single point of trust enforcement |
| `sessionStorage` for wallet/tickets | Auto-clears on tab close — no persistent wallet storage; reduces attack surface |
| Canonical JSON for oracle signing | Prevents signature manipulation by reordering JSON keys |
| `solidityPackedKeccak256` for report hash | Matches Solidity's `abi.encodePacked` exactly — ensures on-chain verifiability |
