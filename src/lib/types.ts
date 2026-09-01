/**
 * 核心领域类型：多服务 + 多模型 + 适配器系统。
 * 此处不硬编码任何具体厂商的实现细节——新增厂商只加适配器，类型层不动。
 */

export type ServiceStatus = "online" | "offline" | "degraded" | "rate_limited" | "maintenance";
export type AdapterType = "openai" | "flux" | "stable_diffusion" | "custom" | "proxy";

/** 已配置的第三方图像 API 端点。 */
export interface AiService {
  id: string;
  name: string;
  /** 处理该服务的适配器类型。 */
  adapterType: AdapterType;
  baseUrl: string;
  /** 脱敏后的 API Key 展示值，仅服务端持有，不会序列化到客户端。 */
  apiKeyMasked: string;
  status: ServiceStatus;
  /** 模拟延迟（毫秒），仅用于界面展示。 */
  latencyMs: number;
  recommended?: boolean;
  tags?: string[];
  createdAt: string;
}

/** 参数 schema 字段——前端据此渲染参数表单 UI。 */
export interface ModelParameterSchema {
  key: string;
  type: "number" | "select" | "text" | "boolean" | "slider";
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: number | string | boolean;
  options?: Array<number | string>;
  /** group：让 UI 把相关参数折叠到同一组（basic 基础 / advanced 高级 / sampler 采样器）。 */
  group?: "basic" | "advanced" | "sampler" | "quality";
  /** 是否隐藏在「高级」折叠面板之后。 */
  advanced?: boolean;
  /** 不渲染任何控件——声明该字段是为了让适配器透传它（例如 `seed`），
   * 但 UI 会从别处（如顶部 seed 输入框）提供该值。 */
  hidden?: boolean;
}

export interface ModelCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  inpainting: boolean;
  negativePrompt: boolean;
  variations: boolean;
  /** 提供商标识 size 字符串的顺序。默认 "width_first"（宽在前）。 */
  sizeFormat?: "width_first" | "height_first";
}

/** 服务对外暴露的一个模型。参数由 schema 驱动，绝不硬编码。 */
export interface AiModel {
  id: string;
  serviceId: string;
  displayName: string;
  modelId: string; // 实际发送给厂商的模型标识值
  description: string;
  type: "image";
  capabilities: ModelCapabilities;
  /** 前端应当渲染的所有参数的 schema。 */
  parameters: ModelParameterSchema[];
  supportedAspectRatios: string[]; // 支持的宽高比，例如 ["1:1","16:9"]
  supportedSizes: string[]; // 支持的尺寸，例如 ["1024x1024"]
  maxBatch: number; // 单次请求最多生成图片数
  priceCredits: number;
  avgDurationSec: number;
  rating?: number; // 评分 0-5
  tags?: string[];
  enabled: boolean;
  sort: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  negativePrompt?: string;
  emoji?: string;
  tags?: string[];
}

/** 客户端发送的生成请求。 */
export interface GenerateRequest {
  serviceId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  count: number;
  aspectRatio: string;
  size: string;
  seed: number; // -1 表示随机
  parameters: Record<string, number | string | boolean>;
  /** 用于图生图的参考图，Base64 data URL。 */
  referenceImage?: string;
}

/**
 * 分支请求 —— 在某个已生成图片的基础上「二次创作」。
 *
 * 与 GenerateRequest 的区别：它不重新描述整套参数，而是继承父任务的
 * model/service/params，只额外指定「改哪张图、怎么改」。服务端会把父图
 * 转成 base64 data URL 当 referenceImage，再调 enqueueTask。
 */
export interface BranchRequest {
  /** 父任务 id。 */
  parentTaskId: string;
  /** 作为种子的父图 id（父任务 images[] 中的某一项）。 */
  parentImageId: string;
  /** 修改模式。 */
  editMode: BranchMode;
  /** 修改指令（增量）。reprompt 模式下与父 prompt 拼接后当全量 prompt。 */
  promptDelta?: string;
  /** 覆盖参数：只允许覆盖模型无关的生成参数（count/aspectRatio/size/seed/parameters）。 */
  overrides?: Partial<
    Pick<
      GenerateRequest,
      "count" | "aspectRatio" | "size" | "seed" | "parameters"
    >
  >;
}

/** 保存的生成配方——完整的参数集，一键即可复用。 */
export interface Preset {
  id: string;
  name: string;
  serviceId: string;
  modelId: string;
  prompt?: string;
  negativePrompt?: string;
  count: number;
  aspectRatio: string;
  size: string;
  seed: number;
  parameters: Record<string, number | string | boolean>;
  createdAt: number;
}

// ── 图片编辑（Image Editor） ──

/** AI 图片编辑操作类型。 */
export type ImageEditOperation =
  | "inpaint"    // 局部重绘（需 mask）
  | "remove"     // 删除对象
  | "add"        // 添加物体
  | "replace"    // 替换对象
  | "background" // 换背景
  | "outpaint"   // 扩图
  | "restore"    // 修复
  | "upscale";   // 超分

/** AI 图片编辑请求。 */
export interface ImageEditRequest {
  /** 源图片 data URL 或 URL。 */
  image: string;
  /** 遮罩 data URL（inpaint / remove / add / replace 时需要）。 */
  mask?: string;
  /** 编辑操作类型。 */
  operation: ImageEditOperation;
  /** 用户 Prompt。 */
  prompt: string;
  /** 负面 Prompt。 */
  negativePrompt?: string;
  /** 使用的模型 ID。 */
  modelId: string;
  /** 服务 ID。 */
  serviceId: string;
  /** 编辑强度 0-1。 */
  strength?: number;
  /** 目标宽度。 */
  width?: number;
  /** 目标高度。 */
  height?: number;
  /** 扩图方向（outpaint 时有效）。 */
  outpaintDirection?: "up" | "down" | "left" | "right" | "all";
  /** 超分倍数（upscale 时有效）。 */
  upscaleFactor?: 2 | 4;
  /** 目标尺寸字符串（outpaint / upscale 时有效，如 "1024x1024"）。 */
  size?: string;
  /** 由服务端解析后注入的完整服务/模型对象（适配器需要，不序列化到客户端）。 */
  service?: AiService;
  model?: AiModel;
  /** 真实 API Key——由服务端注入，不保存到任务对象，也不会序列化到客户端。 */
  apiKey?: string;
}

/** AI 图片编辑结果。 */
export interface ImageEditResult {
  /** 结果图片 URL。 */
  url: string;
  /** 宽度。 */
  width: number;
  /** 高度。 */
  height: number;
  /** 该结果在候选中的索引。 */
  index: number;
}

/** 任务状态机：queued(排队中) → processing(调用 AI 模型) → generating(生成图片中) → completed(完成) / failed(失败) / canceled(已取消)。 */
export type TaskStatus =
  | "queued"
  | "processing"
  | "generating"
  | "completed"
  | "failed"
  | "canceled";

export interface GeneratedImage {
  id: string;
  url: string;
  width: number;
  height: number;
  seed: number;
}

export interface GenerateTask {
  id: string;
  status: TaskStatus;
  progress: number; // 进度 0-100
  stage: string; // 人类可读的阶段标签
  request: GenerateRequest;
  model?: AiModel;
  service?: AiService;
  images: GeneratedImage[];
  errorMessage?: string;
  costCredits: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  favorite?: boolean;
  // ── 版本树链路（「二次创作」功能） ──
  /** 父任务 id。根任务为 undefined。 */
  parentTaskId?: string;
  /** 作为种子的那张父图 id。多图任务里可以指定改的是哪一张。 */
  parentImageId?: string;
  /** 同一父图的所有兄弟分支共用的 id，画布布局时用来横向铺开。 */
  branchId?: string;
  /** 这条分支 ultimately 来自哪张根图。根任务为 undefined，子任务指向祖父的 rootImageId 或自己的父图。 */
  rootImageId?: string;
  /** 本次修改的模式：改 prompt / 变体 / 图生图。 */
  editMode?: BranchMode;
  /** 用户写的修改指令（增量），不是全量 prompt。仅 reprompt 模式有意义。 */
  modificationPrompt?: string;
}

/** 「二次创作」的三种模式。 */
export type BranchMode = "reprompt" | "variant" | "edit";

export interface HistoryItem {
  id: string;
  prompt: string;
  negativePrompt?: string;
  modelName: string;
  serviceName: string;
  /** 产出该历史记录的服务/模型 ID。可选：历史表早期写入的行（这些列尚不存在时）
   *  只保存了展示名称。 */
  serviceId?: string;
  modelId?: string;
  /** 请求时指定的种子（-1 = 随机）。每张图的实际种子记录在 `images[]` 中。 */
  seed?: number;
  aspectRatio: string;
  size: string;
  count: number;
  images: GeneratedImage[];
  costCredits: number;
  durationMs: number;
  createdAt: number;
  favorite?: boolean;
  parameters: Record<string, number | string | boolean>;
  /** 版本树链路：这条历史记录是否由某次「二次创作」产生。 */
  parentTaskId?: string;
  /** 这次分支所基于的那张父图 id（父任务 images[] 中的某一项）。
   *  树状画布靠它还原「子节点挂在父节点哪张图上」，只记 parentTaskId
   *  不够（父任务可能多图，会指错位置）。 */
  parentImageId?: string;
  /** 这条分支 ultimately 来自哪张根图。 */
  rootImageId?: string;
}

/** 每个第三方适配器都需实现的接口。接入新厂商只需新增一个适配器，前端无需改动。 */
export interface ImageProvider {
  readonly adapterType: AdapterType;
  generate(params: GenerateParams): Promise<GenerateProviderResult>;
  getTaskStatus?(taskId: string): Promise<ProviderTaskStatus>;
  cancelTask?(taskId: string): Promise<void>;
  /** AI 图片编辑（inpaint / outpaint / remove 等）。 */
  editImage?(params: ImageEditRequest): Promise<ImageEditResult[]>;
}

export interface GenerateParams {
  model: AiModel;
  service: AiService;
  prompt: string;
  negativePrompt?: string;
  count: number;
  aspectRatio: string;
  size: string;
  seed: number;
  parameters: Record<string, number | string | boolean>;
  /** 用于图生图的参考图，Base64 data URL。 */
  referenceImage?: string;
  /** 真实 API Key——由服务端注入，不保存到任务对象，也不会序列化到客户端。 */
  apiKey?: string;
}

export interface GenerateProviderResult {
  images: GeneratedImage[];
  providerTaskId?: string;
}

export interface ProviderTaskStatus {
  status: TaskStatus;
  progress: number;
  stage: string;
  images?: GeneratedImage[];
  errorMessage?: string;
}
