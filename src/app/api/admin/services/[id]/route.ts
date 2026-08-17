import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maskKey } from "@/lib/mask";
import type { AiService, AdapterType } from "@/lib/types";

// GET /api/admin/services/:id
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const svc = db.services.find((s) => s.id === params.id);
  if (!svc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const models = db.models.filter((m) => m.serviceId === svc.id);
  return NextResponse.json({ service: svc, models });
}

// PATCH /api/admin/services/:id
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const svc = db.services.find((s) => s.id === params.id);
  if (!svc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as Partial<AiService> & { apiKey?: string };
  if (body.name) svc.name = body.name;
  if (body.adapterType) svc.adapterType = body.adapterType as AdapterType;
  if (body.baseUrl !== undefined) svc.baseUrl = body.baseUrl;
  if (body.status) svc.status = body.status;
  if (typeof body.latencyMs === "number") svc.latencyMs = body.latencyMs;
  if (typeof body.recommended === "boolean") svc.recommended = body.recommended;
  if (body.tags) svc.tags = body.tags;
  if (body.apiKey) {
    svc.apiKeyMasked = maskKey(body.apiKey);
    db.apiKeys.set(params.id, body.apiKey);
  }
  return NextResponse.json({ service: svc });
}

// DELETE /api/admin/services/:id
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const idx = db.services.findIndex((s) => s.id === params.id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  db.services.splice(idx, 1);
  db.models = db.models.filter((m) => m.serviceId !== params.id);
  db.apiKeys.delete(params.id);
  return NextResponse.json({ ok: true });
}
