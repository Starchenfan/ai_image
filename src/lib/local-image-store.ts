import fs from "node:fs/promises";
import path from "node:path";
import type { GenerateTask, GeneratedImage, HistoryItem } from "./types";
import { readImage, optimizeImageForStorage, imageFileExtension } from "./image-utils";

/**
 * 本地文件系统回退方案，用于未配置 MySQL 的场景。
 *
 *   public/generated-images/<image_id>.<ext>   — 图片字节，由 Next.js
 *                                                静态服务于 /generated-images/...
 *   .studio/generated/<task_id>.json            — 每个任务对应一个 HistoryItem
 *
 * 两个目录均已加入 gitignore。图片无需额外 API 路由：Next.js 直接按
 * public/ 的原样提供静态文件服务，因此重写后的 URL 直接指向文件。
 */

const IMAGES_DIR = path.join(process.cwd(), "public", "generated-images");
const META_DIR = path.join(process.cwd(), ".studio", "generated");

async function ensureDirs() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(META_DIR, { recursive: true });
}

function metaPath(taskId: string) {
  return path.join(META_DIR, `${taskId}.json`);
}

async function readMeta(taskId: string): Promise<HistoryItem | null> {
  try {
    const raw = await fs.readFile(metaPath(taskId), "utf8");
    return JSON.parse(raw) as HistoryItem;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error(`Failed to read local image metadata for ${taskId}:`, e);
    return null;
  }
}

async function writeMeta(item: HistoryItem): Promise<void> {
  await ensureDirs();
  await fs.writeFile(metaPath(item.id), JSON.stringify(item), "utf8");
}

async function deleteMeta(taskId: string): Promise<void> {
  try {
    await fs.unlink(metaPath(taskId));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

async function deleteImageFiles(imageIds: string[]): Promise<void> {
  for (const id of imageIds) {
    try {
      const files = await fs.readdir(IMAGES_DIR);
      const match = files.find((f) => f.startsWith(`${id}.`));
      if (match) await fs.unlink(path.join(IMAGES_DIR, match));
    } catch {
      /* 忽略 —— 图片文件不存在不算失败 */
    }
  }
}

/** 将生成的图片写入磁盘，并把该任务记录为一条 HistoryItem。 */
export async function persistGeneratedImagesLocal(
  task: GenerateTask,
  images: GeneratedImage[]
): Promise<GeneratedImage[]> {
  await ensureDirs();
  const out: GeneratedImage[] = [];

  for (const image of images) {
    try {
      const source = await readImage(image.url);
      const { data, mimeType } = await optimizeImageForStorage(source.data, source.mimeType);
      const ext = imageFileExtension(mimeType);
      const filePath = path.join(IMAGES_DIR, `${image.id}.${ext}`);
      await fs.writeFile(filePath, data);
      out.push({ ...image, url: `/generated-images/${image.id}.${ext}` });
    } catch (error) {
      console.error(`Failed to persist image ${image.id} locally:`, error);
      out.push(image);
    }
  }

  const item: HistoryItem = {
    id: task.id,
    prompt: task.request.prompt,
    negativePrompt: task.request.negativePrompt,
    modelName: task.model?.displayName ?? "Unknown",
    serviceName: task.service?.name ?? "Unknown",
    serviceId: task.request.serviceId,
    modelId: task.request.modelId,
    seed: task.request.seed,
    aspectRatio: task.request.aspectRatio,
    size: task.request.size,
    count: out.length,
    images: out,
    costCredits: task.costCredits,
    durationMs: task.durationMs ?? 0,
    createdAt: task.completedAt ?? Date.now(),
    favorite: task.favorite ?? false,
    parameters: task.request.parameters,
    // 版本树链路 —— 本地后端也要带上，重启后分支树不丢
    parentTaskId: task.parentTaskId,
    parentImageId: task.parentImageId,
    rootImageId: task.rootImageId,
  };
  await writeMeta(item);
  return out;
}

/** 读取所有已持久化的任务，按创建时间倒序（最新在前）。读取失败时返回 null，
 *  以便调用方回退到内存中的历史记录。 */
export async function listPersistedHistoryLocal(): Promise<HistoryItem[] | null> {
  try {
    await ensureDirs();
    const files = (await fs.readdir(META_DIR)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return [];
    const items = await Promise.all(files.map((f) => readMeta(f.replace(/\.json$/, ""))));
    return items
      .filter((x): x is HistoryItem => !!x)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Failed to read local image history:", error);
    return null;
  }
}

/** 按 taskId 从磁盘读取单条已持久化的历史记录，不存在时返回 null。 */
export async function getPersistedHistoryItemLocal(taskId: string) {
  return readMeta(taskId);
}

/** 更新指定任务的收藏状态。若任务不存在则返回 false，否则写回磁盘并返回 true。 */
export async function setPersistedFavoriteLocal(taskId: string, favorite: boolean) {
  const item = await readMeta(taskId);
  if (!item) return false;
  item.favorite = favorite;
  await writeMeta(item);
  return true;
}

/** 删除指定任务的历史记录及其所有图片文件。任务不存在时返回 false。 */
export async function deletePersistedHistoryLocal(taskId: string) {
  const item = await readMeta(taskId);
  if (!item) return false;
  await deleteImageFiles(item.images.map((i) => i.id));
  await deleteMeta(taskId);
  return true;
}

/** 按 id 读取已持久化的图片（MySQL 启用时由 /api/images/[id] 路由使用）。 */
export async function getPersistedImageLocal(id: string) {
  try {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    const files = await fs.readdir(IMAGES_DIR);
    const match = files.find((f) => f.startsWith(`${id}.`));
    if (!match) return null;
    const data = await fs.readFile(path.join(IMAGES_DIR, match));
    const ext = match.split(".").pop()?.toLowerCase() ?? "png";
    const mimeType =
      ext === "webp" ? "image/webp" :
      ext === "png" ? "image/png" :
      ext === "jpg" ? "image/jpeg" :
      "image/png";
    return { data, mimeType };
  } catch {
    return null;
  }
}