/**
 * 模拟任务执行器。模拟 BullMQ worker 消费生成队列，驱动任务经历
 * queued(排队中) → processing(调用 AI 模型) → generating(生成图片中) →
 * completed(完成) / failed(生成失败)。
 * 真实后端替换为 BullMQ + Redis + SSE/WebSocket 推送。
 */
import { db } from "./db";
import { getAdapter } from "./adapters";
import { persistGeneratedImages } from "./image-storage";
import type { GenerateTask, GenerateParams } from "./types";
import { uid } from "./cn";

function assert(v: unknown, msg: string): asserts v {
  if (!v) throw new Error(msg);
}

/**
 * 版本树链路 —— 「继续修改」功能在任务上的投影。
 *
 * 分支任务由 /api/tasks/[id]/branch 创建，服务端把父任务的 model/service/参数
 * 继承过来，再叠加 overrides。这里只负责把这些链路字段写进任务对象，
 * 供画布视图（二期）和历史记录还原整棵树。
 */
interface TaskLineage {
  parentTaskId?: string;
  parentImageId?: string;
  branchId?: string;
  rootImageId?: string;
  editMode?: string;
  modificationPrompt?: string;
}

/** 创建任务并启动后台异步处理，返回该任务。 */
export function enqueueTask(
  params: GenerateParams,
  lineage?: TaskLineage
): GenerateTask {
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
    // 版本树链路 —— 根任务不传，字段保持 undefined
    parentTaskId: lineage?.parentTaskId,
    parentImageId: lineage?.parentImageId,
    branchId: lineage?.branchId,
    rootImageId: lineage?.rootImageId,
    editMode: lineage?.editMode as GenerateTask["editMode"],
    modificationPrompt: lineage?.modificationPrompt,
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
    // 状态流转：queued → processing
    await wait(400);
    patch({
      status: "processing",
      stage: "调用 AI 模型",
      progress: 12,
      startedAt: Date.now(),
    });

    // 状态流转：processing → generating（动画填充进度）
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
    // 同时记录 ID——一旦模型改名，仅靠名称匹配会失效；
    // 「复用这些参数」需要精确的 ID 才能回填表单。
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
    // 版本树链路 —— 让历史记录也能还原整棵分支树
    parentTaskId: task.parentTaskId,
    rootImageId: task.rootImageId,
  });
  if (db.history.length > 200) db.history.length = 200;
}

export function getTask(id: string): GenerateTask | undefined {
  return db.tasks.get(id);
}
