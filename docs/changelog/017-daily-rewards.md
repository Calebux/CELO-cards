# Daily Reward System

Players can claim a small reward once per calendar day.
Claim state is tracked in Redis with a TTL that resets at midnight UTC.
Rewards scale with current season pass status.
