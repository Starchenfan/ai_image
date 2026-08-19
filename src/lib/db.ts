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
/** Second seeded service — Step (阶跃星辰) SenseNova. */
const SENSENOVA_SERVICE_ID = "svc-sensenova";
const SENSENOVA_MODEL_ID = "mdl-sensenova-u1-fast";
/** Second model on the 基元律动 relay — Alibaba Wan 2.7 image. */
const WAN_MODEL_ID = "mdl-wan2-7-image";
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
    name: "阶跃星辰",
    adapterType: "openai",
    baseUrl: "https://token.sensenova.cn/v1",
    apiKeyMasked: maskKey(SENSENOVA_API_KEY),
    status: "online",
    latencyMs: 75000,
    recommended: true,
    tags: ["高分辨率", "二次元"],
    createdAt: "2026-08-12",
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
      negativePrompt: true,
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
      negativePrompt: true,
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
    displayName: "SenseNova U1 Fast",
    modelId: "sensenova-u1-fast",
    description: "阶跃星辰文生图模型,支持超高分辨率(最高 3072)与跨次元融合构图。",
    type: "image",
    capabilities: {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      negativePrompt: true,
      variations: false,
    },
    parameters: [],
    supportedAspectRatios: ["1:1", "9:16", "16:9", "3:4", "4:3", "21:9"],
    // Sizes dictated by the provider (probed live) — strict allowlist;
    // any other size is 400-rejected. High-res first.
    supportedSizes: [
      "3072x1376",
      "3072x864",
      "2752x1536",
      "2560x720",
      "2496x1664",
      "2368x1760",
      "2272x1824",
      "2048x2048",
      "1824x2272",
      "1760x2368",
      "1664x2496",
      "1536x2752",
      "1344x3136",
    ],
    maxBatch: 1,
    priceCredits: 6,
    avgDurationSec: 75,
    rating: 4.7,
    tags: ["高分辨率", "二次元"],
    enabled: true,
    sort: 1,
  },
];

const seedApiKeys: Array<[string, string]> = [
  [DEFAULT_SERVICE_ID, DEFAULT_API_KEY],
  [SENSENOVA_SERVICE_ID, SENSENOVA_API_KEY],
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
