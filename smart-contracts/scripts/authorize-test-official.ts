import { ethers } from "hardhat";

async function main() {
    // Grab standard signers from the hardhat node environment configuration matrix
    const [deployer] = await ethers.getSigners();

    const reportingAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const targetOfficialWallet = "0x90f79bf6eb2c4f870365e785982e1f101e93b906"; // Hardhat Node 03Account #2 or your customized relayer address

    console.log(`Using deployer signature address: ${deployer.address}`);

    // Directly bind and target the instance using local interfaces
    const reportingContract = await ethers.getContractAt("Reporting", reportingAddress);

    console.log(`Authorizing wallet address [${targetOfficialWallet}] inside registry...`);
    // Add authority via direct transaction assignment
    const tx = await reportingContract.addAuthority(targetOfficialWallet);
    await tx.wait();

    const isAuthorized = await reportingContract.authorizedAuthorities(targetOfficialWallet);
    console.log(`✅ Success! Authority active state status evaluated: ${isAuthorized}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});