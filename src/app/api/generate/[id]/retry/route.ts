import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueTask } from "@/lib/task-runner";
import type { HistoryItem } from "@/lib/types";
import { getPersistedHistoryItem } from "@/lib/image-storage";

// POST /api/generate/:id/retry  — retry from a history item
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const item: HistoryItem | undefined =
    (await getPersistedHistoryItem(params.id)) ?? db.history.find((h) => h.id === params.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const service =
    (item.serviceId ? db.services.find((s) => s.id === item.serviceId) : undefined) ??
    db.services.find((s) => s.name === item.serviceName && s.status === "online") ??
    db.services.find((s) => s.status === "online");
  const model =
    (item.modelId ? db.models.find((m) => m.id === item.modelId) : undefined) ??
    db.models.find((m) => m.displayName === item.modelName) ??
    db.models[0];

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
    // Without the key the adapter falls back to mock placeholders — a retry
    // has to hit the same upstream the original run did.
    apiKey: db.apiKeys.get(service.id),
  });

  return NextResponse.json({ task });
}
