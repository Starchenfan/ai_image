import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueTask } from "@/lib/task-runner";
import type { HistoryItem } from "@/lib/types";
import { getPersistedHistoryItem } from "@/lib/image-storage";

/**
 * POST /api/generate/:id/retry — 从历史记录重试生成。
 *
 * 按 id 加载历史记录（优先持久化存储，回退到内存 db.history），
 * 连带还原服务与模型（优先按 serviceId/modelId 查，回退到按名称匹配，
 * 再回退到任意在线服务 / 首个模型），用原始参数重新入队任务。
 *
 * 关键设计：必须带 API Key 入队，否则 adapter 会回落到 mock 占位图，
 * 重试必须打到与原任务相同的上游。
 *
 * 失败路径：
 *   - 404 历史记录不存在
 *   - 503 服务或模型不可用
 */
// POST /api/generate/:id/retry  — 从历史记录重试生成
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
    // 不带 Key 的话 adapter 会回落到 mock 占位图 —— 重试必须打到与原任务相同的上游。
    apiKey: db.apiKeys.get(service.id),
  });

  return NextResponse.json({ task });
}
