import type {
  ImageProvider,
  GenerateParams,
  GenerateProviderResult,
  ProviderTaskStatus,
  GeneratedImage,
  AdapterType,
} from "./types";
import { placeholderDataUri } from "./seed";
import { uid } from "./cn";

function hueFromPrompt(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = (h * 31 + prompt.charCodeAt(i)) % 360;
  }
  return h;
}

function parseSize(size: string, heightFirst = false): [number, number] {
  const [a, b] = size.split("x").map(Number);
  // Some providers (e.g. step-image-edit-2) document size as "height x width".
  return heightFirst ? [b || 1024, a || 1024] : [a || 1024, b || 1024];
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * True for the 400 a strict relay returns when the body carries a key outside
 * its allowlist (基元律动: `{"code":"BAD_REQUEST","message":"请求包含未知字段"}`).
 * Used to retry core-only instead of failing the task when a model's declared
 * capabilities / parameter schema over-promise what the upstream accepts.
 */
function isUnknownFieldError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return (
    msg.includes("400") &&
    /未知字段|未知参数|unknown field|unknown_parameter|unrecognized|extra fields/i.test(msg)
  );
}

/** Shared mock generation — returns deterministic-ish placeholder images. */
async function mockGenerate(
  params: GenerateParams,
  opts: { speedMul: number; failRate: number; baseMs: number }
): Promise<GenerateProviderResult> {
  const [w, h] = parseSize(params.size, params.model.capabilities.sizeFormat === "height_first");
  const hue = hueFromPrompt(params.prompt);
  await delay(opts.baseMs * opts.speedMul);

  if (Math.random() < opts.failRate) {
    throw new Error(
      `${params.service.name} 请求超时 (adapter: ${params.service.adapterType})`
    );
  }

  const images: GeneratedImage[] = Array.from({ length: params.count }, (_, i) => ({
    id: uid("img"),
    url: placeholderDataUri(w, h, (hue + i * 47) % 360),
    width: w,
    height: h,
    seed: params.seed === -1 ? Math.floor(Math.random() * 1_000_000) : params.seed + i,
  }));

  return { images };
}

/**
 * OpenAI-compatible adapter. Talks the POST /v1/images/generations contract:
 *   { model, prompt, n, size } + Authorization: Bearer <key>
 * Real providers that mirror this shape (TokenRhythm relay, OpenAI, open
 * gateways) all flow through here. Only the baseUrl + modelId differ.
 *
 * Falls back to a placeholder image if no apiKey is wired (dev/demo), so the
 * workbench stays usable without a live upstream.
 */
class OpenAICompatAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "openai";

  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    const { service, model, prompt, count, size, apiKey, parameters } = params;

    // No real key → mock so the UI is still demonstrable end-to-end.
    if (!apiKey) {
      return mockGenerate(params, { speedMul: 1, failRate: 0.04, baseMs: 4000 });
    }

    // Image-to-image — a reference image was supplied → images/edits.
    if (params.referenceImage) {
      return this.edit(params);
    }

    // The four fields every OpenAI-compat image endpoint accepts. Kept as a
    // separate object so a strict relay can be retried with core-only.
    const core: Record<string, unknown> = {
      model: model.modelId,
      prompt,
      n: Math.min(count, model.maxBatch || 1),
      size,
    };
    const body: Record<string, unknown> = { ...core };
    // Negative prompt — send only when the model opts in via
    // capabilities.negativePrompt AND the user actually supplied one, so a
    // strict relay never sees an unexpected key. Flip the capability flag to
    // false on a model to opt that model out (e.g. a relay that 400s on it).
    if (model.capabilities.negativePrompt && params.negativePrompt?.trim()) {
      body.negative_prompt = params.negativePrompt.trim();
    }
    // Forward schema-declared params the model explicitly maps to provider
    // fields. Many strict OpenAI-compat relays (TokenRhythm/qwen) reject ANY
    // unknown key with 400, so only send what the model's schema opts into —
    // never free-form extras.
    for (const [k, v] of Object.entries(parameters ?? {})) {
      const known = model.parameters.find((p) => p.key === k);
      if (known && body[k] === undefined) body[k] = v;
    }
    // Seed — some providers accept an explicit generation seed. Opt in via the
    // model schema (hidden entry) so strict relays never see an unexpected key.
    // The UI supplies seed through the top-level field, but it may also arrive
    // via the parameters record (preset / history reuse), so resolve both.
    // NOTE: the schema loop above may have already copied parameters.seed (even
    // -1) into body.seed — when the effective seed is "random" we must delete it,
    // otherwise a stray -1 reaches the provider and 400s.
    const seedParam = model.parameters.find((p) => p.key === "seed");
    if (seedParam) {
      const min = seedParam.min ?? 0;
      const max = seedParam.max ?? 2147483647;
      let seed: number | undefined = params.seed;
      if (seed === -1 || seed === undefined || seed === null) {
        const fromParams = parameters?.seed;
        if (fromParams !== undefined && fromParams !== null) seed = Number(fromParams);
      }
      if (seed === -1 || seed === undefined || Number.isNaN(seed)) {
        delete body.seed;
      } else {
        body.seed = Math.min(max, Math.max(min, Math.round(seed)));
      }
    }

    const url = `${service.baseUrl.replace(/\/$/, "")}/images/generations`;
    let data: { data?: Array<{ url?: string; b64_json?: string }> };
    try {
      data = await this.postJson(url, body, apiKey, service.name);
    } catch (e) {
      // Relay rejected an extra key. The model's declared schema over-promised
      // what this upstream takes — drop the extras and retry once rather than
      // failing the whole task.
      const hasExtras = Object.keys(body).length > Object.keys(core).length;
      if (!hasExtras || !isUnknownFieldError(e)) throw e;
      data = await this.postJson(url, core, apiKey, service.name);
    }
    return this.toResult(data, params);
  }

  /** Image-to-image via POST /images/edits (JSON base64 body). */
  private async edit(params: GenerateParams): Promise<GenerateProviderResult> {
    const { service, model, prompt, count, size, apiKey, referenceImage } = params;
    if (!apiKey) throw new Error(`${service.name} 未配置 API Key`);
    const body: Record<string, unknown> = {
      model: model.modelId,
      prompt,
      image: referenceImage,
      n: Math.min(count, model.maxBatch || 1),
      size,
    };
    if (model.capabilities.negativePrompt && params.negativePrompt?.trim()) {
      body.negative_prompt = params.negativePrompt.trim();
    }
    try {
      const data = await this.postJson(
        `${service.baseUrl.replace(/\/$/, "")}/images/edits`,
        body,
        apiKey,
        service.name
      );
      return this.toResult(data, params);
    } catch (e) {
      throw new Error(
        `${service.name} 图生图失败（该中转站可能不支持 images/edits）: ${(e as Error).message}`
      );
    }
  }

  private async postJson(
    url: string,
    body: Record<string, unknown>,
    apiKey: string,
    serviceName: string
  ): Promise<{ data?: Array<{ url?: string; b64_json?: string }> }> {
    // Provider relays intermittently throw 502/503/504 or time out under load.
    // Retry transient faults a few times with backoff; 4xx (except 429) is a
    // real client error and is never retried.
    const TRANSIENT = new Set([429, 500, 502, 503, 504, 524]);
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    let lastDetail = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // 90s client-side timeout — Aixoras sits behind Cloudflare which
        // returns 524 after ~100s; abort just before that so we retry sooner
        // instead of waiting out the full Cloudflare window.
        const signal = AbortSignal.timeout(90_000);
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
        if (res.ok) break;
        lastDetail = await res.text().catch(() => "");
        if (!TRANSIENT.has(res.status) || attempt === MAX_ATTEMPTS) break;
      } catch (e) {
        if (attempt === MAX_ATTEMPTS)
          throw new Error(`${serviceName} 网络错误: ${(e as Error).message}`);
      }
      await delay(800 * attempt); // 0.8s, 1.6s backoff
    }

    if (!res || !res.ok) {
      throw new Error(
        `${serviceName} 返回 ${res?.status ?? "网络错误"}: ${lastDetail.slice(0, 300) || res?.statusText || "无响应"}`
      );
    }
    return (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  }

  private toResult(
    data: { data?: Array<{ url?: string; b64_json?: string }> },
    params: GenerateParams
  ): GenerateProviderResult {
    const { prompt, size } = params;
    const out: GeneratedImage[] = (data.data ?? []).map((d, i) => {
      const [w, h] = parseSize(size, params.model.capabilities.sizeFormat === "height_first");
      const src =
        d.url ??
        (d.b64_json
          ? d.b64_json.startsWith("data:")
            ? d.b64_json
            : `data:image/png;base64,${d.b64_json}`
          : placeholderDataUri(w, h, (hueFromPrompt(prompt) + i * 47) % 360));
      return {
        id: uid("img"),
        url: src,
        width: w,
        height: h,
        seed: params.seed === -1 ? Math.floor(Math.random() * 1_000_000) : params.seed + i,
      };
    });

    if (out.length === 0) throw new Error(`${params.service.name} 未返回图片`);
    return { images: out };
  }
}

class FluxAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "flux";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 1.1, failRate: 0.05, baseMs: 11000 });
  }
}

class StableDiffusionAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "stable_diffusion";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 0.8, failRate: 0.04, baseMs: 7000 });
  }
}

class CustomAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "custom";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 1.3, failRate: 0.18, baseMs: 8000 });
  }
}

class ProxyAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "proxy";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 1, failRate: 0.08, baseMs: 9000 });
  }
}

const adapters: Record<AdapterType, ImageProvider> = {
  openai: new OpenAICompatAdapter(),
  flux: new FluxAdapter(),
  stable_diffusion: new StableDiffusionAdapter(),
  custom: new CustomAdapter(),
  proxy: new ProxyAdapter(),
};

export function getAdapter(type: AdapterType): ImageProvider {
  const a = adapters[type];
  if (!a) throw new Error(`No adapter registered for type: ${type}`);
  return a;
}

export type { ProviderTaskStatus };
