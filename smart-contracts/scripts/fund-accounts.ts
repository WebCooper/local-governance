import { ethers } from "ethers";

// 1. Configure the RPC URL and the private key of the funded sender account.
// The Relayer account (0x3253678aF33758255f6d97069d9102597AFFf92c) is funded with 1000 ETH in genesis.json
const RPC_URL = "https://rpc.internalbuildtools.online";
const SENDER_PRIVATE_KEY = "0xda7a888d692c21e5882c5e7d5f29e001fc5424df7d52eb71098126da9266d24f";

// 2. Define the list of real accounts you want to fund (Super Admins, Authorities, etc.)
const TARGET_ADDRESSES = [
  "0x27794a007eFFBBFE6dB522560cAB6FfeA2cD4A36", // Super Admin 1
  "0xD019C08F95B5450F36Fcb8D1d4Ba8AB73B64fDA7", // Super Admin 2
  "0x2f82af1eDf8ddA7C6f87AFdc1B60Dc5cA4C76B23", // Super Admin 3
];

// Amount of ETH to send to each account (e.g., 10 ETH is plenty for thousands of transactions)
const FUND_AMOUNT_ETH = "10.0";

async function main() {
  console.log(`Connecting to private Geth RPC: ${RPC_URL}...`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const wallet = new ethers.Wallet(SENDER_PRIVATE_KEY, provider);
  console.log(`Sender Wallet Address: ${wallet.address}`);

  const senderBalance = await provider.getBalance(wallet.address);
  console.log(`Sender Wallet Balance: ${ethers.formatEther(senderBalance)} ETH\n`);

  if (senderBalance === 0n) {
    console.error("❌ Error: Sender wallet has 0 balance! Make sure the private key is correct and funded in genesis.");
    process.exit(1);
  }

  const fundAmount = ethers.parseEther(FUND_AMOUNT_ETH);

  for (const address of TARGET_ADDRESSES) {
    if (!ethers.isAddress(address)) {
      console.warn(`⚠️ Invalid address skipped: ${address}`);
      continue;
    }

    const currentBalance = await provider.getBalance(address);
    console.log(`Checking address: ${address}`);
    console.log(`- Current Balance: ${ethers.formatEther(currentBalance)} ETH`);

    // Fund the account if its balance is less than the target fund amount
    if (currentBalance < fundAmount) {
      const amountToSend = fundAmount - currentBalance;
      console.log(`- Sending ${ethers.formatEther(amountToSend)} ETH to reach target...`);

      try {
        const tx = await wallet.sendTransaction({
          to: address,
          value: amountToSend,
        });

        console.log(`- Transaction Sent! Hash: ${tx.hash}`);
        console.log("- Waiting for confirmation...");
        await tx.wait();

        const newBalance = await provider.getBalance(address);
        console.log(`- ✅ Success! New Balance: ${ethers.formatEther(newBalance)} ETH\n`);
      } catch (error) {
        console.error(`- ❌ Transaction failed for ${address}:`, error);
      }
    } else {
      console.log(`- ✅ Already has sufficient balance (${ethers.formatEther(currentBalance)} ETH). Skipping.\n`);
    }
  }

  console.log("🎉 Funding script execution completed.");
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
