/**
 * 厂商适配器实现。所有第三方图像 API 都通过实现 ImageProvider 接口接入，
 * 调用方（task-runner）只依赖接口，不感知具体厂商。
 * 五种适配器：openai（OpenAI 兼容，真实 HTTP）、flux / stable_diffusion /
 * custom / proxy（均为 mock 占位，用于无真实 Key 的开发演示）。
 */
import type {
  ImageProvider,
  GenerateParams,
  GenerateProviderResult,
  ProviderTaskStatus,
  GeneratedImage,
  AdapterType,
  ImageEditRequest,
  ImageEditResult,
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
  // 部分提供商标识 size 为「高 x 宽」（例如 step-image-edit-2）。
  return heightFirst ? [b || 1024, a || 1024] : [a || 1024, b || 1024];
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把 data URL 转成 Blob，供 multipart/form-data 上传。 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * 判断是否为「严格中转站拒绝未知字段」的 400 错误。
 * 当请求体包含白名单之外的字段时，严格中转站会返回 400
 * （基元律动：`{"code":"BAD_REQUEST","message":"请求包含未知字段"}`）。
 * 用途：当模型声明的能力 / 参数 schema 超出上游实际接受范围时，
 * 退化为仅发送核心字段重试，而不是直接让任务失败。
 */
function isUnknownFieldError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return (
    msg.includes("400") &&
    /未知字段|未知参数|unknown field|unknown_parameter|unrecognized|extra fields/i.test(msg)
  );
}

/** 共用的 mock 生成逻辑——返回确定性较强的占位图片（无网络、无需真实 Key）。 */
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
 * OpenAI 兼容适配器。遵循 POST /images/generations 契约：
 *   { model, prompt, n, size } + Authorization: Bearer <key>
 * 所有形状与之吻合的真实厂商（TokenRhythm 中转站、OpenAI、开放网关）都走这里，
 * 只有 baseUrl + modelId 不同。
 *
 * 若未接通真实 apiKey（开发/演示环境），退化为占位图片，使工作台在没有真实
 * 上游时仍可端到端演示。
 */
class OpenAICompatAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "openai";

  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    const { service, model, prompt, count, size, apiKey, parameters } = params;

    // 无真实 Key → 走 mock，保证 UI 仍可端到端演示。
    if (!apiKey) {
      return mockGenerate(params, { speedMul: 1, failRate: 0.04, baseMs: 4000 });
    }

    // 图生图——传入了参考图 → 走 /images/edits 接口。
    if (params.referenceImage) {
      return this.edit(params);
    }

    // 每个 OpenAI 兼容图像接口都会接受的四个核心字段。
    // 单独维护成 core 对象，以便严格中转站重试时可以只发核心字段。
    const core: Record<string, unknown> = {
      model: model.modelId,
      prompt,
      n: Math.min(count, model.maxBatch || 1),
      size,
    };
    const body: Record<string, unknown> = { ...core };
    // 负面提示词——仅在模型通过 capabilities.negativePrompt 声明支持、
    // 且用户实际填写了负向提示词时才发送，避免严格中转站看到意料之外的字段。
    // 将模型的该能力标志置为 false 即可让该模型退出
    // （例如某个中转站对 negative_prompt 直接 400）。
    if (model.capabilities.negativePrompt && params.negativePrompt?.trim()) {
      body.negative_prompt = params.negativePrompt.trim();
    }
    // 透传模型 schema 中明确声明、并映射到厂商字段的参数。
    // 许多严格的 OpenAI 兼容中转站（TokenRhythm/qwen）对任何未知字段都以 400
    // 拒绝，因此只发送模型 schema 明确勾选的字段——绝不发送自由附加项。
    for (const [k, v] of Object.entries(parameters ?? {})) {
      const known = model.parameters.find((p) => p.key === k);
      if (known && body[k] === undefined) body[k] = v;
    }
    // Seed——部分厂商接受显式生成种子。通过模型 schema（隐藏条目）声明，
    // 使严格中转站不会看到意料之外的字段。
    // UI 通过顶层字段提供 seed，但也可能通过 parameters 记录传入
    // （预设 / 历史记录复用），因此两处都要解析。
    // 注意：上方 schema 循环可能已将 parameters.seed（甚至 -1）复制到 body.seed——
    // 当实际种子为「随机」时必须删除，否则多余的 -1 会传到厂商并引发 400。
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
      // 中转站拒绝了多余字段。模型声明的 schema 超出了该上游实际接受的范围——
      // 丢弃多余字段后重试一次，而不是让整个任务失败。
      const hasExtras = Object.keys(body).length > Object.keys(core).length;
      if (!hasExtras || !isUnknownFieldError(e)) throw e;
      data = await this.postJson(url, core, apiKey, service.name);
    }
    return this.toResult(data, params);
  }

  /** 通过 POST /images/edits 进行图生图（JSON + base64 参考图）。 */
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

  /**
   * AI 图片编辑 —— 走 OpenAI 兼容的 /images/edits 契约。
   *
   * 支持 inpaint（传 mask）与无 mask 的 remove/add/replace/background 等操作。
   * mask 为黑白 PNG data URL：白色区域 = 编辑区域，黑色 = 保留区域。
   * 扩图（outpaint）通过 size 参数控制目标尺寸，超分（upscale）走 2x/4x。
   *
   * 无真实 Key 时退化为 mock，保证编辑器在开发演示环境下仍可端到端跑通。
   */
  async editImage(params: ImageEditRequest): Promise<ImageEditResult[]> {
    const { service, model, prompt, apiKey } = params;

    // 无真实 Key → mock
    if (!apiKey) {
      return this.mockEditImage(params);
    }

    if (!service || !model) {
      throw new Error(`${params.serviceId} 对应的服务/模型未解析，无法执行编辑`);
    }

    // images/edits 契约要求 multipart/form-data（图片作为文件上传），
    // 而不是 JSON——直接发 JSON 会被严格中转站以 400 拒绝。
    const form = new FormData();
    form.append("model", model.modelId);
    form.append("prompt", prompt);
    form.append("n", "1");

    // 图片：data URL → Blob
    const imageBlob = await dataUrlToBlob(params.image);
    form.append("image", imageBlob, "image.png");

    // mask —— 仅 inpaint / remove / add / replace 需要
    if (params.mask) {
      const maskBlob = await dataUrlToBlob(params.mask);
      form.append("mask", maskBlob, "mask.png");
    }

    // size —— outpaint / upscale 时指定目标尺寸
    if (params.size) {
      form.append("size", params.size);
    }

    const url = `${service.baseUrl.replace(/\/$/, "")}/images/edits`;
    let data: { data?: Array<{ url?: string; b64_json?: string }> };
    try {
      data = await this.postMultipart(url, form, apiKey, service.name);
    } catch (e) {
      throw new Error(`${service.name} 图片编辑失败: ${(e as Error).message}`);
    }

    return this.toEditResult(data, params);
  }

  /** mock 版 editImage —— 返回确定性占位图，用于无真实 Key 的开发演示。 */
  private async mockEditImage(params: ImageEditRequest): Promise<ImageEditResult[]> {
    const { operation, width = 1024, height = 1024 } = params;
    // 根据操作类型生成不同色调的占位图，方便肉眼区分
    const hue = operation === "inpaint" ? 280
      : operation === "remove" ? 0
      : operation === "add" ? 120
      : operation === "replace" ? 200
      : operation === "background" ? 180
      : operation === "outpaint" ? 240
      : operation === "restore" ? 30
      : 45; // upscale
    const url = placeholderDataUri(width, height, hue);
    // 模拟网络延迟
    await delay(2000 + Math.random() * 2000);
    return [{
      url,
      width,
      height,
      index: 0,
    }];
  }

  /** 把 /images/edits 的原始响应转成 ImageEditResult[]。 */
  private toEditResult(
    data: { data?: Array<{ url?: string; b64_json?: string }> },
    params: ImageEditRequest
  ): ImageEditResult[] {
    const { width = 1024, height = 1024 } = params;
    return (data.data ?? []).map((d, i) => ({
      url: d.url ?? (d.b64_json
        ? d.b64_json.startsWith("data:")
          ? d.b64_json
          : `data:image/png;base64,${d.b64_json}`
        : placeholderDataUri(width, height, 0)),
      width,
      height,
      index: i,
    }));
  }

  private async postJson(
    url: string,
    body: Record<string, unknown>,
    apiKey: string,
    serviceName: string
  ): Promise<{ data?: Array<{ url?: string; b64_json?: string }> }> {
    // 厂商中转站在负载下会间歇性抛出 502/503/504 或超时。
    // 对瞬时故障按退避策略重试几次；4xx（429 除外）是真实的客户端错误，绝不重试。
    const TRANSIENT = new Set([429, 500, 502, 503, 504, 524]);
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    let lastDetail = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // 90 秒客户端超时——Aixoras 落在 Cloudflare 之后，约 100 秒后返回 524；
        // 提前一点中止，以便更快重试，而不是干等完整个 Cloudflare 窗口。
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
        if (attempt === MAX_ATTEMPTS) {
          const err = e as Error & { cause?: unknown };
          const cause = err.cause
            ? ` cause=${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
            : "";
          throw new Error(`${serviceName} 网络错误: ${err.message}${cause}`);
        }
      }
      await delay(800 * attempt); // 退避间隔：0.8s、1.6s
    }

    if (!res || !res.ok) {
      throw new Error(
        `${serviceName} 返回 ${res?.status ?? "网络错误"}: ${lastDetail.slice(0, 300) || res?.statusText || "无响应"}`
      );
    }
    return (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  }

  /**
   * postMultipart — 用 multipart/form-data 发 POST（图片编辑用）。
   *
   * 和 postJson 的区别：images/edits 契约要求图片以文件形式上传，
   * JSON body 会被严格中转站拒绝。重试策略与 postJson 一致。
   */
  private async postMultipart(
    url: string,
    form: FormData,
    apiKey: string,
    serviceName: string
  ): Promise<{ data?: Array<{ url?: string; b64_json?: string }> }> {
    const TRANSIENT = new Set([429, 500, 502, 503, 504, 524]);
    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;
    let lastDetail = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const signal = AbortSignal.timeout(90_000);
        res = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "*/*",
            Authorization: `Bearer ${apiKey}`,
          },
          body: form,
          signal,
        });
        if (res.ok) break;
        lastDetail = await res.text().catch(() => "");
        if (!TRANSIENT.has(res.status) || attempt === MAX_ATTEMPTS) break;
      } catch (e) {
        if (attempt === MAX_ATTEMPTS) {
          const err = e as Error & { cause?: unknown };
          const cause = err.cause
            ? ` cause=${err.cause instanceof Error ? err.cause.message : String(err.cause)}`
            : "";
          throw new Error(`${serviceName} 网络错误: ${err.message}${cause}`);
        }
      }
      await delay(800 * attempt);
    }

    if (!res || !res.ok) {
      throw new Error(
        `${serviceName} 返回 ${res?.status ?? "网络错误"}: ${lastDetail.slice(0, 300) || res?.statusText || "无响应"}`
      );
    }
    return (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
  }

  /** 把厂商返回的原始数据转成 GenerateProviderResult（补全 url / width / height / seed）。 */
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

/** Flux 适配器（mock 占位）—— 模拟黑石-flux 模型，速度略慢、失败率略高。 */
class FluxAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "flux";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 1.1, failRate: 0.05, baseMs: 11000 });
  }
}

/** Stable Diffusion 适配器（mock 占位）—— 速度最快、基础耗时最短。 */
class StableDiffusionAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "stable_diffusion";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 0.8, failRate: 0.04, baseMs: 7000 });
  }
}

/** 自定义适配器（mock 占位）—— 模拟不稳定的自建端点，失败率最高（0.18）。 */
class CustomAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "custom";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 1.3, failRate: 0.18, baseMs: 8000 });
  }
}

/** 代理适配器（mock 占位）—— 经由中转代理的模型，失败率适中。 */
class ProxyAdapter implements ImageProvider {
  readonly adapterType: AdapterType = "proxy";
  async generate(params: GenerateParams): Promise<GenerateProviderResult> {
    return mockGenerate(params, { speedMul: 1, failRate: 0.08, baseMs: 9000 });
  }
}

// 适配器注册表。type → 适配器实例，getAdapter() 通过它路由；
// 新增厂商只需在此追加一项，task-runner 无需感知具体类型。
const adapters: Record<AdapterType, ImageProvider> = {
  openai: new OpenAICompatAdapter(),
  flux: new FluxAdapter(),
  stable_diffusion: new StableDiffusionAdapter(),
  custom: new CustomAdapter(),
  proxy: new ProxyAdapter(),
};

/** 按 adapter 类型获取对应的适配器实例；未注册该类型时抛错。 */
export function getAdapter(type: AdapterType): ImageProvider {
  const a = adapters[type];
  if (!a) throw new Error(`No adapter registered for type: ${type}`);
  return a;
}

export type { ProviderTaskStatus };
