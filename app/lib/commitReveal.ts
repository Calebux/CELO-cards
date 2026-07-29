import { keccak256, toBytes } from "viem";

// Commit-reveal for card orders (C-01 / H-08). A player commits to their round
// order as a hash without revealing it; once BOTH players have committed, each
// reveals (order + salt) and the server checks the reveal matches the commit
// before resolving the round. This makes it impossible to read or overwrite the
// opponent's order after seeing it, and binds the resolved outcome to orders
// that were locked in before either side knew the other's.
//
// The salt is a per-player, per-round random value the client generates. Without
// it the commit would be brute-forceable (the order space is small); with it the
// commit is opaque until reveal.

export function computeOrderCommit(cardIds: string[], salt: string): `0x${string}` {
  // Canonical encoding — arrangement is the play, so order is significant.
  return keccak256(toBytes(`${cardIds.join(",")}|${salt}`));
}

export function verifyOrderReveal(cardIds: string[], salt: string, commit: string): boolean {
  if (typeof salt !== "string" || salt.length < 8) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(commit)) return false;
  return computeOrderCommit(cardIds, salt).toLowerCase() === commit.toLowerCase();
}
