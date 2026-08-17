import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/credits
export async function GET() {
  return NextResponse.json({ credits: db.credits, autoFailover: db.autoFailover });
}

// PATCH /api/credits  (toggle auto-failover / admin top-up)
export async function PATCH(req: Request) {
  const body = (await req.json()) as { autoFailover?: boolean; add?: number };
  if (typeof body.autoFailover === "boolean") db.autoFailover = body.autoFailover;
  if (typeof body.add === "number") db.credits += body.add;
  return NextResponse.json({ credits: db.credits, autoFailover: db.autoFailover });
}
