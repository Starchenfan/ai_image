import { NextResponse } from "next/server";
import { getTask } from "@/lib/task-runner";

// GET /api/tasks/:id  (polling fallback)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const task = getTask(params.id);
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ task });
}
