import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/history?filter=all|today|favorite
export async function GET(req: Request) {
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  let items = db.history;
  const now = Date.now();
  if (filter === "today") items = items.filter((i) => now - i.createdAt < 86_400_000);
  if (filter === "favorite") items = items.filter((i) => i.favorite);
  return NextResponse.json({ items });
}

// DELETE /api/history/:id  (handled in [id])
