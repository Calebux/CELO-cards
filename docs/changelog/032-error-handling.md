# Graceful Error Handling

Network errors during match submission surface a user-facing retry prompt.
Redis failures fall back to a stale-read rather than throwing a 500.
Wallet rejection errors are caught and dismissed without blocking the UI.
