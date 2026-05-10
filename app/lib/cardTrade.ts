import { redis } from "./redis";

export type TradeOffer = {
  id: string;
  fromAddress: string;
  toAddress: string;
  offeredCardId: string;
  requestedCardId: string | null; // null = gift (no card requested back)
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: number;
  updatedAt: number;
};

const TRADE_TTL = 60 * 60 * 24 * 7; // 7 days

function tradeKey(id: string) {
  return `trade:${id}`;
}

function outboxKey(address: string) {
  return `trades:outbox:${address.toLowerCase()}`;
}

function inboxKey(address: string) {
  return `trades:inbox:${address.toLowerCase()}`;
}

export async function createTradeOffer(
  fromAddress: string,
  toAddress: string,
  offeredCardId: string,
  requestedCardId: string | null
): Promise<TradeOffer> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const offer: TradeOffer = {
    id,
    fromAddress: fromAddress.toLowerCase(),
    toAddress: toAddress.toLowerCase(),
    offeredCardId,
    requestedCardId,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await Promise.all([
    redis.set(tradeKey(id), offer, { ex: TRADE_TTL }),
    redis.lpush(outboxKey(fromAddress), id),
    redis.lpush(inboxKey(toAddress), id),
    redis.expire(outboxKey(fromAddress), TRADE_TTL),
    redis.expire(inboxKey(toAddress), TRADE_TTL),
  ]);

  return offer;
}

export async function getTradeOffer(id: string): Promise<TradeOffer | null> {
  return redis.get<TradeOffer>(tradeKey(id));
}

export async function updateTradeStatus(
  id: string,
  status: TradeOffer["status"]
): Promise<TradeOffer | null> {
  const offer = await getTradeOffer(id);
  if (!offer) return null;
  const updated = { ...offer, status, updatedAt: Date.now() };
  await redis.set(tradeKey(id), updated, { ex: TRADE_TTL });
  return updated;
}

async function resolveOffers(ids: string[]): Promise<TradeOffer[]> {
  if (!ids.length) return [];
  const offers = await Promise.all(ids.map(id => getTradeOffer(id)));
  return offers.filter((o): o is TradeOffer => o !== null);
}

export async function getInbox(address: string): Promise<TradeOffer[]> {
  const ids = await redis.lrange<string>(inboxKey(address), 0, 49);
  return resolveOffers(ids);
}

export async function getOutbox(address: string): Promise<TradeOffer[]> {
  const ids = await redis.lrange<string>(outboxKey(address), 0, 49);
  return resolveOffers(ids);
}
