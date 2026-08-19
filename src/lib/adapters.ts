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

function parseSize(size: string): [number, number] {
  const [w, h] = size.split("x").map(Number);
  return [w || 1024, h || 1024];
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Shared mock generation — returns deterministic-ish placeholder images. */
async function mockGenerate(
  params: GenerateParams,
  opts: { speedMul: number; failRate: number; baseMs: number }
): Promise<GenerateProviderResult> {
  const [w, h] = parseSize(params.size);
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

    const body: Record<string, unknown> = {
      model: model.modelId,
      prompt,
      n: Math.min(count, model.maxBatch || 1),
      size,
    };
    // Forward schema-declared params the model explicitly maps to provider
    // fields. Many strict OpenAI-compat relays (TokenRhythm/qwen) reject ANY
    // unknown key with 400, so only send what the model's schema opts into —
    // never free-form extras, and never negative_prompt (not an OpenAI field).
    for (const [k, v] of Object.entries(parameters ?? {})) {
      const known = model.parameters.find((p) => p.key === k);
      if (known && body[k] === undefined) body[k] = v;
    }

    const data = await this.postJson(
      `${service.baseUrl.replace(/\/$/, "")}/images/generations`,
      body,
      apiKey,
      service.name
    );
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
    const TRANSIENT = new Set([429, 500, 502, 503, 504]);
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    let lastDetail = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "*/*",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
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
      const [w, h] = parseSize(size);
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
