import hre from "hardhat";

async function main() {
  // Access ethers directly from the Hardhat Runtime Environment (hre)
  const [owner] = await hre.ethers.getSigners();
  
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  // Use getContractAt through hre.ethers
  const contract = await hre.ethers.getContractAt("Reporting", contractAddress);

  const relayerAddress = "0x39685Ab2Fddb6954095786f2f259570786719Ee2";

  console.log("Authorizing relayer...");
  const tx = await contract.setRelayer(relayerAddress, true);
  await tx.wait();

  const isAuthorized = await contract.authorizedRelayers(relayerAddress);
  console.log(`Relayer ${relayerAddress} authorized: ${isAuthorized}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});