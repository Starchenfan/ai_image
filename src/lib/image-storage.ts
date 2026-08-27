import mysql, {
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import type { GeneratedImage, GenerateTask, HistoryItem } from "./types";
import {
  readImage,
  optimizeImageForStorage,
} from "./image-utils";
import {
  persistGeneratedImagesLocal,
  listPersistedHistoryLocal,
  getPersistedHistoryItemLocal,
  setPersistedFavoriteLocal,
  deletePersistedHistoryLocal,
  getPersistedImageLocal,
} from "./local-image-store";

const globalForMysql = globalThis as unknown as {
  imageMysqlPool?: Pool;
  imageSchemaPromise?: Promise<void>;
};

/** 检查是否配置了 MySQL 图片数据库（MYSQL_USER 与 MYSQL_DATABASE 均需设置）。 */
export function isImageDatabaseConfigured() {
  return Boolean(process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function getPool() {
  if (!globalForMysql.imageMysqlPool) {
    globalForMysql.imageMysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 5,
      maxIdle: 5,
    });
  }
  return globalForMysql.imageMysqlPool;
}

async function ensureSchema() {
  if (!isImageDatabaseConfigured()) return;
  if (!globalForMysql.imageSchemaPromise) {
    globalForMysql.imageSchemaPromise = (async () => {
      const pool = getPool();
      await pool.execute(`CREATE TABLE IF NOT EXISTS generated_images (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        seed BIGINT NULL,
        image_data LONGBLOB NULL,
        prompt TEXT NULL,
        negative_prompt TEXT NULL,
        model_name VARCHAR(255) NULL,
        service_name VARCHAR(255) NULL,
        service_id VARCHAR(64) NULL,
        model_id VARCHAR(64) NULL,
        request_seed BIGINT NULL,
        aspect_ratio VARCHAR(32) NULL,
        image_size VARCHAR(32) NULL,
        parameters JSON NULL,
        cost_credits INT NOT NULL DEFAULT 0,
        duration_ms BIGINT NOT NULL DEFAULT 0,
        favorite TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        // 版本树链路 —— 「继续修改」产生分支任务时，把父任务 id 与根图 id
        // 写进每一张图，重启后 /history 仍能还原整棵分支树。
        parent_task_id VARCHAR(64) NULL,
        root_image_id VARCHAR(64) NULL,
        INDEX idx_generated_images_task_id (task_id),
        INDEX idx_generated_images_created_at (created_at),
        INDEX idx_generated_images_parent_task_id (parent_task_id)
      )`);

      const [columns] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM generated_images");
      const existing = new Set(columns.map((column) => String(column.Field)));
      const additions: Record<string, string> = {
        image_data: "LONGBLOB NULL",
        prompt: "TEXT NULL",
        negative_prompt: "TEXT NULL",
        model_name: "VARCHAR(255) NULL",
        service_name: "VARCHAR(255) NULL",
        service_id: "VARCHAR(64) NULL",
        model_id: "VARCHAR(64) NULL",
        request_seed: "BIGINT NULL",
        aspect_ratio: "VARCHAR(32) NULL",
        image_size: "VARCHAR(32) NULL",
        parameters: "JSON NULL",
        cost_credits: "INT NOT NULL DEFAULT 0",
        duration_ms: "BIGINT NOT NULL DEFAULT 0",
        favorite: "TINYINT(1) NOT NULL DEFAULT 0",
        parent_task_id: "VARCHAR(64) NULL",
        root_image_id: "VARCHAR(64) NULL",
      };

      for (const [column, definition] of Object.entries(additions)) {
        if (!existing.has(column)) {
          await pool.execute(`ALTER TABLE generated_images ADD COLUMN ${column} ${definition}`);
        }
      }
    })().catch((error) => {
      globalForMysql.imageSchemaPromise = undefined;
      throw error;
    });
  }
  await globalForMysql.imageSchemaPromise;
}

/**
 * 持久化生成的图片。配置了 MySQL 时写入 MySQL，否则使用本地文件系统回退方案
 * —— 两者契约相同，返回形状一致。任一后端发生故障时，静默降级并返回原始图片。
 */
export async function persistGeneratedImages(
  task: GenerateTask,
  images: GeneratedImage[]
): Promise<GeneratedImage[]> {
  if (!isImageDatabaseConfigured()) {
    return persistGeneratedImagesLocal(task, images);
  }

  try {
    await ensureSchema();
  } catch (error) {
    console.error("Failed to initialize generated_images:", error);
    return images;
  }

  const pool = getPool();

  return Promise.all(
    images.map(async (image) => {
      try {
        const source = await readImage(image.url);
        const { data, mimeType } = await optimizeImageForStorage(
          source.data,
          source.mimeType
        );
        const publicPath = `/api/images/${image.id}`;
        await pool.execute(
          `INSERT INTO generated_images (
            id, task_id, file_path, mime_type, width, height, seed, image_data,
            prompt, negative_prompt, model_name, service_name, service_id,
            model_id, request_seed, aspect_ratio,
            image_size, parameters, cost_credits, duration_ms, favorite, created_at,
            // 版本树链路 —— 分支任务的父任务 id 与根图 id，重启后仍可还原分支树
            parent_task_id, root_image_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            file_path = VALUES(file_path), mime_type = VALUES(mime_type),
            width = VALUES(width), height = VALUES(height), seed = VALUES(seed),
            image_data = VALUES(image_data), prompt = VALUES(prompt),
            negative_prompt = VALUES(negative_prompt), model_name = VALUES(model_name),
            service_name = VALUES(service_name), service_id = VALUES(service_id),
            model_id = VALUES(model_id), request_seed = VALUES(request_seed),
            aspect_ratio = VALUES(aspect_ratio),
            image_size = VALUES(image_size), parameters = VALUES(parameters),
            cost_credits = VALUES(cost_credits), duration_ms = VALUES(duration_ms),
            parent_task_id = VALUES(parent_task_id), root_image_id = VALUES(root_image_id)`,
          [
            image.id,
            task.id,
            publicPath,
            mimeType,
            image.width,
            image.height,
            image.seed,
            data,
            task.request.prompt,
            task.request.negativePrompt || null,
            task.model?.displayName || "Unknown",
            task.service?.name || "Unknown",
            task.request.serviceId || null,
            task.request.modelId || null,
            task.request.seed ?? null,
            task.request.aspectRatio,
            task.request.size,
            JSON.stringify(task.request.parameters),
            task.costCredits,
            task.durationMs || 0,
            task.favorite ? 1 : 0,
            new Date(task.completedAt || Date.now()),
            task.parentTaskId || null,
            task.rootImageId || null,
          ]
        );
        return { ...image, url: `/api/images/${image.id}` };
      } catch (error) {
        console.error(`Failed to persist image ${image.id}:`, error);
        return image;
      }
    })
  );
}

type HistoryRow = RowDataPacket & {
  id: string;
  task_id: string;
  file_path: string;
  mime_type: string;
  width: number;
  height: number;
  seed: number | string | null;
  has_image_data: number;
  prompt: string | null;
  negative_prompt: string | null;
  model_name: string | null;
  service_name: string | null;
  service_id: string | null;
  model_id: string | null;
  request_seed: number | string | null;
  aspect_ratio: string | null;
  image_size: string | null;
  parameters: unknown;
  cost_credits: number;
  duration_ms: number | string;
  favorite: number;
  created_at: Date | string;
  /** 版本树链路 —— 分支任务的父任务 id，根任务为 null。 */
  parent_task_id: string | null;
  /** 这条分支 ultimately 来自哪张根图对应的任务 id。 */
  root_image_id: string | null;
};

function parseParameters(value: unknown): HistoryItem["parameters"] {
  if (!value) return {};
  if (typeof value === "object" && !Buffer.isBuffer(value)) {
    return value as HistoryItem["parameters"];
  }
  try {
    return JSON.parse(Buffer.isBuffer(value) ? value.toString("utf8") : String(value));
  } catch {
    return {};
  }
}

/** 读取全部历史记录并按任务分组。MySQL 查询失败时返回 null，以便调用方回退。 */
export async function getPersistedHistory(): Promise<HistoryItem[] | null> {
  if (!isImageDatabaseConfigured()) {
    return listPersistedHistoryLocal();
  }
  try {
    await ensureSchema();
    const [rows] = await getPool().query<HistoryRow[]>(`SELECT
      id, task_id, file_path, mime_type, width, height, seed,
      image_data IS NOT NULL AS has_image_data, prompt, negative_prompt,
      model_name, service_name, service_id, model_id, request_seed,
      aspect_ratio, image_size, parameters,
      cost_credits, duration_ms, favorite, created_at,
      parent_task_id, root_image_id
      FROM generated_images
      ORDER BY created_at DESC, task_id, id`);

    const grouped = new Map<string, HistoryItem>();
    for (const row of rows) {
      const createdAt = new Date(row.created_at).getTime();
      const item = grouped.get(row.task_id) || {
        id: row.task_id,
        prompt: row.prompt || "",
        negativePrompt: row.negative_prompt || undefined,
        modelName: row.model_name || "Unknown",
        serviceName: row.service_name || "Unknown",
        serviceId: row.service_id || undefined,
        modelId: row.model_id || undefined,
        seed: row.request_seed === null ? undefined : Number(row.request_seed),
        aspectRatio: row.aspect_ratio || "1:1",
        size: row.image_size || `${row.width}x${row.height}`,
        count: 0,
        images: [],
        costCredits: Number(row.cost_credits || 0),
        durationMs: Number(row.duration_ms || 0),
        createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
        favorite: Boolean(row.favorite),
        parameters: parseParameters(row.parameters),
        // 版本树链路 —— 从持久化层原样带回，重启后分支树不丢
        parentTaskId: row.parent_task_id || undefined,
        rootImageId: row.root_image_id || undefined,
      };
      item.images.push({
        id: row.id,
        url: row.has_image_data ? `/api/images/${row.id}` : row.file_path,
        width: row.width,
        height: row.height,
        seed: Number(row.seed ?? -1),
      });
      item.count = item.images.length;
      grouped.set(row.task_id, item);
    }
    return [...grouped.values()];
  } catch (error) {
    console.error("Failed to read generated image history:", error);
    return null;
  }
}

/** 按 id 获取单条历史记录。MySQL 未配置时走本地文件，否则从全量历史中查找。 */
export async function getPersistedHistoryItem(id: string) {
  if (!isImageDatabaseConfigured()) {
    return getPersistedHistoryItemLocal(id);
  }
  return (await getPersistedHistory())?.find((item) => item.id === id);
}

/** 将指定任务下所有图片的收藏状态批量更新为 `favorite`，返回是否影响了行。 */
export async function setPersistedFavorite(taskId: string, favorite: boolean) {
  if (!isImageDatabaseConfigured()) {
    return setPersistedFavoriteLocal(taskId, favorite);
  }
  await ensureSchema();
  const [result] = await getPool().execute<ResultSetHeader>(
    "UPDATE generated_images SET favorite = ? WHERE task_id = ?",
    [favorite ? 1 : 0, taskId]
  );
  return result.affectedRows > 0;
}

/** 删除指定任务的所有图片记录，返回是否影响了行。 */
export async function deletePersistedHistory(taskId: string) {
  if (!isImageDatabaseConfigured()) {
    return deletePersistedHistoryLocal(taskId);
  }
  await ensureSchema();
  const [result] = await getPool().execute<ResultSetHeader>(
    "DELETE FROM generated_images WHERE task_id = ?",
    [taskId]
  );
  return result.affectedRows > 0;
}

/** 按图片 id 读取 LONGBLOB 字节与 mime 类型，不存在时返回 null。 */
export async function getPersistedImage(id: string) {
  if (!isImageDatabaseConfigured()) {
    return getPersistedImageLocal(id);
  }
  await ensureSchema();
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT image_data, mime_type FROM generated_images WHERE id = ? LIMIT 1",
    [id]
  );
  const row = rows[0] as { image_data?: Buffer; mime_type?: string } | undefined;
  if (!row?.image_data) return null;
  return { data: row.image_data, mimeType: row.mime_type || "image/png" };
}