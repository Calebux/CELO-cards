# API Rate Limiting

Sensitive routes (payout, wager creation, username set) enforce per-wallet rate limits via Redis counters.
Limits reset on a rolling 60-second window.
Clients receive a 429 with a Retry-After header when the limit is exceeded.
