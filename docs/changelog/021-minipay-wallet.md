# MiniPay Wallet Integration

Auto-detects the MiniPay injected provider on page load.
Wallet connection retries up to three times to handle slow WebView injection timing.
Skips the RainbowKit modal entirely when running inside MiniPay.
