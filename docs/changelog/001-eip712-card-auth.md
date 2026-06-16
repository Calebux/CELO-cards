# EIP-712 Card Progress Authentication

Replaced `personal_sign` with `eth_signTypedData_v4` for card attunement updates.
Removes the MiniPay bypass that previously skipped signature verification.
All wallets now sign a typed `AttunementUpdate` domain message before any card state is written.
