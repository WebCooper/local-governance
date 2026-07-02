# AuraChain Local Governance — Part 5: Developer Setup, Internals & Database Schema

---

## 1. Local Development — Startup Order

Services must be started in this order because each depends on the one before it being ready:

```
1. Geth Private Network   (blockchain must be running first)
2. Smart Contract Deploy  (contract must exist before relayer needs its address)
3. ZKP GovID Simulator    (must be up before the frontend can log anyone in)
4. Backend Relayer         (depends on Geth + AI Oracle + IPFS)
5. AI Oracle Service       (can start in parallel with relayer)
6. Web-DApp                (depends on all of the above)
```

---

### 1.1 Start the Private Geth Network

```bash
cd blockchain
docker-compose up -d
```

This starts 3 Geth nodes (Node 1, 2, 3) using Clique PoA consensus. Node 1 exposes the JSON-RPC at port `8545`.

**Verify it's running:**
```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
# Should return a block number (increases every ~20 seconds)
```

**Local RPC URL:** `http://127.0.0.1:8545`

---

### 1.2 Deploy the Smart Contract (first time only)

```bash
cd smart-contracts
npm install

# Compile the contract
npx hardhat compile

# Deploy to the private Geth network
npx hardhat run scripts/deploy.ts --network geth
# Output: ✅ Reporting deployed to: 0x...
```

After deployment, copy the printed contract address into:
- `backend-relayer/.env` → `CONTRACT_ADDRESS=0x...`
- `web-dapp/.env.local` → `NEXT_PUBLIC_CONTRACT_ADDRESS=0x...`

**Authorize the relayer** (only needed if deploying fresh — the constructor already hardcodes the relayer address, but run setup.ts to verify or re-authorize):
```bash
npx hardhat run scripts/setup.ts --network geth
# Output: Relayer 0x3253678a... authorized: true
```

**Copy ABI to relayer** (do this every time you change the contract):
```bash
# The compiled ABI is at:
smart-contracts/artifacts/contracts/Reporting.sol/Reporting.json

# Copy it to:
backend-relayer/src/blockchain/Reporting.json
```

> **Important:** The relayer imports this file directly. If you change the contract and recompile without copying the new ABI, the relayer will use a stale ABI and calls will fail.

---

### 1.3 Start the ZKP GovID Simulator

```bash
cd zkp-govid-simulator
npm install

# The SQLite database is auto-created on first run
npm run dev
# Server running on port 5000
```

**Add a test citizen** (first time only):
```bash
curl -X POST http://localhost:5000/api/govid/add-citizen \
  -H "Content-Type: application/json" \
  -d '{
    "adminSecret": "your-admin-secret-from-env",
    "govId": "199812345678",
    "password": "password123",
    "name": "Ahmad bin Ali"
  }'
```

**Test login:**
```bash
curl -X POST http://localhost:5000/api/govid/verify-citizen \
  -H "Content-Type: application/json" \
  -d '{"govId": "199812345678", "password": "password123"}'
# Should return { success: true, citizenSeed: "...", ticketBatch: [...] }
```

---

### 1.4 Start the AI Oracle Service

```bash
cd ai-oracle-service
docker-compose up -d
```

This starts 4 containers:
- `aggregator` on port `8000` (publicly accessible)
- `oracle-safety` on port `8001` (Docker internal only)
- `oracle-spam` on port `8002` (Docker internal only)
- `oracle-civic` on port `8003` (Docker internal only)

**Verify aggregator:**
```bash
curl http://localhost:8000/
# { "service": "AI_ORACLE_AGGREGATOR", "status": "running", ... }
```

**Note:** The AI models (`toxic-bert`, `nsfw_image_detection`, `all-MiniLM-L6-v2`) are downloaded from HuggingFace on first run. This can take several minutes depending on network speed.

---

### 1.5 Start the Backend Relayer

```bash
cd backend-relayer
npm install

# Make sure .env is configured (see environment variables in Part 1)
npm run start:dev
# NestJS server on port 3001
```

**Verify:**
```bash
curl http://localhost:3001/
# { "message": "Hello World!" }
```

**CORS is configured for:**
- `http://localhost:3000` (local web-dapp)
- `https://dapp.internalbuildtools.online` (production)

---

### 1.6 Start the Web-DApp

```bash
cd web-dapp
npm install

# Make sure .env.local is configured
npm run dev
# Next.js on port 3000
```

**For local full-stack, `.env.local` should be:**
```env
NEXT_PUBLIC_RELAYER_URL=http://localhost:3001
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CONTRACT_ADDRESS=0x<your-deployed-address>
NEXT_PUBLIC_IPFS_URL=https://ipfs.internalbuildtools.online
```

---

## 2. ZKP Simulator — SQLite Database Schema

**Location:** `zkp-govid-simulator/data/` (auto-created)  
**Driver:** `better-sqlite3` (synchronous SQLite)

### Table: `citizens`

```sql
CREATE TABLE IF NOT EXISTS citizens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  govId       TEXT    NOT NULL UNIQUE,   -- 12-digit government ID
  password    TEXT    NOT NULL,          -- plain text (simulator only)
  citizenSeed TEXT    NOT NULL,          -- 32 random bytes hex — used to derive wallet
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  address     TEXT,
  status      TEXT    NOT NULL DEFAULT 'Active',   -- 'Active' | 'Inactive'
  createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

**Key fields explained:**

| Field | Description |
|---|---|
| `govId` | Must be 12 digits. Unique — one record per citizen. |
| `password` | Stored in plain text because this is a simulator. In production, this would be bcrypt-hashed. |
| `citizenSeed` | `crypto.randomBytes(32).toString('hex')` — generated once at citizen creation. This is the secret that the frontend uses to deterministically derive the citizen's private key. It never changes. |
| `status` | Only `'Active'` citizens can authenticate. `'Inactive'` logins are rejected even with correct credentials. |

---

### Table: `issued_tickets`

```sql
CREATE TABLE IF NOT EXISTS issued_tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticketId    TEXT    NOT NULL UNIQUE,   -- keccak256(uuid) — bytes32 hex
  signature   TEXT    NOT NULL,          -- gov wallet ECDSA sig over ticketId bytes
  citizenId   INTEGER NOT NULL,          -- FK → citizens.id
  status      TEXT    NOT NULL DEFAULT 'issued',  -- 'issued' | 'used'
  expiresAt   TEXT,                      -- ISO timestamp or NULL (no expiry)
  createdAt   TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (citizenId) REFERENCES citizens(id)
);
```

**Key fields explained:**

| Field | Description |
|---|---|
| `ticketId` | The bytes32 hex used as `submissionNullifier` on-chain. Unique forever — even across different citizens. |
| `signature` | The government authority's ECDSA signature. The relayer uses this to prove the ticket is genuine. |
| `status` | Set to `'used'` when a ticket is consumed (currently tracked here; the real guard is on-chain nullifiers). |
| `expiresAt` | Optional TTL. Set via `TICKET_TTL_SECONDS` env var. If set, the ticket is only valid until this time. |

---

### Model Functions (from `src/models/citizen.ts`)

| Function | Description |
|---|---|
| `getCitizenByGovId(govId)` | Fetches full citizen record including password. Returns `undefined` if not found. |
| `verifyCitizen(govId, password)` | Checks password match AND `status === 'Active'`. |
| `createCitizen(input)` | Generates `citizenSeed = crypto.randomBytes(32).toString('hex')`, inserts into DB, returns record without password. |
| `createIssuedTicket(ticketId, sig, citizenId, expiresAt)` | Records each issued ticket with `status = 'issued'`. |
| `markIssuedTicketAsUsed(ticketId)` | Updates `status = 'used'` (informational — real replay block is on-chain). |
| `isUniqueConstraintError(error)` | Helper to detect SQLite `UNIQUE` constraint violations for clean 409 responses. |

---

## 3. NestJS Relayer — Module Wiring

The relayer uses NestJS's dependency injection system. Here is how modules connect:

```
AppModule
  ├── ConfigModule.forRoot()     — loads .env into ConfigService
  ├── BlockchainModule           — provides BlockchainService
  └── ReportingModule
        ├── imports: [BlockchainModule]    — gets BlockchainService injected
        ├── providers:
        │     ├── ReportingService         — core pipeline (injected: AiOracleService, BlockchainService, IpfsService)
        │     ├── AiOracleService          — calls AI oracle
        │     ├── IpfsService              — uploads to IPFS
        │     └── CitizenAuthGuard         — validates Authorization header
        └── controllers: [ReportingController]
```

**`main.ts` bootstrap configuration:**
```ts
app.enableCors({
  origin: ['http://localhost:3000', 'https://dapp.internalbuildtools.online'],
  credentials: true,
});
app.useGlobalPipes(new ValidationPipe());
await app.listen(process.env.PORT ?? 3000);
```

- `ValidationPipe` — automatically validates DTOs using class-validator decorators.
- CORS origins are hardcoded — if you add a new frontend domain, add it here.
- Port defaults to `3000` if `PORT` is not in `.env` (production typically sets this to `3001`).

**`FilesInterceptor` on `POST /report`:**
```ts
@UseInterceptors(FilesInterceptor('images', 5))
async createReport(@Body() payload, @UploadedFiles() images)
```
- `'images'` — the multipart field name the frontend uses (`formData.append('images', file)`).
- `5` — maximum number of files. Multer buffers them in memory (no disk temp files).

---

## 4. Web-DApp — App Shell & Layout

**File:** `web-dapp/app/layout.tsx`

The root layout wraps every page. Its structure:

```
<html>
  <body>
    <CitizenProvider>               ← auth state available to ALL pages
      <TopAppBar />                 ← mobile only (md:hidden)
      <aside>                       ← desktop sidebar (hidden md:flex)
        "AuraChain" branding
        <BottomNav isSidebar />     ← nav items as vertical list
        "Create Proposal" button
      </aside>
      <main>
        <header>                    ← desktop top bar (search + icons)
        <div max-w-6xl>
          {children}                ← page content rendered here
        </div>
      </main>
      <BottomNav />                 ← mobile bottom tab bar (md:hidden)
    </CitizenProvider>
  </body>
</html>
```

**Why `CitizenProvider` wraps everything at the root level:**  
Every page that needs to check if the user is logged in (e.g. `/report` disabling the submit button, `/my-reports` showing the wallet disconnected state) calls `useCitizen()`. If `CitizenProvider` were lower in the tree, those pages couldn't access the context. Putting it at root ensures the session is available app-wide.

---

### 4.1 Navigation — `BottomNav` Component

**File:** `web-dapp/components/layout/BottomNav.tsx`

Used in two modes via the `isSidebar` prop:

| Mode | Rendered as | When |
|---|---|---|
| `isSidebar=false` (default) | Fixed bottom bar, horizontal icons | Mobile (`md:hidden`) |
| `isSidebar=true` | Vertical list with labels | Desktop sidebar |

**Nav items:**

| Label | Route | Icon |
|---|---|---|
| Feed | `/feed` | Layers |
| Report / Reports | `/report` | PlusCircle / BarChart2 |
| Profile | `/profile` | User |
| Notifications | `#` (placeholder) | Bell |

Active route is highlighted by comparing `usePathname()` against each item's `href`.

---

## 5. Hardhat Scripts — Contract Lifecycle

### `scripts/deploy.ts` — Deploy the contract

```bash
npx hardhat run scripts/deploy.ts --network geth
```

What it does:
1. Gets the deployer signer (first account in `hardhat.config.ts` accounts array).
2. Logs deployer address and ETH balance.
3. Deploys `Reporting` contract — constructor runs which hardcodes relayer + authority.
4. Waits for deployment confirmation.
5. Prints the deployed contract address.

```ts
const Reporting = await ethers.getContractFactory("Reporting");
const reporting = await Reporting.deploy();
await reporting.waitForDeployment();
console.log("✅ Reporting deployed to:", await reporting.getAddress());
```

---

### `scripts/setup.ts` — Authorize a relayer post-deployment

```bash
npx hardhat run scripts/setup.ts --network geth
```

What it does:
1. Connects to an already-deployed contract at the hardcoded address.
2. Calls `setRelayer(relayerAddress, true)` as the contract owner.
3. Verifies the authorization was set correctly.

> This script is only needed if you deploy the contract fresh and need to authorize a relayer address that's different from the one hardcoded in the constructor. Normally the constructor already sets it.

---

### `scripts/send-op-tx.ts` — Test transaction utility

A development utility to send a test transaction to the network — useful for confirming that the Geth node is mining blocks and the relayer wallet has gas.

---

### Hardhat Networks Config (`hardhat.config.ts`)

```ts
networks: {
  hardhat: { chainId: 1337 },         // local in-process node
  geth: {
    url: "https://rpc.internalbuildtools.online",
    chainId: 1337,
    accounts: [DEPLOYER_PRIVATE_KEY]  // from hardhat.config env
  }
}
```

**Run against local Geth:** Use `--network geth` with the local RPC URL in config.  
**Run against Hardhat node:** Use `--network hardhat` or just `npx hardhat test`.

---

## 6. Adding a New Feature — Where to Touch What

### Add a new report field (e.g. `priority`)

1. **Frontend `/report` page** — add the input and append to `FormData`.
2. **Relayer `SubmitReportPayload` interface** — add `priority: string`.
3. **Relayer `reporting.service.ts`** — include in `messageHash` computation and IPFS upload payload.
4. **IPFS node** — must accept and store the new field.
5. **Frontend feed/detail pages** — read from IPFS metadata response and display.
6. **Contract** — only needed if `priority` must be stored on-chain (adds gas cost).

### Add a new contract function (e.g. `castValidationVote`)

1. **`Reporting.sol`** — implement the function.
2. **`npx hardhat compile`** — recompile.
3. **Copy ABI** — `artifacts/.../Reporting.json` → `backend-relayer/src/blockchain/Reporting.json`.
4. **`blockchain.service.ts`** — add a new method calling the contract function.
5. **`reporting.controller.ts`** — add a new route (e.g. `POST /report/:id/vote`).
6. **Frontend** — call the relayer endpoint or call the contract directly if read-only.

### Add a new oracle check

1. **Create new Python service** in `ai-oracle-service/oracle-xyz/`.
2. **Expose `POST /analyze`** returning the standard oracle response format.
3. **Add to `docker-compose.yml`** in the `ai-oracle-service/` directory.
4. **Add to `ORACLE_URLS`** in `aggregator/app.py`.
5. **Update `aggregate_votes()`** if the new oracle needs special veto logic.

---

## 7. Common Issues & Debugging

### "NullifierAlreadyUsed" on-chain error
**Cause:** The same `zkpTicketId` was submitted twice.  
**Fix:** Each ticket can only be used once. If testing, generate a fresh ticket from the ZKP simulator.

### "Invalid or forged government ticket" (Relayer Step 1)
**Cause:** `GOV_PUBLIC_ADDRESS` in relayer `.env` doesn't match the ZKP simulator's gov wallet address.  
**Fix:** Call `GET /api/govid/public-key` on the ZKP server and update `GOV_PUBLIC_ADDRESS` to match.

### AI Oracle returns 401 "Request not signed by trusted relayer"
**Cause:** `TRUSTED_RELAYER_ADDRESS` in the oracle aggregator env doesn't match the address derived from `RELAYER_PRIVATE_KEY`.  
**Fix:** Compute the address from the private key: `new ethers.Wallet(RELAYER_PRIVATE_KEY).address` and set that as `TRUSTED_RELAYER_ADDRESS`.

### IPFS proxy returns 502
**Cause:** IPFS node is unreachable or the CID doesn't exist yet.  
**Fix:** Check `NEXT_PUBLIC_IPFS_URL` in web-dapp `.env.local`. Verify the IPFS node is running.

### Feed shows "Smart contract address is not configured"
**Cause:** `NEXT_PUBLIC_CONTRACT_ADDRESS` is empty in web-dapp `.env.local`.  
**Fix:** Add the deployed contract address to `.env.local` and restart `npm run dev`.

### Relayer blockchain submission disabled
**Cause:** `BLOCKCHAIN_SUBMISSION_ENABLED=false` in relayer `.env`.  
**Effect:** Reports pass AI moderation and IPFS upload but return `submissionStatus: 'skipped_blockchain_disabled'` — they are NOT recorded on-chain.  
**Fix:** Set `BLOCKCHAIN_SUBMISSION_ENABLED=true`.

### My Reports page shows no reports even after submitting
**Cause:** `PSEUDONYM_DOMAIN_SALT` changed between submission and retrieval.  
**Effect:** The pseudonym computed at submission time (`keccak256(address + "CivicReport-v1")`) no longer matches the one computed by `GET /report/my-pseudonym`.  
**Fix:** Never change `PSEUDONYM_DOMAIN_SALT` after reports are on-chain. The contract stores pseudonyms permanently.

---

## 8. Package Versions (Key Dependencies)

### web-dapp
| Package | Version | Purpose |
|---|---|---|
| `next` | 15.x | App framework (App Router) |
| `ethers` | 6.x | Smart contract reads, wallet, keccak256 |
| `leaflet` | 1.x | Map rendering (LocationPicker, MapPreview) |

### backend-relayer
| Package | Version | Purpose |
|---|---|---|
| `@nestjs/core` | 10.x | Framework |
| `ethers` | 6.x | Signature verification, contract calls |
| `axios` | 1.x | IPFS HTTP upload |
| `multer` | 1.x | Multipart file handling |

### zkp-govid-simulator
| Package | Version | Purpose |
|---|---|---|
| `express` | 4.x | HTTP server |
| `ethers` | 6.x | Ticket signing |
| `better-sqlite3` | 9.x | Synchronous SQLite |
| `uuid` | 9.x | Random ticket ID generation |

### ai-oracle-service (Python)
| Package | Purpose |
|---|---|
| `fastapi` | HTTP framework |
| `transformers` | HuggingFace models (toxic-bert, nsfw detection, spam) |
| `sentence-transformers` | Semantic embeddings (civic relevance oracle) |
| `eth-account` | Ethereum signature recovery (aggregator) |
| `Pillow` | Image decoding |
