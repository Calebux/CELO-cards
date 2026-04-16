import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "leaderboard.json");

// Returns a live-ish player count:
//  - real unique players from leaderboard
//  - + house bots (10 always running)
//  - + small random variance so the number feels alive
export async function GET() {
  let realCount = 0;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as { casual: Record<string, unknown>; ranked: Record<string, unknown> };
    const allAddrs = new Set([...Object.keys(data.casual ?? {}), ...Object.keys(data.ranked ?? {})]);
    realCount = allAddrs.size;
  } catch {
    realCount = 0;
  }

  const houseBots = 10;
  const variance = Math.floor(Math.random() * 6); // 0-5
  const online = realCount + houseBots + variance;

  return NextResponse.json({ online });
}
