# Error Handling

Error states should degrade gracefully rather than crash wallet-sensitive routes.
This is most critical on profile, purchase, payout, and provider-heavy screens where a hard failure breaks the user session.
