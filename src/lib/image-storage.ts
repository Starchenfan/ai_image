import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql, { type Pool } from "mysql2/promise";
import type { GeneratedImage } from "./types";

const globalForMysql = globalThis as unknown as { imageMysqlPool?: Pool };

function isConfigured() {
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
    });
  }
  return globalForMysql.imageMysqlPool;
}

function extensionFor(mimeType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return extensions[mimeType.toLowerCase()] || "bin";
}

function decodeDataUrl(url: string) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!match) throw new Error("Invalid image data URL");
  const [, mimeType, base64, body] = match;
  return {
    mimeType,
    data: base64 ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body)),
  };
}

async function readImage(url: string) {
  if (url.startsWith("data:")) return decodeDataUrl(url);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return {
    mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    data: Buffer.from(await response.arrayBuffer()),
  };
}

/**
 * Saves generated images under public/generated-images and records their
 * public paths in MySQL. If MySQL is not configured, the original URLs remain.
 */
export async function persistGeneratedImages(
  taskId: string,
  images: GeneratedImage[]
): Promise<GeneratedImage[]> {
  if (!isConfigured()) return images;

  const outputDir = path.join(process.cwd(), "public", "generated-images");
  await mkdir(outputDir, { recursive: true });
  const pool = getPool();

  return Promise.all(
    images.map(async (image) => {
      try {
        const { data, mimeType } = await readImage(image.url);
        const fileName = `${image.id}.${extensionFor(mimeType)}`;
        const publicPath = `/generated-images/${fileName}`;
        await writeFile(path.join(outputDir, fileName), data);
        await pool.execute(
          `INSERT INTO generated_images
            (id, task_id, file_path, mime_type, width, height, seed)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
            file_path = VALUES(file_path), mime_type = VALUES(mime_type),
            width = VALUES(width), height = VALUES(height), seed = VALUES(seed)`,
          [
            image.id,
            taskId,
            publicPath,
            mimeType,
            image.width,
            image.height,
            image.seed,
          ]
        );
        return { ...image, url: publicPath };
      } catch (error) {
        console.error(`Failed to persist image ${image.id}:`, error);
        return image;
      }
    })
  );
}
