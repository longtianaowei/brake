import { NextResponse } from "next/server";
import { bestFor, listLeaderboard, rankOf, submitScore, type ScoreInput } from "@/lib/db";

function pickNumber(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** 只接受物理上说得通的数据，避免排行榜被奇怪的值污染。 */
function parseScore(body: unknown): ScoreInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim().slice(0, 16) : "";
  if (!name) return null;

  const time = pickNumber(b.time, 1.5, 60);
  if (time === null) return null;

  return {
    name,
    time,
    reaction: pickNumber(b.reaction, 0, 10),
    entry: pickNumber(b.entry, 80, 130),
    peak: pickNumber(b.peak, 0, 4000),
    distance: pickNumber(b.distance, 0, 1000),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 16);

  const rows = listLeaderboard(limit);
  const me = name
    ? { name, best: bestFor(name), rank: rankOf(name) }
    : null;

  return NextResponse.json({ rows, me });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = parseScore(body);
  if (!parsed) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const result = submitScore(parsed);
  return NextResponse.json(result, { status: 201 });
}
