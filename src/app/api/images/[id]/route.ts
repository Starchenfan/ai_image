import { NextResponse } from "next/server";
import sharp from "sharp";
import { getPersistedImage } from "@/lib/image-storage";

const MAX_WIDTH = 2048;
const CACHE_LIMIT = 200;

// 缩略图进程内缓存。挂在 globalThis 上，避免 dev HMR 重跑模块时缓存丢失。
// LRU 语义靠 Map 插入顺序：命中时重插到末尾，超限淘汰最旧条目。
const globalForThumbs = globalThis as unknown as {
  imageThumbCache?: Map<string, { data: Buffer; mimeType: string }>;
};

function getThumbCache() {
  if (!globalForThumbs.imageThumbCache) {
    globalForThumbs.imageThumbCache = new Map();
  }
  return globalForThumbs.imageThumbCache;
}

function cacheGet(key: string) {
  const cache = getThumbCache();
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: { data: Buffer; mimeType: string }) {
  const cache = getThumbCache();
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const image = await getPersistedImage(params.id);
  if (!image) return NextResponse.json({ error: "image not found" }, { status: 404 });

  // ?w=<px> — 画布节点等小尺寸场景请求缩略图，避免把全尺寸生成图
  // （常见 1024+ WebP）塞进 240px 节点：解码与 GPU 纹理开销是拖拽卡顿主因。
  // GIF/SVG 不做缩放（动图会丢帧、矢量无意义），原样返回。
  const rawWidth = new URL(req.url).searchParams.get("w");
  const targetWidth = rawWidth ? Number(rawWidth) : 0;
  const scalable =
    image.mimeType !== "image/gif" && image.mimeType !== "image/svg+xml";

  if (scalable && Number.isFinite(targetWidth) && targetWidth > 0) {
    const width = Math.min(MAX_WIDTH, Math.max(16, Math.round(targetWidth)));
    const cacheKey = `${params.id}:${width}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return new NextResponse(new Uint8Array(cached.data), {
        headers: {
          "Content-Type": cached.mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    try {
      const data = await sharp(image.data)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      const thumb = { data, mimeType: "image/webp" };
      cacheSet(cacheKey, thumb);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch (error) {
      // 缩放失败时回退原图，不阻塞显示。
      console.error(`Failed to thumbnail image ${params.id}:`, error);
    }
  }

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
