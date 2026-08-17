import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AiModel } from "@/lib/types";

// GET /api/admin/models/:id
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const model = db.models.find((m) => m.id === params.id);
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ model });
}

// PATCH /api/admin/models/:id
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const model = db.models.find((m) => m.id === params.id);
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as Partial<AiModel>;
  Object.assign(model, body);
  return NextResponse.json({ model });
}

// DELETE /api/admin/models/:id
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const idx = db.models.findIndex((m) => m.id === params.id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.models.splice(idx, 1);
  return NextResponse.json({ ok: true });
}
