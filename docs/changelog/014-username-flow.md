# Username Registration Flow

Players can set a display name tied to their wallet address.
Usernames are stored in Redis and surfaced on the leaderboard and profile page.
A debounced availability check prevents duplicate registrations.
