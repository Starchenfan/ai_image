import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maskKey } from "@/lib/mask";
import { uid } from "@/lib/cn";
import type { AiModel } from "@/lib/types";

/**
 * NewAPI / One-API / OpenAI-compat relay importer.
 *
 * These relays (newapi, one-api, oneapi forks) all expose:
 *   GET {baseUrl}/models  → { data: [{ id, object, owned_by }] }
 * They DO NOT distinguish image vs chat models — the list is everything
 * the upstream gateway routes. So discovery is two-step:
 *   1. list  → fetch the full model id set
 *   2. probe → (optional, client-side) send a tiny generate request per
 *              candidate to see which actually return images
 *
 * This route handles step 1 (list) + the bulk import (create service +
 * selected models). The relay is treated as an `openai` adapter —
 * OpenAICompatAdapter already speaks POST /images/generations.
 */

type ListedModel = { id: string; owned_by?: string };

// GET /api/admin/import/newapi?baseUrl=...&apiKey=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = (url.searchParams.get("baseUrl") || "").replace(/\/$/, "");
  const apiKey = url.searchParams.get("apiKey") || "";

  if (!baseUrl) {
    return NextResponse.json({ error: "baseUrl 必填" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey 必填" }, { status: 400 });
  }

  // Relay exposes GET {baseUrl}/models (OpenAI shape).
  const listUrl = `${baseUrl}/models`;
  let models: ListedModel[] = [];
  try {
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: AbortSignal.timeout(15000) as any,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `中转站返回 ${res.status}: ${detail.slice(0, 200) || res.statusText}` },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { data?: ListedModel[] };
    models = data.data ?? [];
  } catch (e) {
    return NextResponse.json(
      { error: `连接失败: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Heuristic: relays often prefix/suffix image models. We can't know for
  // sure which are image-capable without probing, so we return everything
  // with a best-effort "likely image" flag for the common markers.
  const IMAGE_MARKERS = [
    "image", "dall", "flux", "sd", "stable", "midjourney", "mj",
    "kolors", "wanx", "cogview", "qwen-image", "sensenova", "u1",
    "seedream", "imagen", "ideogram", "recraft", "playground",
  ];
  const items = models.map((m) => {
    const id = m.id.toLowerCase();
    const likelyImage = IMAGE_MARKERS.some((mk) => id.includes(mk));
    return { id: m.id, ownedBy: m.owned_by, likelyImage };
  });

  return NextResponse.json({
    baseUrl,
    apiKeyMasked: maskKey(apiKey),
    count: items.length,
    items,
  });
}

// POST /api/admin/import/newapi  (bulk create service + selected models)
export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    baseUrl: string;
    apiKey: string;
    /** model ids selected by the user */
    modelIds: string[];
    /** optional per-model size list; falls back to a sane default */
    sizes?: string[];
  };

  const baseUrl = body.baseUrl.replace(/\/$/, "");
  if (!baseUrl || !body.apiKey || !body.modelIds?.length) {
    return NextResponse.json(
      { error: "baseUrl / apiKey / modelIds 必填" },
      { status: 400 }
    );
  }

  const serviceId = uid("svc");
  const svc = {
    id: serviceId,
    name: body.name || "NewAPI 中转",
    adapterType: "openai" as const,
    baseUrl,
    apiKeyMasked: maskKey(body.apiKey),
    status: "online" as const,
    latencyMs: 6000,
    recommended: false,
    tags: ["中转", "OpenAI-compat"],
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.services.push(svc);
  db.apiKeys.set(serviceId, body.apiKey);

  const sizes = body.sizes?.length
    ? body.sizes
    : ["1024x1024", "1536x1536", "2048x2048"];

  const created: AiModel[] = body.modelIds.map((mid, i) => ({
    id: uid("mdl"),
    serviceId,
    displayName: mid,
    modelId: mid,
    description: `从 NewAPI 中转导入 · ${mid}`,
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      negativePrompt: true,
      variations: false,
    },
    parameters: [],
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    supportedSizes: sizes,
    maxBatch: 1,
    priceCredits: 4,
    avgDurationSec: 12,
    rating: undefined,
    tags: ["中转", "导入"],
    enabled: true,
    sort: db.models.length + i,
  }));
  db.models.push(...created);

  return NextResponse.json({ service: svc, models: created });
}
