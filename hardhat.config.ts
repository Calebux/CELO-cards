import { HardhatUserConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DEPLOYER_KEY = process.env.TREASURY_PRIVATE_KEY;

const config: HardhatUserConfig = {
  plugins: [hardhatViem, hardhatNodeTestRunner, hardhatVerify],
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    celo: {
      type: "http",
      url: "https://forno.celo.org",
      chainId: 42220,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
    alfajores: {
      type: "http",
      url: "https://alfajores-forno.celo-testnet.org",
      chainId: 44787,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.CELOSCAN_API_KEY ?? "",
    },
    blockscout: {
      enabled: true,
    },
  },
  chainDescriptors: {
    42220: {
      name: "celo",
      blockExplorers: {
        etherscan: {
          name: "Celoscan",
          url: "https://celoscan.io",
          apiUrl: "https://api.celoscan.io/api",
        },
        blockscout: {
          name: "Celo Blockscout",
          url: "https://celo.blockscout.com",
          apiUrl: "https://celo.blockscout.com/api",
        },
      },
    },
  },
};

export default config;
