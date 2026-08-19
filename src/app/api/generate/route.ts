import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueTask } from "@/lib/task-runner";
import type { GenerateRequest } from "@/lib/types";

// POST /api/generate
export async function POST(req: Request) {
  const body = (await req.json()) as GenerateRequest;
  const service = db.services.find((s) => s.id === body.serviceId);
  const model = db.models.find((m) => m.id === body.modelId);

  if (!service) return NextResponse.json({ error: "service not found" }, { status: 404 });
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 });
  if (service.status !== "online")
    return NextResponse.json({ error: `服务 ${service.name} 当前不可用 (${service.status})` }, { status: 503 });
  if (!body.prompt?.trim())
    return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });

  const cost = model.priceCredits * body.count;
  if (db.credits < cost)
    return NextResponse.json({ error: "Credits 不足", cost, balance: db.credits }, { status: 402 });

  const task = enqueueTask({
    model,
    service,
    prompt: body.prompt,
    negativePrompt: body.negativePrompt,
    count: body.count,
    aspectRatio: body.aspectRatio,
    size: body.size,
    seed: body.seed,
    parameters: body.parameters,
    referenceImage: body.referenceImage,
    // Inject real key from server-side vault — never read from client.
    apiKey: db.apiKeys.get(service.id),
  });

  return NextResponse.json({ task });
}
