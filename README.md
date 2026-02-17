# Local Governance Platform

A decentralized civic issue reporting and resolution system that combines blockchain transparency with privacy-preserving citizen authentication. This platform enables citizens to report local issues (infrastructure problems, public safety concerns, etc.) while maintaining their privacy through Zero-Knowledge Proofs (ZKP).

## 🎯 Overview

The Local Governance Platform provides a complete solution for democratic, transparent civic engagement:

- **Privacy-First**: Citizens authenticate using ZKP without revealing their identity
- **Transparent**: All reports and their lifecycle are tracked on-chain
- **Democratic**: Community voting at key stages prevents arbitrary dismissals
- **Accessible**: No crypto wallet required—backend relayer handles blockchain interactions
- **Accountable**: Role-based access control ensures proper authority oversight

## 🏗️ Architecture

```
┌──────────────┐      ZKP Auth       ┌─────────────────────┐
│   Citizen    │◄────────────────────►│  GovID Simulator    │
│  (Browser)   │                      │  (Port 4000)        │
└──────┬───────┘                      └─────────────────────┘
       │
       │ HTTP/REST
       │
┌──────▼───────┐      Relays TX      ┌─────────────────────┐
│  Web dApp    │◄────────────────────►│  Backend Relayer    │
│  (Next.js)   │                      │  (NestJS Port 3000) │
└──────────────┘                      └──────────┬──────────┘
                                                 │
                                                 │ Web3
                                                 │
                                      ┌──────────▼──────────┐
                                      │  Smart Contracts    │
                                      │  (Reporting.sol)    │
                                      │  + IPFS Storage     │
                                      └─────────────────────┘
```

## 📦 Project Structure

This monorepo contains four main components:

### `/smart-contracts`
Hardhat 3 project containing the Reporting smart contract that manages the entire lifecycle of civic issue reports on-chain.

**Key Features:**
- Finite State Machine (FSM) for report status management
- Role-Based Access Control (RBAC) for authorities and relayers
- Community voting mechanisms with sybil resistance
- IPFS integration for media storage

**Tech Stack:** Solidity, Hardhat, OpenZeppelin, ethers.js

[📖 View smart-contracts README](smart-contracts/README.md)

### `/backend-relayer`
NestJS backend service that acts as a trusted intermediary, allowing citizens without crypto wallets to interact with the blockchain.

**Key Features:**
- RESTful API for report submission
- Transaction relaying to blockchain
- ZKP proof verification
- Gas fee sponsorship

**Tech Stack:** NestJS, TypeScript, ethers.js, Web3

[📖 View backend-relayer README](backend-relayer/README.md)

### `/web-dapp`
Next.js frontend application providing an intuitive interface for citizens to submit reports and track their resolution.

**Key Features:**
- Report submission with media upload
- Report browsing and filtering
- Community voting interface
- Real-time status updates

**Tech Stack:** Next.js, React, TypeScript, TailwindCSS

[📖 View web-dapp README](web-dapp/README.md)

### `/zkp-govid-simulator`
Simulates a government citizen authentication system using Zero-Knowledge Proofs for privacy-preserving identity verification.

**Key Features:**
- Mock citizen database/registry
- ZKP proof generation
- Deterministic nullifier hashing
- Privacy-preserving authentication

**Tech Stack:** Node.js, Express, TypeScript, Crypto

[📖 View zkp-govid-simulator README](zkp-govid-simulator/README.md)

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd local-governance
   ```

2. **Install dependencies for all projects**
   ```bash
   # Smart Contracts
   cd smart-contracts
   npm install
   cd ..

   # Backend Relayer
   cd backend-relayer
   npm install
   cd ..

   # Web dApp
   cd web-dapp
   npm install
   cd ..

   # ZKP GovID Simulator
   cd zkp-govid-simulator
   npm install
   cd ..
   ```

### Running the System

The complete system requires all four components to be running. Open four terminal windows:

**Terminal 1: Start Local Blockchain**
```bash
cd smart-contracts
npx hardhat node
```

**Terminal 2: Deploy Smart Contracts**
```bash
cd smart-contracts
npx hardhat ignition deploy ignition/modules/Reporting.ts --network localhost
```

**Terminal 3: Start Backend Relayer**
```bash
cd backend-relayer
npm run start:dev
```

**Terminal 4: Start ZKP GovID Simulator**
```bash
cd zkp-govid-simulator
npm run dev
```

**Terminal 5: Start Web dApp**
```bash
cd web-dapp
npm run dev
```

Access the application at `http://localhost:3000`

## 🔐 Security & Privacy

### Zero-Knowledge Proofs
Citizens authenticate without revealing their identity. The system uses:
- **Submission Nullifiers**: Prevent duplicate report submissions
- **Voting Nullifiers**: Prevent duplicate votes (sybil resistance)
- **No PII Storage**: Personal information never touches the blockchain

### Role-Based Access Control
- **RELAYER_ROLE**: Backend service for transaction relaying
- **AUTHORITY_ROLE**: Local government/NGO for report resolution
- **DEFAULT_ADMIN_ROLE**: Contract deployment and role management

## 🔄 Report Lifecycle

Reports follow a well-defined state machine:

1. **Pending_Validation** → Community validates legitimacy
2. **Open** → Authorities investigate and take action
3. **Pending_Verification** → Community verifies the fix
4. **Closed** → Successfully resolved

Alternative paths:
- **Community_Rejected** → Community flags as spam/invalid
- **Pending_Rejection_Review** → Authority rejection requires community confirmation
- **Reopened** → Community rejects claimed fix, sends back to authority

## 🧪 Testing

Each component has its own test suite:

```bash
# Smart Contracts
cd smart-contracts
npx hardhat test

# Backend Relayer
cd backend-relayer
npm run test

# Run E2E tests
cd backend-relayer
npm run test:e2e
```

## 📚 Documentation

- [Smart Contract Specification](smart-contracts/spec/reporting_contract.md)
- Component-specific READMEs (linked above)

## 🛠️ Development

### Smart Contract Development
```bash
cd smart-contracts
npx hardhat compile
npx hardhat test
```

### Backend Development
```bash
cd backend-relayer
npm run start:dev  # Watch mode with hot reload
```

### Frontend Development
```bash
cd web-dapp
npm run dev  # Next.js development server with hot reload
```

## 🤝 Contributing

This is a demonstration project showcasing decentralized governance principles. Contributions for educational purposes are welcome.

## 📄 License

[MIT](LICENSE)

## 🔗 Related Technologies

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat](https://hardhat.org/)
- [NestJS](https://nestjs.com/)
- [Next.js](https://nextjs.org/)
- [IPFS](https://ipfs.tech/)
- [Zero-Knowledge Proofs](https://en.wikipedia.org/wiki/Zero-knowledge_proof)

## 🎓 Educational Purpose

This project demonstrates:
- Blockchain-based governance systems
- Privacy-preserving authentication
- Decentralized application architecture
- Smart contract state machines
- Role-based access control
- Community-driven decision making

---

**Built with ❤️ for transparent, accountable local governance**
