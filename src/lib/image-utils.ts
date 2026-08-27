import sharp from "sharp";
import type { GeneratedImage } from "./types";

/** Parse a data URL into { mimeType, data }. Shared by MySQL + local backends. */
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

/** Read an image from a data URL or remote URL into a Buffer. */
export async function readImage(url: string): Promise<{ data: Buffer; mimeType: string }> {
  if (url.startsWith("data:")) return decodeDataUrl(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return {
    mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    data: Buffer.from(await response.arrayBuffer()),
  };
}

function imageStorageQuality() {
  const configured = Number(process.env.IMAGE_STORAGE_WEBP_QUALITY || 90);
  return Number.isFinite(configured) ? Math.min(100, Math.max(1, configured)) : 90;
}

/**
 * Convert to high-quality WebP for storage. GIF/SVG are left alone, and the
 * source is kept when WebP does not save at least 5%.
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

/** Map a stored mime type to a file extension. */
export function imageFileExtension(mimeType: string): string {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/avif") return "avif";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

/** Re-exported so type-only consumers keep working. */
export type { GeneratedImage };