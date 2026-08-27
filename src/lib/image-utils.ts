import sharp from "sharp";
import type { GeneratedImage } from "./types";

/** 将 data URL 解析为 { mimeType, data }。MySQL 后端与本地后端共用同一实现。 */
export function decodeDataUrl(url: string) {
  const match = /^data:([^;,]+)((?:;[^,]*)*),(.*)$/s.exec(url);
  if (!match) throw new Error("Invalid image data URL");
  const [, mimeType, params, body] = match;
  const isBase64 = params.includes("base64");
  return {
    mimeType,
    data: isBase64
      ? Buffer.from(body, "base64")
      : Buffer.from(decodeURIComponent(body)),
  };
}

/** 从 data URL 或远程 URL 读取图片，返回 Buffer 与 mime 类型。 */
export async function readImage(url: string): Promise<{ data: Buffer; mimeType: string }> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return {
    mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    data: Buffer.from(await response.arrayBuffer()),
  };
}

/** 读取 IMAGE_STORAGE_WEBP_QUALITY 环境变量作为 WebP 输出质量，夹在 1–100 之间，默认 90。 */
function imageStorageQuality() {
  const configured = Number(process.env.IMAGE_STORAGE_WEBP_QUALITY || 90);
  return Number.isFinite(configured) ? Math.min(100, Math.max(1, configured)) : 90;
}

/**
 * 将图片转为高质量 WebP 后再存储。GIF/SVG 不做转换，直接保留；
 * 若 WebP 体积达不到原始图片的 95%（即节省不足 5%），则保留原始图片。
 * 转换失败时静默降级，仍保存原始图片。
 */
export async function optimizeImageForStorage(data: Buffer, mimeType: string) {
  if (mimeType === "image/gif" || mimeType === "image/svg+xml") {
    return { data, mimeType };
  }

  try {
    const optimized = await sharp(data, { animated: false })
      .rotate()
      .webp({
        quality: imageStorageQuality(),
        alphaQuality: 100,
        effort: 4,
        smartSubsample: true,
      })
      .toBuffer();

    if (optimized.length >= data.length * 0.95) return { data, mimeType };
    return { data: optimized, mimeType: "image/webp" };
  } catch (error) {
    console.warn("Image optimization failed; storing the source image:", error);
    return { data, mimeType };
  }
}

/** 把存储时的 mime 类型映射为文件扩展名。 */
export function imageFileExtension(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/avif") return "avif";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

/** 重新导出，便于仅消费类型的模块继续引用。 */
export type { GeneratedImage };