import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const Reporting = await ethers.getContractFactory("Reporting");
  console.log("Deploying Reporting contract...");

  const reporting = await Reporting.deploy();
  await reporting.waitForDeployment();

  const address = await reporting.getAddress();
  console.log("✅ Reporting deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});