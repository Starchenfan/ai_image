import fs from "node:fs/promises";
import path from "node:path";
import type { GenerateTask, GeneratedImage, HistoryItem } from "./types";
import { readImage, optimizeImageForStorage, imageFileExtension } from "./image-utils";

/**
 * Local file-system fallback for when MySQL is not configured.
 *
 *   public/generated-images/<image_id>.<ext>   — the image bytes, served
 *                                                statically at /generated-images/...
 *   .studio/generated/<task_id>.json            — one HistoryItem per task
 *
 * Both dirs are gitignored. No API route is needed for the images: Next.js
 * serves public/ as-is, so the rewritten URL points straight at the file.
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
      /* ignore — a missing image file is not a failure */
    }
  }
}

/** Write generated images to disk + record the task as a HistoryItem. */
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
  };
  await writeMeta(item);
  return out;
}

/** Read every persisted task, newest first. Returns null on read failure so
 *  callers can fall back to the in-memory history. */
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

export async function getPersistedHistoryItemLocal(taskId: string) {
  return readMeta(taskId);
}

export async function setPersistedFavoriteLocal(taskId: string, favorite: boolean) {
  const item = await readMeta(taskId);
  if (!item) return false;
  item.favorite = favorite;
  await writeMeta(item);
  return true;
}

export async function deletePersistedHistoryLocal(taskId: string) {
  const item = await readMeta(taskId);
  if (!item) return false;
  await deleteImageFiles(item.images.map((i) => i.id));
  await deleteMeta(taskId);
  return true;
}

/** Read a persisted image by id (used by /api/images/[id] when MySQL is on). */
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