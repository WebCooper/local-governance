import { ethers } from "ethers";

/**
 * Script to submit an AddAuthority proposal on the live AuthorityMultiSig contract.
 * Because AuthorityMultiSig owns both Reporting and EmergencyReporting, adding an Authority
 * via an AddAuthority proposal automatically calls setAuthority(target, true) on BOTH contracts
 * once 3 out of 4 Super Admins vote YES.
 */
async function main() {
  const MULTISIG_ADDRESS = "0xc57D3318b7c547eC6478C0Be4835f7444C57Dc68";
  const RPC_URL = "https://rpc.internalbuildtools.online";
  
  // To submit a proposal on AuthorityMultiSig, the caller MUST be one of the 4 Super Admins:
  // [0] 0x416109618A1f1A89C7Fd156be62b5fc734745340 (Janitha)
  // [1] 0x22c3488E96fccE1077365309A92e6BD895a00AAf (Hansika)
  // [2] 0xA7Fe174054755c27c870772f47E52081c4b250b5 (Lavindu)
  // [3] 0xda90b18Df16955Da5352C21D00d3ac4CDb52125b (Malitha)
  const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_PRIVATE_KEY;
  if (!SUPER_ADMIN_KEY) {
    console.error("❌ Please set SUPER_ADMIN_PRIVATE_KEY environment variable with a Super Admin private key.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(SUPER_ADMIN_KEY, provider);

  console.log("Connected as Super Admin:", wallet.address);

  const abi = [
    "function isSuperAdmin(address account) external view returns (bool)",
    "function submitProposal(address target, uint8 actionType, uint256 durationInDays, string calldata name, string calldata position, string calldata department) external returns (uint256)",
    "function vote(uint256 proposalId, bool support) external"
  ];

  const multiSig = new ethers.Contract(MULTISIG_ADDRESS, abi, wallet);

  const isAdmin = await multiSig.isSuperAdmin(wallet.address);
  if (!isAdmin) {
    console.error("❌ Connected address is not a registered Super Admin on AuthorityMultiSig!");
    process.exit(1);
  }

  // ActionType.AddAuthority = 2
  const targetSuperAdmin = "0xda90b18Df16955Da5352C21D00d3ac4CDb52125b"; // Malitha
  const actionType = 2; // AddAuthority
  const durationInDays = 7;
  const name = "Malitha Jeewaka";
  const position = "Super Admin / Authority";
  const department = "Municipal Council";

  console.log(`Submitting AddAuthority proposal for ${targetSuperAdmin}...`);
  const tx = await multiSig.submitProposal(
    targetSuperAdmin,
    actionType,
    durationInDays,
    name,
    position,
    department
  );
  console.log("Transaction sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Proposal submitted successfully in block:", receipt?.blockNumber);
  console.log("\nNote: Since required quorum is 3/4 Super Admins, 2 additional Super Admins must call vote(proposalId, true) to execute the proposal.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
