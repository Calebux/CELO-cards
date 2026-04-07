import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DEPLOYER_KEY = process.env.TREASURY_PRIVATE_KEY;

const config: HardhatUserConfig = {
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
};

export default config;
