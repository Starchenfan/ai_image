/**
 * Core domain types for the multi-service + multi-model + adapter system.
 * Nothing about a specific provider is hard-coded here.
 */

export type ServiceStatus = "online" | "offline" | "degraded" | "rate_limited" | "maintenance";
export type AdapterType = "openai" | "flux" | "stable_diffusion" | "custom" | "proxy";

/** A configured third-party image API endpoint. */
export interface AiService {
  id: string;
  name: string;
  /** Which adapter handles this service. */
  adapterType: AdapterType;
  baseUrl: string;
  /** Stored server-side only; never serialized to the client. */
  apiKeyMasked: string;
  status: ServiceStatus;
  /** Simulated latency in ms, for display. */
  latencyMs: number;
  recommended?: boolean;
  tags?: string[];
  createdAt: string;
}

/** Parameter schema field — frontend renders UI from this. */
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
  /** group lets the UI collapse related params (basic / advanced / sampler). */
  group?: "basic" | "advanced" | "sampler" | "quality";
  /** hide behind "Advanced" toggle */
  advanced?: boolean;
}

export interface ModelCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  inpainting: boolean;
  negativePrompt: boolean;
  variations: boolean;
}

/** A model exposed by a service. Parameters are schema-driven, never hard-coded. */
export interface AiModel {
  id: string;
  serviceId: string;
  displayName: string;
  modelId: string; // the value sent to the provider
  description: string;
  type: "image";
  capabilities: ModelCapabilities;
  /** Schema for every parameter the frontend should render. */
  parameters: ModelParameterSchema[];
  supportedAspectRatios: string[]; // e.g. ["1:1","16:9"]
  supportedSizes: string[]; // e.g. ["1024x1024"]
  maxBatch: number; // max images per request
  priceCredits: number;
  avgDurationSec: number;
  rating?: number; // 0-5
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

/** A generation request the client sends. */
export interface GenerateRequest {
  serviceId: string;
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  count: number;
  aspectRatio: string;
  size: string;
  seed: number; // -1 = random
  parameters: Record<string, number | string | boolean>;
}

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
  progress: number; // 0-100
  stage: string; // human label
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
}

export interface HistoryItem {
  id: string;
  prompt: string;
  negativePrompt?: string;
  modelName: string;
  serviceName: string;
  aspectRatio: string;
  size: string;
  count: number;
  images: GeneratedImage[];
  costCredits: number;
  durationMs: number;
  createdAt: number;
  favorite?: boolean;
  parameters: Record<string, number | string | boolean>;
}

/** Interface every third-party adapter implements. New provider → new adapter, no frontend change. */
export interface ImageProvider {
  readonly adapterType: AdapterType;
  generate(params: GenerateParams): Promise<GenerateProviderResult>;
  getTaskStatus?(taskId: string): Promise<ProviderTaskStatus>;
  cancelTask?(taskId: string): Promise<void>;
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
  /** Real API key — injected server-side, never stored on the task / never serialized to client. */
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
