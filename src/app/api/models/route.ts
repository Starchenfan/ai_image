import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/models?serviceId=xxx
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  let models = db.models.filter((m) => m.enabled);
  if (serviceId) models = models.filter((m) => m.serviceId === serviceId);
  models = [...models].sort((a, b) => a.sort - b.sort);
  return NextResponse.json({ models });
}
