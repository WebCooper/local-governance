import { ethers } from "ethers";

async function main() {
  const EMERGENCY_CONTRACT_ADDRESS = "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";
  const RPC_URL = "https://rpc.internalbuildtools.online";
  
  // Private key of the contract owner / deployer
  const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0xda7a888d692c21e5882c5e7d5f29e001fc5424df7d52eb71098126da9266d24f";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(DEPLOYER_KEY, provider);

  console.log("Connecting with wallet address:", wallet.address);

  const abi = [
    "function owner() external view returns (address)",
    "function authorizedAuthorities(address account) external view returns (bool)",
    "function setAuthority(address authority, bool authorized) external"
  ];

  const emergencyContract = new ethers.Contract(EMERGENCY_CONTRACT_ADDRESS, abi, wallet);

  const owner = await emergencyContract.owner();
  console.log("Contract Owner:", owner);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.warn("⚠️ Warning: Connected wallet is not the contract owner! Owner is:", owner);
  }

  const superAdminAddress = "0xda90b18Df16955Da5352C21D00d3ac4CDb52125b";
  const isAlreadyAuth = await emergencyContract.authorizedAuthorities(superAdminAddress);

  if (isAlreadyAuth) {
    console.log(`✅ Super Admin (${superAdminAddress}) is already an authorized authority!`);
  } else {
    console.log(`Granting authority access to Super Admin (${superAdminAddress})...`);
    const tx = await emergencyContract.setAuthority(superAdminAddress, true);
    console.log("Transaction sent:", tx.hash);
    await tx.wait();
    console.log(`✅ Successfully authorized Super Admin (${superAdminAddress}) on EmergencyReporting contract!`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
