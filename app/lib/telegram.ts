export type NewMatchAlert = {
  matchId: string;
  mode: "wager" | "ranked" | "tournament";
  hostName?: string | null;
  hostAddress?: string | null;
};

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function sendTelegramNewMatchAlert(payload: NewMatchAlert): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://action-order.xyz";
  const joinUrl = `${baseUrl.replace(/\/$/, "")}/join?id=${encodeURIComponent(payload.matchId)}`;
  const modeLabel = payload.mode === "tournament" ? "tourney" : payload.mode;
  const hostLabel = payload.hostName?.trim()
    ? payload.hostName.trim()
    : payload.hostAddress
      ? truncateAddress(payload.hostAddress)
      : "unknown";

  const text = [
    "New game created",
    `Mode: ${modeLabel}`,
    `Match ID: ${payload.matchId}`,
    `Host: ${hostLabel}`,
    `Join: ${joinUrl}`,
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch {
    // best-effort only; gameplay should never fail due to Telegram issues
  }
}

