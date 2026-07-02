# Local Governance dApp - Developer Guide

Welcome to the developer guide for the Local Governance decentralized application. This document explains the core architecture, roles, voting mechanics, and provides a step-by-step guide to setting up the project locally for development.

---

## 1. Core Architecture & Roles

The dApp uses a multi-signature governance model composed of two primary smart contracts:
- **`AuthorityMultiSig.sol`**: The governing contract that manages roles and voting.
- **`Reporting.sol`**: The core operational contract that is owned and managed by the MultiSig contract.

### User Roles
1. **Super Admins**
   - The highest tier of governance.
   - Authorized to submit proposals to add/remove other Super Admins and Authorities.
   - Authorized to cast "Yes" or "No" votes on pending proposals.
2. **Authorities**
   - Operational entities approved by the Super Admins.
   - Granted specific permissions to interact with and verify data within the `Reporting` contract.

---

## 2. Proposal & Voting Mechanics

The `AuthorityMultiSig` contract uses a strict threshold-based voting system with the following rules:

- **Creating Proposals**: Any active Super Admin can create a proposal. They must provide:
  - `target`: The wallet address of the user being proposed.
  - `actionType`: Add Super Admin, Remove Super Admin, Add Authority, or Remove Authority.
  - `durationInDays`: How long the proposal remains open for voting.
- **Auto-Voting**: The Super Admin who submits the proposal is automatically recorded as casting a "Yes" vote.
- **Vote Changing**: Admins have the flexibility to change their vote (from Yes to No, or No to Yes) up to **3 times** per proposal, as long as the proposal hasn't expired or been executed.
- **Threshold & Execution**: A proposal requires a strict majority to pass: `(Total Super Admins / 2) + 1`. 
  - *Example: If there are 3 Super Admins, a proposal needs 2 Yes votes to pass.*
  - The moment a proposal hits the required "Yes" vote threshold, the contract **automatically executes** the action on-chain.
- **Expiration**: If a proposal's timeline officially expires before it reaches a majority, it is permanently locked and tagged as "Expired". No further votes can be cast.

---

## 3. Local Setup & Deployment Guide

Follow these steps to run the complete stack (blockchain + frontend) on your local machine.

### Step 1: Start the Local Blockchain
Open a terminal in the `smart-contracts` folder and spin up a local Hardhat node. This creates a local Ethereum network with test accounts.
```bash
cd smart-contracts
npm install
npx hardhat node
```
*(Leave this terminal running in the background)*

### Step 2: Deploy the Smart Contracts
Open a **second terminal**, navigate to the `smart-contracts` folder, and run the deployment script.
```bash
cd smart-contracts
npx hardhat ignition deploy ignition/modules/Reporting.ts --network localhost --reset
```
When this finishes, it will print out the deployed contract addresses. Keep these handy for Step 3.

> [!NOTE]
> The initial Super Admins are hardcoded inside `ignition/modules/Reporting.ts`. If you are setting up fresh MetaMask test accounts, make sure to update that file with your specific wallet addresses before deploying!

### Step 3: Configure the Frontend
Navigate to the frontend folder and open `context/AdminContext.tsx`. You need to update the hardcoded addresses to match the ones generated in Step 2.
```typescript
// web-dapp/context/AdminContext.tsx
export const MULTISIG_ADDRESS = "<YOUR_DEPLOYED_AUTHORITY_MULTISIG_ADDRESS>";
export const REPORTING_ADDRESS = "<YOUR_DEPLOYED_REPORTING_ADDRESS>";
```

### Step 4: Run the Web App
In a **third terminal**, navigate to the `web-dapp` folder and start the Next.js development server.
```bash
cd web-dapp
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 4. Troubleshooting & Best Practices

- **MetaMask "Nonce too high" or "Internal JSON-RPC" Errors:** 
  Because the Hardhat node resets its state every time you restart it, MetaMask gets confused because its transaction history doesn't match the fresh blockchain. 
  *Fix:* Open MetaMask -> Settings -> Advanced -> **Clear activity tab data** (for the Localhost network).
- **Wallet Funding:**
  Hardhat nodes wipe out ETH balances on restart. If you use your own MetaMask wallets (instead of the Hardhat default ones) as Super Admins, you will need to fund them with local ETH. You can write a quick Ethers.js script to transfer funds from a Hardhat default account to your MetaMask wallets.
