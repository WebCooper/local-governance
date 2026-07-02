import { Wallet } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  // Point this directly to your node1 keystore file path from the root workspace
  // Adjust the relative path if running directly from inside the smart-contracts folder
  const keystorePath = path.resolve(
    "..", // Go up to workspace root if needed, or point directly to the blockchain/ folder
    "blockchain",
    "node1", 
    "keystore", 
    "UTC--2026-04-15T05-38-49.459885451Z--7e687086d737d5a06d13926505b7fd5281aedc23"
  );

  // Read the keystore file
  const keystoreJson = fs.readFileSync(keystorePath, "utf8");

  // Load the password from your password.txt file
  const passwordPath = path.resolve("..", "blockchain", "node1", "password.txt");
  const password = fs.readFileSync(passwordPath, "utf8").trim(); 

  console.log("Decrypting keystore... (this may take a few seconds)");

  try {
    const wallet = await Wallet.fromEncryptedJson(keystoreJson, password);
    console.log("\n✅ Decryption Successful!");
    console.log("Address:     ", wallet.address);
    console.log("Private Key: ", wallet.privateKey);
    console.log("\n⚠️  Copy this Private Key into your Hardhat keystore. Never share it!");
  } catch (error) {
    console.error("\n❌ Failed to decrypt. Please check your password and file path.", error);
  }
}

main();