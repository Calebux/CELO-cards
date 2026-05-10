import { redis } from "./redis";

export type MintRecord = {
  cardId: string;
  address: string;
  txHash: string | null;  // null = server-recorded (no on-chain tx yet)
  mintedAt: number;
  tokenId: number;
};

const NFT_COUNTER_KEY = "nft:counter";

export async function getNextTokenId(): Promise<number> {
  return redis.incr(NFT_COUNTER_KEY);
}

export async function getMintRecord(address: string, cardId: string): Promise<MintRecord | null> {
  return redis.get<MintRecord>(`nft:${address.toLowerCase()}:${cardId}`);
}

export async function getAllMintedCards(address: string): Promise<MintRecord[]> {
  const keys = await redis.keys(`nft:${address.toLowerCase()}:*`);
  if (!keys.length) return [];
  const records = await Promise.all(keys.map(k => redis.get<MintRecord>(k)));
  return records.filter((r): r is MintRecord => r !== null);
}

export async function recordMint(address: string, cardId: string, txHash: string | null): Promise<MintRecord> {
  const tokenId = await getNextTokenId();
  const record: MintRecord = {
    cardId,
    address: address.toLowerCase(),
    txHash,
    mintedAt: Date.now(),
    tokenId,
  };
  await redis.set(`nft:${address.toLowerCase()}:${cardId}`, record, { ex: 60 * 60 * 24 * 365 * 5 });
  return record;
}
