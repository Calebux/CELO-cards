/**
 * Deploy KnockOrderArena to Celo mainnet using viem directly.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network celo
 *   (or just: npx tsx scripts/deploy.ts for celo mainnet)
 *
 * After deploy, set NEXT_PUBLIC_ARENA_ADDRESS in .env.local + Vercel.
 */

import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoAlfajores } from "viem/chains";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));

const CUSD_MAINNET   = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const CUSD_ALFAJORES = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1" as const;

const NETWORK = process.argv[process.argv.indexOf("--network") + 1] ?? "celo";
const IS_MAINNET = NETWORK === "celo";

const chain = IS_MAINNET ? celo : celoAlfajores;
const cusdAddress = IS_MAINNET ? CUSD_MAINNET : CUSD_ALFAJORES;
const rpc = IS_MAINNET
  ? "https://forno.celo.org"
  : "https://alfajores-forno.celo-testnet.org";

const deployerKey = process.env.TREASURY_PRIVATE_KEY;
if (!deployerKey) {
  console.error("❌  TREASURY_PRIVATE_KEY not set in .env.local");
  process.exit(1);
}

// Load compiled artifact
const artifact = JSON.parse(
  readFileSync(
    resolve(__dirname, "../artifacts/contracts/KnockOrderArena.sol/KnockOrderArena.json"),
    "utf8"
  )
) as { abi: unknown[]; bytecode: `0x${string}` };

async function main() {
  console.log(`\nDeploying KnockOrderArena to ${chain.name}…`);
  console.log(`  cUSD: ${cusdAddress}`);

  const account = privateKeyToAccount(deployerKey as `0x${string}`);

  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpc) });

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [cusdAddress],
    gas: 2_000_000n, // manual gas — Celo RPC rejects estimateGas without `from`
  });

  console.log(`  Deploy tx: ${hash}`);
  console.log("  Waiting for confirmation…");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    console.error("❌  No contract address in receipt");
    process.exit(1);
  }

  console.log(`\n✅  KnockOrderArena deployed!`);
  console.log(`   Address : ${receipt.contractAddress}`);
  console.log(`   Network : ${chain.name}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Add to .env.local:\n     NEXT_PUBLIC_ARENA_ADDRESS=${receipt.contractAddress}`);
  console.log(`  2. Add the same env var in Vercel dashboard`);
  console.log(`  3. Fund the contract with cUSD for payouts (need ≥ 0.18 cUSD per match):`);
  console.log(`     Send cUSD to ${receipt.contractAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
