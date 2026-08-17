import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AiService, AdapterType } from "@/lib/types";
import { uid } from "@/lib/cn";
import { maskKey } from "@/lib/mask";

// GET /api/admin/services
export async function GET() {
  return NextResponse.json({ services: db.services });
}

// POST /api/admin/services  (add)
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<AiService> & { apiKey?: string };
  const svc: AiService = {
    id: uid("svc"),
    name: body.name || "New Service",
    adapterType: (body.adapterType as AdapterType) || "openai",
    baseUrl: body.baseUrl || "",
    apiKeyMasked: body.apiKey ? maskKey(body.apiKey) : "—",
    status: body.status || "online",
    latencyMs: body.latencyMs ?? 1500,
    recommended: body.recommended,
    tags: body.tags,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.services.push(svc);
  // Real key → server-side vault only. Never serialized to client.
  if (body.apiKey) db.apiKeys.set(svc.id, body.apiKey);
  return NextResponse.json({ service: svc });
}
