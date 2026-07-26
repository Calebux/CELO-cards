import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../lib/redis";
import { createTradeOffer, getTradeOffer, updateTradeStatus, getInbox, getOutbox } from "../../lib/cardTrade";
import { checkRateLimit } from "../../lib/rateLimit";
import { CARDS } from "../../lib/gameData";

export const dynamic = "force-dynamic";

const PENDING_GRANTS_TTL = 60 * 60 * 24 * 30; // 30 days

function ownedPremiumKey(address: string) {
  return `owned-premium:${address.toLowerCase()}`;
}

function grantKey(address: string) {
  return `trade-grants:${address.toLowerCase()}`;
}

function revokeKey(address: string) {
  return `trade-revokes:${address.toLowerCase()}`;
}

function revokeSeenKey(address: string) {
  return `trade-revokes-seen:${address.toLowerCase()}`;
}

function isPremiumCardId(cardId: string | null | undefined): cardId is string {
  return !!cardId && CARDS.some((card) => card.id === cardId && card.isPremium);
}

// GET /api/trade?address=0x...&view=inbox|outbox|grants
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const view = req.nextUrl.searchParams.get("view") ?? "inbox";

  if (view === "grants") {
    const [grants, queuedRevokes, outbox, inbox, seenRevokes] = await Promise.all([
      redis.lrange<string>(grantKey(address), 0, -1),
      redis.lrange<string>(revokeKey(address), 0, -1),
      getOutbox(address),
      getInbox(address),
      redis.smembers(revokeSeenKey(address)),
    ]);
    const seen = new Set(seenRevokes);
    const inferredRevokes: string[] = [];
    const newlySeen: string[] = [];

    // Backfill older accepted trades created before revocation queues existed.
    for (const offer of outbox) {
      const seenId = `out:${offer.id}:${offer.offeredCardId}`;
      if (offer.status === "accepted" && !seen.has(seenId)) {
        inferredRevokes.push(offer.offeredCardId);
        newlySeen.push(seenId);
        await redis.srem(ownedPremiumKey(address), offer.offeredCardId);
        await redis.sadd(ownedPremiumKey(offer.toAddress), offer.offeredCardId);
      }
    }
    for (const offer of inbox) {
      if (!offer.requestedCardId) continue;
      const seenId = `in:${offer.id}:${offer.requestedCardId}`;
      if (offer.status === "accepted" && !seen.has(seenId)) {
        inferredRevokes.push(offer.requestedCardId);
        newlySeen.push(seenId);
        await redis.srem(ownedPremiumKey(address), offer.requestedCardId);
        await redis.sadd(ownedPremiumKey(offer.fromAddress), offer.requestedCardId);
      }
    }

    if (newlySeen.length) {
      await redis.sadd(revokeSeenKey(address), ...newlySeen);
      await redis.expire(revokeSeenKey(address), PENDING_GRANTS_TTL);
    }

    const revokes = [...queuedRevokes, ...inferredRevokes];
    if (grants.length || revokes.length) {
      await redis.del(grantKey(address), revokeKey(address));
    }
    return NextResponse.json({ grants, revokes });
  }

  const offers = view === "outbox" ? await getOutbox(address) : await getInbox(address);

  // Resolve usernames for counterparties so the client can show names
  // instead of wallet addresses (MiniPay: never display addresses).
  const counterparties = [...new Set(offers.map(o => (view === "outbox" ? o.toAddress : o.fromAddress).toLowerCase()))];
  const names: Record<string, string> = {};
  if (counterparties.length > 0) {
    const values = await redis.mget<string>(...counterparties.map(a => `user:addr:${a}`));
    counterparties.forEach((a, i) => {
      if (values[i]) names[a] = values[i];
    });
  }
  return NextResponse.json({ offers, names });
}

// POST /api/trade — create a new trade offer
// Body: { fromAddress, toUsername, offeredCardId, requestedCardId? }
// (toAddress is still accepted for backwards compatibility, but the client
// sends usernames only — MiniPay apps must not request wallet addresses.)
export async function POST(req: NextRequest) {
  let body: { fromAddress?: string; toAddress?: string; toUsername?: string; offeredCardId?: string; requestedCardId?: string | null };
  try { body = await req.json() as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromAddress = body.fromAddress?.toLowerCase();
  let toAddress = body.toAddress?.toLowerCase();
  const toUsername = body.toUsername?.trim();
  const { offeredCardId, requestedCardId = null } = body;

  if (!fromAddress || !/^0x[0-9a-f]{40}$/.test(fromAddress)) {
    return NextResponse.json({ error: "Invalid sender address" }, { status: 400 });
  }
  if (toUsername) {
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(toUsername)) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }
    const resolved = await redis.get<string>(`user:name:${toUsername.toLowerCase()}`);
    if (!resolved) {
      return NextResponse.json({ error: "No player found with that username. Ask them to set a username in their Profile." }, { status: 404 });
    }
    toAddress = resolved.toLowerCase();
  }
  if (!toAddress || !/^0x[0-9a-f]{40}$/.test(toAddress)) {
    return NextResponse.json({ error: "Recipient username is required" }, { status: 400 });
  }
  if (!offeredCardId || typeof offeredCardId !== "string") {
    return NextResponse.json({ error: "offeredCardId is required" }, { status: 400 });
  }
  if (!isPremiumCardId(offeredCardId)) {
    return NextResponse.json({ error: "Unknown card" }, { status: 400 });
  }
  if (requestedCardId && !isPremiumCardId(requestedCardId)) {
    return NextResponse.json({ error: "Unknown requested card" }, { status: 400 });
  }
  if (fromAddress === toAddress) {
    return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:trade:${fromAddress}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const owned = await redis.smembers(ownedPremiumKey(fromAddress));
  if (!owned.includes(offeredCardId)) {
    return NextResponse.json({ error: "You no longer own that card." }, { status: 409 });
  }

  const offer = await createTradeOffer(fromAddress, toAddress, offeredCardId, requestedCardId ?? null);
  return NextResponse.json({ ok: true, offer });
}

// PATCH /api/trade — accept, decline, or cancel an offer
// Body: { tradeId, action: 'accept'|'decline'|'cancel', address }
export async function PATCH(req: NextRequest) {
  let body: { tradeId?: string; action?: string; address?: string };
  try { body = await req.json() as typeof body; } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tradeId, action, address } = body;
  if (!tradeId || !action || !address) {
    return NextResponse.json({ error: "tradeId, action, and address are required" }, { status: 400 });
  }

  const addr = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const allowed = await checkRateLimit(`ratelimit:trade-action:${addr}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const offer = await getTradeOffer(tradeId);
  if (!offer) return NextResponse.json({ error: "Trade offer not found" }, { status: 404 });
  if (offer.status !== "pending") return NextResponse.json({ error: "Offer is no longer pending" }, { status: 409 });

  if (action === "cancel") {
    if (offer.fromAddress !== addr) return NextResponse.json({ error: "Only the sender can cancel" }, { status: 403 });
    const updated = await updateTradeStatus(tradeId, "cancelled");
    return NextResponse.json({ ok: true, offer: updated });
  }

  if (action === "decline") {
    if (offer.toAddress !== addr) return NextResponse.json({ error: "Only the recipient can decline" }, { status: 403 });
    const updated = await updateTradeStatus(tradeId, "declined");
    return NextResponse.json({ ok: true, offer: updated });
  }

  if (action === "accept") {
    if (offer.toAddress !== addr) return NextResponse.json({ error: "Only the recipient can accept" }, { status: 403 });

    const senderOwned = await redis.smembers(ownedPremiumKey(offer.fromAddress));
    if (!senderOwned.includes(offer.offeredCardId)) {
      const updated = await updateTradeStatus(tradeId, "cancelled");
      return NextResponse.json({ error: "Sender no longer owns that card.", offer: updated }, { status: 409 });
    }

    if (offer.requestedCardId) {
      const recipientOwned = await redis.smembers(ownedPremiumKey(addr));
      if (!recipientOwned.includes(offer.requestedCardId)) {
        return NextResponse.json({ error: "You no longer own the requested card." }, { status: 409 });
      }
    }

    const updated = await updateTradeStatus(tradeId, "accepted");

    // Move offered card to recipient. Gifts transfer ownership, so the sender
    // can buy the same card again after the gift is accepted.
    await redis.srem(ownedPremiumKey(offer.fromAddress), offer.offeredCardId);
    await redis.sadd(ownedPremiumKey(addr), offer.offeredCardId);
    await redis.lpush(grantKey(addr), offer.offeredCardId);
    await redis.expire(grantKey(addr), PENDING_GRANTS_TTL);
    await redis.lpush(revokeKey(offer.fromAddress), offer.offeredCardId);
    await redis.expire(revokeKey(offer.fromAddress), PENDING_GRANTS_TTL);

    // If it's a swap, move requested card back to sender.
    if (offer.requestedCardId) {
      await redis.srem(ownedPremiumKey(addr), offer.requestedCardId);
      await redis.sadd(ownedPremiumKey(offer.fromAddress), offer.requestedCardId);
      await redis.lpush(grantKey(offer.fromAddress), offer.requestedCardId);
      await redis.expire(grantKey(offer.fromAddress), PENDING_GRANTS_TTL);
      await redis.lpush(revokeKey(addr), offer.requestedCardId);
      await redis.expire(revokeKey(addr), PENDING_GRANTS_TTL);
    }

    return NextResponse.json({ ok: true, offer: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
