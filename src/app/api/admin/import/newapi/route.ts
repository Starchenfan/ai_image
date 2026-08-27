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

/** Users paste URLs from chat/docs with stray backticks, quotes or spaces —
 *  strip them so the probe doesn't fail on a technically-invalid host. */
function cleanBaseUrl(raw: string): string {
  return raw.trim().replace(/[`'"　\s]+/g, "").replace(/\/+$/, "");
}

// GET /api/admin/import/newapi?baseUrl=...&apiKey=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = cleanBaseUrl(url.searchParams.get("baseUrl") || "");
  const apiKey = (url.searchParams.get("apiKey") || "").trim();

  if (!baseUrl) {
    return NextResponse.json({ error: "baseUrl 必填" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "apiKey 必填" }, { status: 400 });
  }

  // NewAPI / one-api mount the OpenAI API under /v1 (e.g. {base}/v1/models),
  // but users often paste the root URL. Probe /v1 first, then /models, and
  // remember which base actually returns JSON so the service is stored with
  // the right prefix — generation later calls {base}/images/generations.
  const hasV1 = /\/v1\/?$/.test(baseUrl);
  const candidates = hasV1
    ? [{ apiBase: baseUrl, listUrl: `${baseUrl}/models` }]
    : [
        { apiBase: `${baseUrl}/v1`, listUrl: `${baseUrl}/v1/models` },
        { apiBase: baseUrl, listUrl: `${baseUrl}/models` },
      ];

  for (const { apiBase, listUrl } of candidates) {
    let models: ListedModel[] = [];
    try {
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signal: AbortSignal.timeout(15000) as any,
      });
      // HTML means we hit the relay's web dashboard (SPA), not its API — try
      // the next candidate path.
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) continue;

      const data = (await res.json()) as { data?: ListedModel[]; error?: unknown };
      // 401/403 = the endpoint exists but the key is rejected → definitive.
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: `中转站返回 ${res.status}: ${JSON.stringify(data).slice(0, 200)}` },
          { status: 502 }
        );
      }
      // Other non-ok JSON (404/500) = likely a wrong path → try next candidate.
      if (!res.ok) continue;
      models = data.data ?? [];

      // 启发式：中转站常常给图像模型加前缀/后缀。不经探测无法确定哪些真的能出图，
      // 因此返回全部模型，并对常见标记打一个「可能为图像模型」的粗略标记。
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
        baseUrl: apiBase,
        apiKeyMasked: maskKey(apiKey),
        count: items.length,
        items,
      });
    } catch (e) {
      // Surface the real network cause — bare "fetch failed" tells the user nothing.
      const err = e as Error & { cause?: { code?: string; message?: string } };
      const code = err.cause?.code;
      const hint =
        code === "ENOTFOUND"
          ? "域名无法解析（ENOTFOUND），请检查地址是否拼写正确、DNS 是否已生效"
          : code === "ECONNREFUSED"
          ? "连接被拒绝（ECONNREFUSED），请确认端口与服务是否开启"
          : code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT"
          ? "连接超时，请检查网络、防火墙，或该中转是否需走代理"
          : code === "CERT_HAS_EXPIRED" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
          ? "TLS 证书校验失败，请检查证书是否有效"
          : err.message;
      return NextResponse.json({ error: `连接失败: ${hint}` }, { status: 502 });
    }
  }

  return NextResponse.json(
    { error: "未找到 API 端点：/v1/models 与 /models 均未返回 JSON，可能不是 NewAPI / One-API 中转" },
    { status: 502 }
  );
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

  const baseUrl = cleanBaseUrl(body.baseUrl);
  const apiKey = (body.apiKey || "").trim();
  if (!baseUrl || !apiKey || !body.modelIds?.length) {
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
    apiKeyMasked: maskKey(apiKey),
    status: "online" as const,
    latencyMs: 6000,
    recommended: false,
    tags: ["中转", "OpenAI-compat"],
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.services.push(svc);
  db.apiKeys.set(serviceId, apiKey);

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
