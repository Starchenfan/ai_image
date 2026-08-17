import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/services
export async function GET() {
  // strip masked key before returning? keep it — it's already masked.
  return NextResponse.json({ services: db.services });
}
