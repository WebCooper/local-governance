import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect() as any;
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  // Address of opinion polling contract from deployed_addresses.json
  const pollingAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  const OpinionPolling = await ethers.getContractAt("OpinionPolling", pollingAddress);

  const pollId = 1;
  const optionIndex = 0;
  const nullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier1")); // Example or check what exists

  console.log("Simulating castVote...");
  try {
    const tx = await OpinionPolling.castVote.staticCall(pollId, optionIndex, nullifier);
    console.log("Static call succeeded! No revert.", tx);
  } catch (error: any) {
    console.error("Simulation failed! Revert details:");
    console.error("Error Name:", error.errorName);
    console.error("Error Args:", error.errorArgs);
    console.error("Full Error Message:", error.message);
  }
}

main().catch(console.error);
