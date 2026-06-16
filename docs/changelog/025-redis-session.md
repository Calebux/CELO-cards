# Redis Match Session State

Active match state is written to Redis on creation and read by both players.
State keys carry a short TTL so abandoned matches clean themselves up automatically.
All writes are idempotent to handle reconnects and duplicate submissions safely.
