export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw.replace(/[\s()-]/g, "").trim();
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function maskPhoneForDisplay(phone: string | null | undefined): string | null {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) return null;
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}•••••${normalized.slice(-3)}`;
}
