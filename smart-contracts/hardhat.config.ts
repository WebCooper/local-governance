import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@nomicfoundation/hardhat-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          evmVersion: "london", // Instructs compiler to avoid PUSH0
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "london", // Instructs compiler to avoid PUSH0
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
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    gethPrivate: {
      type: "http", 
      chainType: "l1", 
      url: "https://rpc.internalbuildtools.online",
      chainId: 1337,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")], 
      gasPrice: 1000000000,
      timeout:120000
    },
  }
});