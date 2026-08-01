import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatEthersPlugin from "@nomicfoundation/hardhat-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import fs from "node:fs";
import path from "node:path";

function getEnvKey(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (process.env[`HARDHAT_VAR_${key}`]) return process.env[`HARDHAT_VAR_${key}`];
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const [k, ...v] = trimmed.split("=");
          if (k.trim() === key) {
            return v.join("=").trim();
          }
        }
      }
    }
  } catch {}
  return undefined;
}

const deployerKey = getEnvKey("DEPLOYER_PRIVATE_KEY");
const gethAccounts = deployerKey ? [deployerKey] : [configVariable("DEPLOYER_PRIVATE_KEY")];

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin, hardhatEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          evmVersion: "london",
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "london", 
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
   hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || configVariable("SEPOLIA_RPC_URL"),
      accounts: [process.env.SEPOLIA_PRIVATE_KEY || configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    gethPrivate: {
      type: "http",
      chainType: "l1",
      url: "https://rpc.internalbuildtools.online",
      chainId: 1337,
      accounts: gethAccounts,
      timeout: 120000
    },
  }
});