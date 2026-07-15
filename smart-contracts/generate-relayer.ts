import { ethers } from "ethers";

function main() {
  // Create a securely randomized new wallet instance
  const wallet = ethers.Wallet.createRandom();

  console.log("🎉 New Relayer Key Pair Generated Successfully!\n");
  console.log("Public Address: ", wallet.address);
  console.log("Private Key:    ", wallet.privateKey);
  console.log("\n⚠️  Action Items:");
  console.log("1. Copy the Private Key into your backend-relayer .env file as RELAYER_PRIVATE_KEY");
  console.log("2. Important: Your deployer or authority nodes must fund this Public Address with native Ether before it can submit transactions, even if gasPrice is 0!");
}

main();