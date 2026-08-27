/**
 * Mock task runner. Simulates a BullMQ worker consuming the generate queue.
 * Progresses a task through queued → processing → generating → completed/failed.
 * Real backend: replace with BullMQ + Redis + SSE/WebSocket fan-out.
 */
import { db } from "./db";
import { getAdapter } from "./adapters";
import { persistGeneratedImages } from "./image-storage";
import type { GenerateTask, GenerateParams } from "./types";
import { uid } from "./cn";

function assert(v: unknown, msg: string): asserts v {
  if (!v) throw new Error(msg);
}

/** Create a task and kick off background processing. Returns the task. */
export function enqueueTask(params: GenerateParams): GenerateTask {
  const { model, service, count } = params;
  assert(model, "model missing");
  assert(service, "service missing");

  const task: GenerateTask = {
    id: uid("task"),
    status: "queued",
    progress: 0,
    stage: "排队中",
    request: {
      serviceId: service.id,
      modelId: model.id,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      count,
      aspectRatio: params.aspectRatio,
      size: params.size,
      seed: params.seed,
      parameters: params.parameters,
    },
    model,
    service,
    images: [],
    costCredits: model.priceCredits * count,
    createdAt: Date.now(),
  };

  db.tasks.set(task.id, task);
  void runTask(task.id, params);
  return task;
}

async function runTask(taskId: string, params: GenerateParams): Promise<void> {
  const task = db.tasks.get(taskId);
  if (!task) return;

  const patch = (p: Partial<GenerateTask>) => {
    const cur = db.tasks.get(taskId);
    if (!cur) return;
    Object.assign(cur, p);
  };

  try {
    // queued → processing
    await wait(400);
    patch({
      status: "processing",
      stage: "调用 AI 模型",
      progress: 12,
      startedAt: Date.now(),
    });

    // processing → generating (animate progress)
    patch({ status: "generating", stage: "生成图片中", progress: 28 });
    const total = Math.min(params.model.avgDurationSec * 1000, 12000);
    const ticks = 8;
    for (let i = 1; i <= ticks; i++) {
      await wait(total / ticks);
      patch({ progress: 28 + Math.round((60 * i) / ticks) });
    }

    const adapter = getAdapter(params.service.adapterType);
    const result = await adapter.generate(params);
    const completedAt = Date.now();
    const durationMs = completedAt - (task.startedAt ?? completedAt);
    const images = await persistGeneratedImages(
      { ...task, completedAt, durationMs },
      result.images
    );

    patch({
      status: "completed",
      progress: 100,
      stage: "完成",
      images,
      completedAt,
      durationMs,
    });

    db.credits = Math.max(0, db.credits - task.costCredits);
    pushHistory(task);
  } catch (e) {
    patch({
      status: "failed",
      stage: "生成失败",
      errorMessage: e instanceof Error ? e.message : String(e),
      completedAt: Date.now(),
      durationMs: task.startedAt ? Date.now() - task.startedAt : 0,
    });
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pushHistory(task: GenerateTask) {
  if (task.images.length === 0) return;
  db.history.unshift({
    id: task.id,
    prompt: task.request.prompt,
    negativePrompt: task.request.negativePrompt,
    modelName: task.model?.displayName ?? "Unknown",
    serviceName: task.service?.name ?? "Unknown",
    // Ids too — name matching breaks the moment a model is renamed, and
    // "reuse these params" needs the exact ids to refill the form.
    serviceId: task.request.serviceId,
    modelId: task.request.modelId,
    seed: task.request.seed,
    aspectRatio: task.request.aspectRatio,
    size: task.request.size,
    count: task.request.count,
    images: task.images,
    costCredits: task.costCredits,
    durationMs: task.durationMs ?? 0,
    createdAt: task.completedAt ?? Date.now(),
    parameters: task.request.parameters,
  });
  if (db.history.length > 200) db.history.length = 200;
}

export function getTask(id: string): GenerateTask | undefined {
  return db.tasks.get(id);
}
