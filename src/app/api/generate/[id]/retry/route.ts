import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueTask } from "@/lib/task-runner";
import type { HistoryItem } from "@/lib/types";

// POST /api/generate/:id/retry  — retry from a history item
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const item: HistoryItem | undefined = db.history.find((h) => h.id === params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const service = db.services.find(
    (s) => s.name === item.serviceName && s.status === "online"
  ) ?? db.services.find((s) => s.status === "online");
  const model = db.models.find((m) => m.displayName === item.modelName) ?? db.models[0];

  if (!service || !model)
    return NextResponse.json({ error: "service/model unavailable" }, { status: 503 });

  const task = enqueueTask({
    model,
    service,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    count: item.count,
    aspectRatio: item.aspectRatio,
    size: item.size,
    seed: -1,
    parameters: item.parameters,
  });

  return NextResponse.json({ task });
}
