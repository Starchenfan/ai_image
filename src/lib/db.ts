/**
 * 进程内内存型 mock 数据库（服务端单例）。模拟 Postgres + Redis 任务队列。
 * 生产环境替换为 Prisma/Postgres + BullMQ，适配器接口保持不变。
 *
 * store 按设计从空开始——管理员在运行时通过适配器注册表添加服务/模型。
 * 适配器层与类型层不硬编码任何具体厂商信息。
 *
 * 唯一的例外是下方的默认服务：首次导入时种子化一次，使工作箱开箱即用。
 * 真实 API Key 只存在于服务端 apiKeys 密钥库（进程内存）中——不会序列化到客户端。
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

// 使服务端 fetch 遵守 HTTP(S)_PROXY —— 模块初始化时安装一次，早于任何路由处理器
// 发起的外呼（db 被每个路由引用，因此这里安装最早）。
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
   * 服务端密钥库。真实 API Key 只存在这里（进程内存）。
   * AiService 上的脱敏桩仅用于展示，不会序列化到客户端。
   */
  apiKeys: Map<string, string>;
};

const g = globalThis as unknown as { __studioStore?: GlobalStore };

/** 种子服务及其模型所引用的默认服务 ID 常量。 */
const DEFAULT_SERVICE_ID = "svc-tokenrhythm";
const DEFAULT_MODEL_ID = "mdl-qwen-image-2";
/** 第二个种子服务——商汤日日新（SenseNova）。 */
const SENSENOVA_SERVICE_ID = "svc-sensenova";
const SENSENOVA_MODEL_ID = "mdl-sensenova-u1.5-lite";
/** 基元律动中转站上的第二个模型——阿里云通义万相 Wan 2.7 文生图。 */
const WAN_MODEL_ID = "mdl-wan2-7-image";
/** Step（阶跃星辰）—— 位于 api.stepfun.com 的 OpenAI 兼容网关。 */
const STEPFUN_SERVICE_ID = "svc-stepfun";
const STEPFUN_MODEL_EDIT_ID = "mdl-step-image-edit-2";
const STEPFUN_MODEL_LARGE_ID = "mdl-step-2x-large";
/** Step API Key，仅服务端持有，不会序列化到客户端。 */
const STEP_API_KEY = "1knsLeeiIHpEPHDbOcVYTg3mbK8s3xwwzsnYRCLJplYPd7z4uycWrSJ3zqdtLhswG";
/** Aixoras —— 位于 api.aixoras.com 的 OpenAI 兼容图像 API，默认模型 gpt-image-2。 */
const AIXORAS_SERVICE_ID = "svc-aixoras";
const AIXORAS_MODEL_ID = "mdl-gpt-image-2";
/** Aixoras API Key，仅服务端持有，不会序列化到客户端。 */
const AIXORAS_API_KEY = "sk-zM6AdAYdnbcmv82Q7H4JPLMeEOtIBy9ydtYIe4fOsDcmBpQD";
/** 默认厂商密钥，仅存储在服务端密钥库中。 */
const DEFAULT_API_KEY = "sk_tr_mxz2CZTLl2iLv0yn624bg2LONrtXbENj6oj_LRGbYg4";
const SENSENOVA_API_KEY = "sk-1k6cNNMHLkczOyYIApMpm4F3s7Atxxfa";

/**
 * 种子数据放在模块作用域，而不是一次性 if 里——这样热重载（在同一 Node 进程中
 * 重新执行本模块）可以幂等地合并下方缺失的条目，而不是默默保留过期的 store。
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
      // 基元律动 gateway 对任何超出 {model, prompt, n, size} 的字段都返回 400——
      // 实测：添加 negative_prompt 会返回
      // {"code":"BAD_REQUEST","message":"请求包含未知字段"}。
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
      // 同一个 gateway，同样严格的字段白名单——参见上方 qwen-image-2.0 的说明。
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
    // 尺寸由提供商标识——严格白名单，任何其它尺寸都会被 400 拒绝。
    // 先列 2K，再列唯一的 4K 选项（4096x4096）。
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
    // 该模型的提供商标识 size 为「高 x 宽」——下方字符串按 API 原生顺序存储，
    // 适配器在解析时交换宽高（adapters.ts 的 parseSize 的 heightFirst 参数）。
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

// 幂等合并——补上所有缺失的种子服务 / 模型 / API Key。
// 以 id 为键，因此重复执行不会产生重复条目，也不会覆盖运行时管理员的修改。
// 这就是种子改动能在热重载下生效、无需完全重启服务的原因。
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
