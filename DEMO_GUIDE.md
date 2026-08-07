# Demo Video Creation Guide & Script

This guide will walk you through creating a comprehensive demo video for the **Local Governance dApp**. It covers the end-to-end workflow, from creating a decentralized identity (GovID) to interacting with the dApp as both a citizen and an authority.

---

## 🎬 Video Production Workflow

### 1. Preparation
- **Environment Setup:** Ensure all services are running locally:
  - Hardhat Local Node (`npx hardhat node`)
  - Smart Contract Deployment Scripts (deploy contracts)
  - ZKP Server (`zkp-govid-simulator` on port 5001)
  - Next.js Web dApp (`web-dapp` on port 3000)
  - DRP GovID UI (`drp-gov-sim-ui` on port 5173)
- **Wallets:** Have two MetaMask accounts ready:
  - Account 1: Super Admin / Contract Owner
  - Account 2: Authority (add this account via the Super Admin panel beforehand)
- **Screen Recording:** Use a tool like OBS Studio or Loom. Record the entire screen to show switching between the GovID simulator and the main dApp.

### 2. Video Structure
The video will be structured into **4 main acts**:
1. **Act 1:** Identity Creation (DRP GovID Simulator)
2. **Act 2:** Citizen Experience (Anonymous Reporting & Voting)
3. **Act 3:** Authority Experience (Managing Reports & Polls)
4. **Act 4:** Conclusion (Summary of Decentralized Governance)

---

## 📜 Demo Script & Walkthrough

### Act 1: The Foundation - Zero-Knowledge Identity
**Goal:** Show how a user proves they are a valid citizen without revealing their actual identity.

- **Visual:** Open the `drp-gov-sim-ui` (GovID Simulator).
- **Action:** 
  1. Click on "Register New Citizen".
  2. Fill in mock details (NIC, Name, Address).
  3. Click "Capture Face" and proceed to generate the ZK Proof.
  4. Highlight the success screen showing the generated `GovID` and the cryptographic proof.
- **Voiceover/Text-to-Speech:** 
  > *"Welcome to the future of local governance. It all starts with trust and privacy. Using our Department of Registration of Persons simulator, a citizen registers their identity. Instead of storing their personal data centrally, the system generates a Zero-Knowledge Proof—a GovID. This proves they are a verified citizen of the municipality without ever revealing who they actually are."*

### Act 2: The Citizen Experience - Anonymous & Secure
**Goal:** Demonstrate how a citizen logs in, claims tickets, files a report, and votes.

- **Visual:** Switch to the `web-dapp` (Local Governance App) homepage.
- **Action:** 
  1. Click "Login with GovID".
  2. The system authenticates the ZK Proof and grants the user **Anonymous Action Tickets**.
  3. Navigate to **File Civic Report**.
  4. Create a report (e.g., "Pothole on Main Street"). Add a mock location, select the "Infrastructure" category, upload an image, and submit.
  5. Go to the **Community Feed -> Civic Reports** tab to show the newly minted report.
  6. Upvote another existing report to show community consensus.
  7. Switch to the **Opinion Polls** tab. Vote on an active poll, showing the ticket balance decreasing.
- **Voiceover/Text-to-Speech:** 
  > *"With their GovID, the citizen logs into the municipal dApp. Because authentication relies on Zero-Knowledge proofs, the citizen remains completely anonymous, yet verified. They receive Action Tickets to prevent spam. Let's file a civic report about a local infrastructure issue. The report is uploaded to IPFS for decentralized storage and anchored on-chain. Citizens can also anonymously vote on opinion polls and upvote issues, ensuring community consensus drives municipal action."*

### Act 3: The Authority Experience - Action & Transparency
**Goal:** Show how municipal authorities interact with citizen reports and manage polls.

- **Visual:** Open a new browser window/profile. Connect MetaMask using the **Authority Account**.
- **Action:** 
  1. Login via MetaMask and navigate to the **Admin Panel**.
  2. Show the **Admin Dashboard** with statistics.
  3. Go to **Manage Reports**. Find the pothole report filed in Act 2.
  4. Change the status of the report from "Pending" to "In Progress" or "Resolved".
  5. Go to **Manage Polls** and click "Create New Poll".
  6. Create a poll (e.g., "Should we allocate funds for a new park?").
  7. Switch back to the Citizen window to show the poll instantly appearing in the Citizen Feed and the report status updated.
- **Voiceover/Text-to-Speech:** 
  > *"Transparency goes both ways. Municipal authorities log in securely using their Web3 wallets. In the Authority Portal, they can view all community reports, prioritize them based on upvotes, and update their statuses in real-time. All state changes are recorded on the blockchain, creating an immutable audit trail. Authorities can also publish new opinion polls directly to the community to gather sentiment before making major budget decisions."*

### Act 4: System Governance (Optional but Recommended)
**Goal:** Show how the system is governed at the highest level.

- **Visual:** Switch MetaMask to the **Super Admin Account**.
- **Action:** 
  1. Navigate to the **Super Admin** panel.
  2. Show the Authority Roster.
  3. Add a new authority address or remove an existing one to demonstrate role-based access control (RBAC).
- **Voiceover/Text-to-Speech:** 
  > *"Finally, the system features robust Role-Based Access Control. Super Admins can dynamically add or remove municipal authorities from the roster via the smart contract, ensuring the system remains secure and up-to-date with current administrations."*

---

## 💡 Pro Tips for the Recording
1. **Pacing:** Keep the video moving. If a transaction takes a few seconds to mine on the local hardhat node, you can speed up that segment in post-production.
2. **Side-by-Side:** For a powerful visual, put the Citizen window on the left half of the screen and the Authority window on the right half during Act 3, showing real-time updates.
3. **Highlighting:** Use mouse highlighting/zooming (via your recording software) when pointing out the "GovID", "ZK Action Tickets", and transaction success toasts.
4. **Clean State:** Before recording, clear your browser's local storage and reset your MetaMask accounts (Settings -> Advanced -> Clear activity tab data) to prevent nonce errors with your local Hardhat node.
