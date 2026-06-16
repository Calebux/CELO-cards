# Payout API Route

The payout route validates match outcome, verifies the winner address, and transfers funds from treasury.
A Redis lock prevents double-pays on the same match ID.
Payout TTL ensures expired match claims are rejected cleanly.
