import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// DELETE /api/history/:id
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const idx = db.history.findIndex((h) => h.id === params.id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.history.splice(idx, 1);
  return NextResponse.json({ ok: true });
}

// PATCH /api/history/:id  (toggle favorite)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const item = db.history.find((h) => h.id === params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as { favorite?: boolean };
  if (typeof body.favorite === "boolean") item.favorite = body.favorite;
  return NextResponse.json({ item });
}
