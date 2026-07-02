import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect() as any;
  const { ethers } = connection;

  const pollingAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
  const OpinionPolling = await ethers.getContractAt("OpinionPolling", pollingAddress);

  const citizenPubKey = "0x47abdfcD7F4EAC35f24979419d8228D0DC519FAE";
  const pollId = 2;
  const domainSalt = "CivicReport-v1";

  const voteNullifier = ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'string'],
    [citizenPubKey, pollId, domainSalt]
  );

  console.log(`Computed Nullifier: ${voteNullifier}`);
  
  const hasVoted = await OpinionPolling.nullifierVoted(pollId, voteNullifier);
  console.log(`Has Voted: ${hasVoted}`);
}

main().catch(console.error);
