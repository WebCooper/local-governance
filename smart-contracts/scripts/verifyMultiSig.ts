import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 Verifying AuthorityMultiSig via raw Ethers on localhost...");

  // Contract Addresses from your deployment output
  const REPORTING_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const MULTI_SIG_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

  // Connect to the local Hardhat Node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/");

  // Default hardhat private keys
  const privateKeys = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // 5 (newAuthority)
  ];

  const superAdmin1 = new ethers.Wallet(privateKeys[0], provider);
  const superAdmin2 = new ethers.Wallet(privateKeys[1], provider);
  const superAdmin3 = new ethers.Wallet(privateKeys[2], provider);
  const newAuthority = new ethers.Wallet(privateKeys[5], provider);

  // Load ABIs
  const multiSigAbi = JSON.parse(fs.readFileSync(path.resolve("artifacts/contracts/AuthorityMultiSig.sol/AuthorityMultiSig.json"), "utf8")).abi;
  const reportingAbi = JSON.parse(fs.readFileSync(path.resolve("artifacts/contracts/Reporting.sol/Reporting.json"), "utf8")).abi;

  // Contract Instances
  const AuthorityMultiSig = new ethers.Contract(MULTI_SIG_ADDRESS, multiSigAbi, superAdmin1);
  const Reporting = new ethers.Contract(REPORTING_ADDRESS, reportingAbi, superAdmin1);

  // 1. Verify Super Admins
  const isAdmin = await AuthorityMultiSig.isSuperAdmin(superAdmin1.address);
  console.log(`✅ Super Admin 1 verified: ${isAdmin} (${superAdmin1.address})`);

  // 2. Verify Ownership
  const owner = await Reporting.owner();
  console.log(`✅ Reporting Contract Owner: ${owner} (Expected: ${MULTI_SIG_ADDRESS})`);

  console.log(`\n--- Initiating Multi-Sig Proposal ---`);
  console.log(`Targeting to add new Authority: ${newAuthority.address}`);

  // 3. Submit Proposal to add a new Authority
  const tx1 = await AuthorityMultiSig.submitProposal(newAuthority.address, 2);
  await tx1.wait();
  console.log(`✅ Super Admin 1 submitted proposal and automatically voted.`);

  // 4. Vote from Super Admin 2
  const AuthorityMultiSig2 = AuthorityMultiSig.connect(superAdmin2) as any;
  const tx2 = await AuthorityMultiSig2.vote(1);
  await tx2.wait();
  console.log(`✅ Super Admin 2 voted Yes.`);

  // 5. Vote from Super Admin 3
  const AuthorityMultiSig3 = AuthorityMultiSig.connect(superAdmin3) as any;
  const tx3 = await AuthorityMultiSig3.vote(1);
  await tx3.wait();
  console.log(`✅ Super Admin 3 voted Yes. (Majority Reached!)`);

  // 6. Verify Execution
  const proposal = await AuthorityMultiSig.proposals(1);
  console.log(`\nProposal Status:`);
  console.log(`- Executed: ${proposal.executed}`);
  console.log(`- Votes: ${proposal.votes.toString()}/3 required`);

  const isAuthorized = await Reporting.authorizedAuthorities(newAuthority.address);
  console.log(`\n🎉 New Authority Authorized in Reporting.sol: ${isAuthorized}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
