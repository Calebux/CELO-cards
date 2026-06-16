# Remove MiniPay Auth Bypass

The `isMiniPay` flag that previously allowed unsigned card-progress writes has been removed.
The API route now always requires a valid wallet signature regardless of client type.
This closes a privilege escalation path where any caller claiming to be MiniPay could write arbitrary attunement data.
