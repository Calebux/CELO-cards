/**
 * Deploy SeasonPassRegistry to Celo mainnet.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-season-pass.ts --network celo
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));

const TREASURY = "0xBa37dd0890AFc659a25331871319f66E7EBA3522" as const;

const deployerKey = process.env.TREASURY_PRIVATE_KEY;
if (!deployerKey) {
  console.error("❌  TREASURY_PRIVATE_KEY not set in .env.local");
  process.exit(1);
}

const artifact = JSON.parse(
  readFileSync(
    resolve(__dirname, "../artifacts/contracts/SeasonPassRegistry.sol/SeasonPassRegistry.json"),
    "utf8"
  )
) as { abi: unknown[]; bytecode: `0x${string}` };

async function main() {
  console.log("\nDeploying SeasonPassRegistry to Celo mainnet…");
  console.log(`  Treasury: ${TREASURY}`);

  const account = privateKeyToAccount(deployerKey as `0x${string}`);
  const publicClient  = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });
  const walletClient  = createWalletClient({ account, chain: celo, transport: http("https://forno.celo.org") });

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [TREASURY],
    gas: 800_000n,
  });

  console.log(`  Deploy tx: ${hash}`);
  console.log("  Waiting for confirmation…");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    console.error("❌  No contract address in receipt");
    process.exit(1);
  }

  console.log(`\n✅  SeasonPassRegistry deployed!`);
  console.log(`   Address : ${receipt.contractAddress}`);
  console.log(`\nNext steps:`);
  console.log(`  Add to .env.local + Vercel:\n  NEXT_PUBLIC_SEASON_PASS_CONTRACT=${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
