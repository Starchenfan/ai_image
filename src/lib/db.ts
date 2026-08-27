/**
 * In-memory mock DB (server-side singleton). Simulates Postgres + Redis task queue.
 * In production: replace with Prisma/Postgres + BullMQ. The adapter interface stays.
 *
 * The store starts empty by design — the admin adds services/models at runtime
 * via the adapter registry. Nothing about a specific provider is hard-coded in
 * the adapter layer or types.
 *
 * The one exception is the default service below: seeded once on first import
 * so the workbench is usable out-of-the-box. The real API key lives ONLY in
 * the server-side apiKeys vault (process memory) — never serialized to client.
 */
import type {
  AiService,
  AiModel,
  GenerateTask,
  HistoryItem,
  PromptTemplate,
} from "./types";
import { maskKey } from "./mask";
import { defaultPromptTemplates } from "./seed";
import { installProxyDispatcher } from "./proxy";

// Make server-side fetch honor HTTP(S)_PROXY — installed once, before any
// route handler issues an outbound call (db is imported by every route).
installProxyDispatcher();

type GlobalStore = {
  services: AiService[];
  models: AiModel[];
  tasks: Map<string, GenerateTask>;
  history: HistoryItem[];
  templates: PromptTemplate[];
  credits: number;
  autoFailover: boolean;
  /**
   * Server-side key vault. Real API keys live ONLY here (process memory).
   * The masked stub on AiService is display-only; never serialized to client.
   */
  apiKeys: Map<string, string>;
};

const g = globalThis as unknown as { __studioStore?: GlobalStore };

/** Default service ids — referenced by the seeded services + their models. */
const DEFAULT_SERVICE_ID = "svc-tokenrhythm";
const DEFAULT_MODEL_ID = "mdl-qwen-image-2";
/** Second seeded service — SenseTime 日日新 (SenseNova). */
const SENSENOVA_SERVICE_ID = "svc-sensenova";
const SENSENOVA_MODEL_ID = "mdl-sensenova-u1.5-lite";
/** Second model on the 基元律动 relay — Alibaba Wan 2.7 image. */
const WAN_MODEL_ID = "mdl-wan2-7-image";
/** Step (阶跃星辰) — OpenAI-compatible gateway at api.stepfun.com. */
const STEPFUN_SERVICE_ID = "svc-stepfun";
const STEPFUN_MODEL_EDIT_ID = "mdl-step-image-edit-2";
const STEPFUN_MODEL_LARGE_ID = "mdl-step-2x-large";
/** Step API key — server-side only, never serialized to client. */
const STEP_API_KEY = "1knsLeeiIHpEPHDbOcVYTg3mbK8s3xwwzsnYRCLJplYPd7z4uycWrSJ3zqdtLhswG";
/** Aixoras — OpenAI-compatible image API at api.aixoras.com. Default model gpt-image-2. */
const AIXORAS_SERVICE_ID = "svc-aixoras";
const AIXORAS_MODEL_ID = "mdl-gpt-image-2";
/** Aixoras API key — server-side only, never serialized to client. */
const AIXORAS_API_KEY = "sk-zM6AdAYdnbcmv82Q7H4JPLMeEOtIBy9ydtYIe4fOsDcmBpQD";
/** Default provider key — stored only in the server-side vault. */
const DEFAULT_API_KEY = "sk_tr_mxz2CZTLl2iLv0yn624bg2LONrtXbENj6oj_LRGbYg4";
const SENSENOVA_API_KEY = "sk-1k6cNNMHLkczOyYIApMpm4F3s7Atxxfa";

/**
 * Seed data lives at module scope — not inside a one-shot `if` — so a hot
 * reload (which re-runs this module in the SAME Node process) can idempotently
 * merge missing entries below instead of silently keeping a stale store.
 */
const seedServices: AiService[] = [
  {
    id: DEFAULT_SERVICE_ID,
    name: "基元律动",
    adapterType: "openai",
    baseUrl: "https://tokenrhythm.studio/v1",
    apiKeyMasked: maskKey(DEFAULT_API_KEY),
    status: "online",
    latencyMs: 4000,
    recommended: true,
    tags: ["默认", "国风"],
    createdAt: "2026-08-12",
  },
  {
    id: SENSENOVA_SERVICE_ID,
    name: "商汤日日新",
    adapterType: "openai",
    baseUrl: "https://token.sensenova.cn/v1",
    apiKeyMasked: maskKey(SENSENOVA_API_KEY),
    status: "online",
    latencyMs: 75000,
    recommended: true,
    tags: ["高分辨率", "二次元"],
    createdAt: "2026-08-12",
  },
  {
    id: STEPFUN_SERVICE_ID,
    name: "阶跃星辰",
    adapterType: "openai",
    baseUrl: "https://api.stepfun.com/v1",
    apiKeyMasked: maskKey(STEP_API_KEY),
    status: STEP_API_KEY ? "online" : "offline",
    latencyMs: 30000,
    recommended: true,
    tags: ["推荐", "文生图"],
    createdAt: "2026-08-12",
  },
  {
    id: AIXORAS_SERVICE_ID,
    name: "Aixoras",
    adapterType: "openai",
    baseUrl: "https://api.aixoras.com/v1",
    apiKeyMasked: AIXORAS_API_KEY ? maskKey(AIXORAS_API_KEY) : "未配置",
    status: AIXORAS_API_KEY ? "online" : "offline",
    latencyMs: 15000,
    recommended: true,
    tags: ["默认", "文生图", "图生图"],
    createdAt: "2026-08-27",
  },
];

const seedModels: AiModel[] = [
  {
    id: DEFAULT_MODEL_ID,
    serviceId: DEFAULT_SERVICE_ID,
    displayName: "Qwen Image 2.0",
    modelId: "qwen-image-2.0",
    description: "通义万相文生图模型,擅长国风、东方美学与电影光影。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      // 基元律动 gateway 400s on ANY key outside {model,prompt,n,size} —
      // probed live: adding negative_prompt returns
      // {"code":"BAD_REQUEST","message":"请求包含未知字段"}.
      negativePrompt: false,
      variations: false,
    },
    parameters: [],
    supportedAspectRatios: ["1:1", "9:16", "16:9"],
    supportedSizes: ["2048x2048", "1536x1536", "1280x720", "1024x1024", "720x1280"],
    maxBatch: 4,
    priceCredits: 4,
    avgDurationSec: 8,
    rating: 4.8,
    tags: ["国风", "默认"],
    enabled: true,
    sort: 0,
  },
  {
    id: WAN_MODEL_ID,
    serviceId: DEFAULT_SERVICE_ID,
    displayName: "Wan 2.7 Image",
    modelId: "wan2.7-image",
    description: "通义万相 Wan2.7 文生图模型,写实质感与细腻光影,擅长人物与场景。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      // Same gateway, same strict field allowlist — see qwen-image-2.0 above.
      negativePrompt: false,
      variations: false,
    },
    parameters: [],
    supportedAspectRatios: ["1:1", "9:16", "16:9"],
    supportedSizes: ["2048x2048", "1536x1536", "1280x720", "1024x1024", "720x1280"],
    maxBatch: 4,
    priceCredits: 4,
    avgDurationSec: 12,
    rating: 4.7,
    tags: ["写实", "光影"],
    enabled: true,
    sort: 1,
  },
  {
    id: SENSENOVA_MODEL_ID,
    serviceId: SENSENOVA_SERVICE_ID,
    displayName: "日日新 U1.5 Lite",
    modelId: "sensenova-u1.5-lite",
    description: "商汤日日新文生图模型,支持 2K/4K 分辨率与跨次元融合构图。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      negativePrompt: true,
      variations: false,
    },
    parameters: [
      { key: "watermark", type: "boolean", label: "官方水印", default: true, advanced: true,
        description: "是否添加日日新 SenseNova 官方 Logo 水印。false 生成无水印纯图（Beta 免费，公测结束后作为高级付费特性）" },
      { key: "output_format", type: "select", label: "输出格式", default: "png", options: ["png", "jpeg", "webp"], advanced: true,
        description: "PNG 适合透明背景和无损画面；JPEG 适合照片类图片且不支持透明背景；WEBP 兼顾文件大小和透明背景" },
      { key: "response_format", type: "select", label: "返回方式", default: "b64_json", options: ["b64_json", "url"], advanced: true,
        description: "b64_json 返回图片 Base64 内容；url 返回有效期 24 小时的临时下载地址" },
      { key: "prompt_extend", type: "boolean", label: "提示词润色", default: true, advanced: true,
        description: "开启提示词自动润色优化，扩写失败时自动使用原始 prompt" },
    ],
    supportedAspectRatios: ["1:1", "16:9", "9:16", "2:3", "3:2"],
    // Sizes dictated by the provider — strict allowlist; any other size is
    // 400-rejected. 2K first, then the single 4K option.
    supportedSizes: [
      "2048x2048",
      "2720x1536",
      "1536x2720",
      "1664x2496",
      "2496x1664",
      "4096x4096",
    ],
    maxBatch: 1,
    priceCredits: 6,
    avgDurationSec: 75,
    rating: 4.7,
    tags: ["高分辨率", "二次元"],
    enabled: true,
    sort: 1,
  },
  {
    id: STEPFUN_MODEL_EDIT_ID,
    serviceId: STEPFUN_SERVICE_ID,
    displayName: "step-image-edit-2",
    modelId: "step-image-edit-2",
    description: "阶跃星辰文生图模型,支持负面提示词与文字场景优化。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      negativePrompt: true,
      variations: false,
      sizeFormat: "height_first",
    },
    parameters: [
      { key: "seed", type: "number", label: "Seed", hidden: true, default: -1,
        min: 0, max: 2147483647,
        description: "不传时服务端随机生成" },
      { key: "steps", type: "slider", label: "生成步数", default: 8, min: 1, max: 50, step: 1, advanced: true,
        description: "默认 8" },
      { key: "cfg_scale", type: "slider", label: "CFG Scale", default: 1.0, min: 1.0, max: 10.0, step: 0.1, advanced: true,
        description: "必须 >= 1.0，默认 1.0" },
      { key: "response_format", type: "select", label: "返回方式", default: "url", options: ["b64_json", "url"], advanced: true,
        description: "url 返回 30 天有效临时链接;b64_json 返回 Base64" },
      { key: "text_mode", type: "boolean", label: "文字优化", default: false, advanced: true,
        description: "针对文字场景的优化策略,默认关闭" },
    ],
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    // Provider documents size as "height x width" for this model — the strings
    // below are stored in API-native order; the adapter swaps on parse.
    supportedSizes: [
      "1024x1024",
      "768x1360",
      "896x1184",
      "1360x768",
      "1184x896",
    ],
    maxBatch: 1,
    priceCredits: 5,
    avgDurationSec: 20,
    rating: 4.6,
    tags: ["推荐", "文生图"],
    enabled: true,
    sort: 0,
  },
  {
    id: STEPFUN_MODEL_LARGE_ID,
    serviceId: STEPFUN_SERVICE_ID,
    displayName: "step-2x-large",
    modelId: "step-2x-large",
    description: "阶跃星辰 2x 放大模型,支持最高 1024 分辨率输入。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      negativePrompt: false,
      variations: false,
    },
    parameters: [
      { key: "seed", type: "number", label: "Seed", hidden: true, default: -1,
        min: 0, max: 2147483647,
        description: "不传或为 0 时服务端随机生成" },
      { key: "steps", type: "slider", label: "生成步数", default: 50, min: 1, max: 50, step: 1, advanced: true,
        description: "默认 50" },
      { key: "cfg_scale", type: "slider", label: "CFG Scale", default: 6, min: 1, max: 10, step: 1, advanced: true,
        description: "默认 6" },
      { key: "response_format", type: "select", label: "返回方式", default: "url", options: ["b64_json", "url"], advanced: true,
        description: "url 返回 30 天有效临时链接;b64_json 返回 Base64" },
    ],
    supportedAspectRatios: ["1:1", "16:9"],
    supportedSizes: [
      "256x256",
      "512x512",
      "768x768",
      "1024x1024",
      "1280x800",
      "800x1280",
    ],
    maxBatch: 1,
    priceCredits: 4,
    avgDurationSec: 15,
    rating: 4.4,
    tags: ["2x", "文生图"],
    enabled: true,
    sort: 1,
  },
  {
    id: AIXORAS_MODEL_ID,
    serviceId: AIXORAS_SERVICE_ID,
    displayName: "GPT Image 2",
    modelId: "gpt-image-2",
    description: "Aixoras 图像生成模型,支持文生图与图生图,丰富参数调控。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: true,
      inpainting: false,
      negativePrompt: true,
      variations: false,
    },
    parameters: [
      { key: "seed", type: "number", label: "Seed", hidden: true, default: -1,
        min: 0, max: 2147483647,
        description: "随机种子,固定后可复现同样结果" },
      { key: "quality", type: "select", label: "质量", default: "standard", options: ["standard", "hd"],
        description: "质量档位: standard(标准) / hd(高清)" },
      { key: "style", type: "select", label: "风格", default: "vivid", options: ["vivid", "natural"],
        description: "风格: vivid(生动) / natural(自然)" },
      { key: "steps", type: "slider", label: "采样步数", default: 20, min: 1, max: 100, step: 1, advanced: true,
        description: "采样步数,越大质量通常越好但耗时越长" },
      { key: "guidance_scale", type: "slider", label: "引导系数", default: 7.5, min: 0, max: 20, step: 0.5, advanced: true,
        description: "引导系数/CFG,越大越贴合提示词但可能损失多样性" },
      { key: "response_format", type: "select", label: "返回方式", default: "url", options: ["url", "b64_json"], advanced: true,
        description: "url 返回图片链接,b64_json 返回 Base64" },
      { key: "output_format", type: "select", label: "输出格式", default: "png", options: ["png", "jpeg", "webp"], advanced: true,
        description: "输出图片格式: png / jpeg / webp" },
      { key: "output_compression", type: "slider", label: "压缩率", default: 0, min: 0, max: 100, step: 1, advanced: true,
        description: "输出压缩率,取值 0-100" },
      { key: "background", type: "select", label: "背景", default: "opaque", options: ["transparent", "opaque"], advanced: true,
        description: "背景: transparent(透明) / opaque(不透明)" },
      { key: "moderation", type: "text", label: "内容审核", default: "", advanced: true,
        description: "内容审核级别" },
      { key: "watermark", type: "boolean", label: "水印", default: false, advanced: true,
        description: "是否添加水印" },
      { key: "prompt_optimizer", type: "boolean", label: "提示词优化", default: false, advanced: true,
        description: "是否自动扩写/优化提示词" },
    ],
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2"],
    supportedSizes: ["1024x1024", "1536x1536", "2048x2048", "1280x720", "720x1280"],
    maxBatch: 4,
    priceCredits: 4,
    avgDurationSec: 15,
    rating: 4.5,
    tags: ["默认", "文生图", "图生图"],
    enabled: true,
    sort: 0,
  },
];

const seedApiKeys: Array<[string, string]> = [
  [DEFAULT_SERVICE_ID, DEFAULT_API_KEY],
  [SENSENOVA_SERVICE_ID, SENSENOVA_API_KEY],
  [STEPFUN_SERVICE_ID, STEP_API_KEY],
  [AIXORAS_SERVICE_ID, AIXORAS_API_KEY],
];

if (!g.__studioStore) {
  g.__studioStore = {
    services: [],
    models: [],
    tasks: new Map(),
    history: [],
    templates: defaultPromptTemplates.map((template) => ({ ...template })),
    credits: 1280,
    autoFailover: true,
    apiKeys: new Map(),
  };
}

// Idempotent merge — add any seeded service / model / API key that is missing.
// Keyed by id, so re-running never duplicates and never clobbers admin edits
// made at runtime. This is what makes seed changes apply on hot reload without
// a full server restart.
for (const svc of seedServices) {
  if (!g.__studioStore.services.some((s) => s.id === svc.id)) {
    g.__studioStore.services.push(svc);
  }
}
for (const model of seedModels) {
  if (!g.__studioStore.models.some((m) => m.id === model.id)) {
    g.__studioStore.models.push(model);
  }
}
for (const [serviceId, key] of seedApiKeys) {
  if (!g.__studioStore.apiKeys.has(serviceId)) {
    g.__studioStore.apiKeys.set(serviceId, key);
  }
}

export const db = g.__studioStore;
