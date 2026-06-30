import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 Verifying AuthorityMultiSig via raw Ethers on localhost...");

  // Update these to match your exact deployed addresses from your Ignition output!
  const REPORTING_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const MULTI_SIG_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545/");

  const privateKeys = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Admin 1
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Admin 2
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Admin 3
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // Target Authority Wallet
  ];

  const superAdmin1 = new ethers.Wallet(privateKeys[0], provider);
  const superAdmin2 = new ethers.Wallet(privateKeys[1], provider);
  const superAdmin3 = new ethers.Wallet(privateKeys[2], provider);
  const newAuthority = new ethers.Wallet(privateKeys[5], provider);

  const multiSigAbi = JSON.parse(fs.readFileSync(path.resolve("artifacts/contracts/AuthorityMultiSig.sol/AuthorityMultiSig.json"), "utf8")).abi;
  const reportingAbi = JSON.parse(fs.readFileSync(path.resolve("artifacts/contracts/Reporting.sol/Reporting.json"), "utf8")).abi;

  const AuthorityMultiSig = new ethers.Contract(MULTI_SIG_ADDRESS, multiSigAbi, superAdmin1);
  const Reporting = new ethers.Contract(REPORTING_ADDRESS, reportingAbi, superAdmin1);

  // 1. Double check current Admin initialization
  const isAdmin = await AuthorityMultiSig.isSuperAdmin(superAdmin1.address);
  console.log(`\nSuper Admin 1 status check: ${isAdmin} (${superAdmin1.address})`);

  console.log(`\n--- Initiating Multi-Sig Proposal ---`);
  console.log(`Targeting to authorize new Account: ${newAuthority.address}`);

  // 2. Submit proposal from Super Admin 1
  // Action type '2' represents addAuthority inside your governance definition mapping
  const tx1 = await AuthorityMultiSig.submitProposal(newAuthority.address, 2);
  const receipt1 = await tx1.wait();
  console.log(`✅ Super Admin 1 submitted proposal successfully.`);

  // 3. Inspect transaction events or read state variables to dynamically get our precise target proposalId
  let targetProposalId = 3;
  try {
    // If your contract maps a public tracking count variable like proposalCount or nextProposalId
    const currentProposalCount = await AuthorityMultiSig.proposalCount();
    targetProposalId = Number(currentProposalCount);
  } catch {
    try {
      const nextId = await AuthorityMultiSig.nextProposalId();
      targetProposalId = Number(nextId) - 1;
    } catch {
      console.log("Could not locate on-chain counter properties. Defaulting calculation track to ID: 1");
    }
  }

  console.log(`🎯 Target Proposal Index Identified: ${targetProposalId}`);

  // 4. Cast votes from Super Admin 2 & 3 against our target identifier index
  console.log(`Casting vote from Super Admin 2...`);
  const AuthorityMultiSig2 = AuthorityMultiSig.connect(superAdmin2) as any;
  const tx2 = await AuthorityMultiSig2.vote(targetProposalId);
  await tx2.wait();
  console.log(`✅ Super Admin 2 voted Yes.`);

  console.log(`Casting vote from Super Admin 3...`);
  const AuthorityMultiSig3 = AuthorityMultiSig.connect(superAdmin3) as any;
  const tx3 = await AuthorityMultiSig3.vote(targetProposalId);
  await tx3.wait();
  console.log(`✅ Super Admin 3 voted Yes. (Majority Reached!)`);

  // 5. Trigger explicit execution using our calculated variable parameter
  console.log(`\n--- Triggering Proposal Execution ---`);
  try {
    const txExec = await AuthorityMultiSig.executeProposal(targetProposalId);
    await txExec.wait();
    console.log(`✅ Proposal #${targetProposalId} has been successfully executed on-chain!`);
  } catch (err: any) {
    console.log(`❌ Execution failed. Error detail check: ${err.reason || err.message}`);
  }

  // 6. Verify and output results
  const proposal = await AuthorityMultiSig.proposals(targetProposalId);
  console.log(`\nFinal Proposal Status:`);
  console.log(`- Executed: ${proposal.executed}`);
  console.log(`- Tally Count: ${proposal.votes.toString()} votes registered`);

  const isAuthorized = await Reporting.authorizedAuthorities(newAuthority.address);
  console.log(`\n🎉 New Authority Active Status in Reporting.sol: ${isAuthorized}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });