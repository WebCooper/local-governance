# ZKP GovID Simulator

A TypeScript-based server that simulates a government citizen authentication system using Zero-Knowledge Proofs (ZKP). This simulator generates cryptographic proofs for citizen verification while preserving privacy—no personal information is exposed to the Relayer.

##  Features

- **Privacy-Preserving Authentication**: Authenticates citizens without revealing their identity
- **ZKP Simulation**: Generates simulated Zero-Knowledge Proofs
- **Deterministic Nullifier Hash**: Prevents duplicate report submissions using unique hashes
- **Mock Database**: Simulates a government citizen registry
- **TypeScript**: Fully typed for safety and maintainability
- **Hot Reload**: Development with Nodemon for auto-restart on file changes
- **Error Handling**: Comprehensive error handling with meaningful messages

##  Project Structure

```
zkp-govid-simulator/
├── src/
│   ├── app.ts                      # Express app setup & middleware
│   ├── server.ts                   # Server initialization
│   ├── models/
│   │   └── citizen.ts             # Mock citizen database & queries
│   ├── services/
│   │   └── authService.ts         # Business logic for ZKP proof generation
│   ├── controllers/
│   │   └── authController.ts      # Request handlers & validation
│   ├── routes/
│   │   └── auth.ts                # Route definitions
│   └── middlewares/               # Custom middleware (expandable)
├── dist/                          # Compiled JavaScript output
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

##  Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type-safe JavaScript
- **Crypto** - Built-in Node.js cryptography
- **CORS** - Cross-origin resource sharing
- **Nodemon** - Development auto-reload
- **ts-node** - TypeScript execution for development

##  Quick Start

### Prerequisites

- Node.js v16+ installed
- npm or yarn package manager

### Installation

```bash
# Clone or navigate to project directory
cd zkp-govid-simulator

# Install dependencies
npm install
```

### Running the Server

**Development Mode** (with auto-reload):
```bash
npm run dev
```

**Production Build**:
```bash
npm run build
npm start
```

**Expected Output**:
```
 Simulated ZKP GovID Server running on port 5000
 API Available at http://localhost:5000
 Health check: http://localhost:5000/health
```

##  API Documentation

### Base URL
```
http://localhost:5000
```

### Endpoints

#### 1. Health Check
Check if the server is running.

```
GET /health
```

**Response**:
```json
{
  "status": "ok",
  "message": "ZKP GovID Simulator is running"
}
```

---

#### 2. Authenticate & Generate ZKP Proof
Authenticate a citizen and generate a privacy-preserving proof.

```
POST /api/govid/authenticate
```

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "citizenId": "citizen_001",
  "password": "password123",
  "reportContext": "broken_streetlight_zone_4"
}
```

**Response** (200 OK):
```json
{
  "mockProof": "zkp_valid_proof_a1b2c3d4e5f6g7h8",
  "nullifierHash": "0x7d1a8e3c4f9b2e6a1d5c8a3b7e2f4c9a1d5e8b3c6f9a2d5e8b1c4f7a0d3e6a"
}
```

**Error Responses**:

- **Missing Fields** (400 Bad Request):
```json
{
  "error": "Missing required fields: citizenId, password, reportContext"
}
```

- **Invalid Credentials** (401 Unauthorized):
```json
{
  "error": "Invalid citizen credentials"
}
```

---

##  How It Works

### 1. Authentication Flow
```
User → Server
  ├─ Sends: citizenId + password + reportContext
  ├─ Server: Verifies credentials against mock database
  └─ If valid: Generate proof & nullifier hash
```

### 2. ZKP Proof Generation
- Random 16-character hex string appended to `zkp_valid_proof_` prefix
- Simulates mathematical proof without exposing citizen identity

### 3. Nullifier Hash (Duplicate Prevention)
- SHA-256 hash of: `citizenId + reportContext`
- **Deterministic**: Same input → Same hash
- **Purpose**: Smart contract checks this hash; repeated submissions are rejected
- Converts to hex format with `0x` prefix for blockchain compatibility

### 4. Privacy Preservation
-  Citizen's name is NOT returned
-  Citizen's ID is NOT returned
-  Only proof & nullifier hash are sent to Relayer
-  Relayer cannot identify the citizen

---

##  Testing the API

### Using cURL

**Health Check**:
```bash
curl http://localhost:5000/health
```

**Authenticate (Success)**:
```bash
curl -X POST http://localhost:5000/api/govid/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "citizenId": "citizen_001",
    "password": "password123",
    "reportContext": "broken_streetlight_zone_4"
  }'
```

**Authenticate (Failure)**:
```bash
curl -X POST http://localhost:5000/api/govid/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "citizenId": "citizen_001",
    "password": "wrongpassword",
    "reportContext": "broken_streetlight_zone_4"
  }'
```

### Using Postman

1. Open Postman
2. Create a new POST request
3. URL: `http://localhost:5000/api/govid/authenticate`
4. Headers: `Content-Type: application/json`
5. Body (raw JSON):
```json
{
  "citizenId": "citizen_001",
  "password": "password123",
  "reportContext": "broken_streetlight_zone_4"
}
```
6. Click **Send**

### Using JavaScript/Fetch

```javascript
const response = await fetch('http://localhost:5000/api/govid/authenticate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    citizenId: 'citizen_001',
    password: 'password123',
    reportContext: 'broken_streetlight_zone_4'
  })
});

const data = await response.json();
console.log(data);
```

---

##  Mock Database Users

The simulator includes two pre-registered citizens:

| Citizen ID | Name | Password |
|-----------|------|----------|
| citizen_001 | Alice | password123 |
| citizen_002 | Bob | password123 |

** Note**: This is a mock database for simulation. In production, use secure authentication systems.

---

##  Available npm Scripts

```bash
npm run dev      # Start dev server with auto-reload (Nodemon)
npm run build    # Compile TypeScript to JavaScript
npm start        # Run production server
npm test         # Run tests (placeholder)
```

---

##  Example Workflow

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Send authentication request:**
   ```bash
   curl -X POST http://localhost:5000/api/govid/authenticate \
     -H "Content-Type: application/json" \
     -d '{"citizenId":"citizen_001","password":"password123","reportContext":"pothole_main_street"}'
   ```

3. **Receive proof & nullifier:**
   ```json
   {
     "mockProof": "zkp_valid_proof_f7e3c1a9",
     "nullifierHash": "0x4a2c8e1f..."
   }
   ```

4. **Use in your DApp:**
   - Send `mockProof` to your smart contract for verification
   - Send `nullifierHash` to prevent duplicate submissions
   - Privacy maintained: Contract never knows citizen identity

---

##  Security Notes

-  Passwords are verified server-side
-  No sensitive data in response
-  CORS enabled for frontend integration
-  This is a simulator for educational/development purposes
-  Replace mock database with real authentication in production
-  Use HTTPS in production
-  Implement proper input validation & rate limiting

---

## Development Roadmap

- [ ] Add JWT token support
- [ ] Implement real database connection
- [ ] Add rate limiting
- [ ] Add request logging
- [ ] Add unit tests
- [ ] Add API documentation (Swagger/OpenAPI)
- [ ] Add environment configuration

---

##  License

ISC

---

##  Author

Undergraduate Project - ZKP GovID Simulator

---

##  Support

For issues or questions, refer to the API documentation above or contact the development team.
