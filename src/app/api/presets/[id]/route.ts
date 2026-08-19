import { NextResponse } from "next/server";
import { deletePreset } from "@/lib/presets";

// DELETE /api/presets/:id
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const ok = await deletePreset(params.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
