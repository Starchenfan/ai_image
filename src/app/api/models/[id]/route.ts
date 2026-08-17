import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/models/:id
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const model = db.models.find((m) => m.id === params.id);
  if (!model) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ model });
}
