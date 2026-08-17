"use client";

import { create } from "zustand";
import type { GenerateRequest, GenerateTask } from "@/lib/types";

interface StudioState {
  // current selection (mirrors the generate form)
  serviceId: string | null;
  modelId: string | null;
  prompt: string;
  negativePrompt: string;
  count: number;
  aspectRatio: string;
  size: string;
  seed: number;
  advancedOpen: boolean;
  parameters: Record<string, number | string | boolean>;
  showNegative: boolean;
  activeTaskId: string | null;
  // last results for the grid
  results: GenerateTask | null;

  set: <K extends keyof StudioState>(
    k: K,
    v: StudioState[K]
  ) => void;
  resetParams: (params: Record<string, number | string | boolean>) => void;
  buildRequest: () => GenerateRequest | null;
}

export const useStudio = create<StudioState>((set, get) => ({
  serviceId: null,
  modelId: null,
  prompt: "",
  negativePrompt: "",
  count: 1,
  aspectRatio: "16:9",
  size: "1280x720",
  seed: -1,
  advancedOpen: false,
  parameters: {},
  showNegative: false,
  activeTaskId: null,
  results: null,

  set: (k, v) => set({ [k]: v } as Pick<StudioState, typeof k>),

  resetParams: (params) => set({ parameters: params }),

  buildRequest: () => {
    const s = get();
    if (!s.serviceId || !s.modelId || !s.prompt.trim()) return null;
    return {
      serviceId: s.serviceId,
      modelId: s.modelId,
      prompt: s.prompt.trim(),
      negativePrompt: s.negativePrompt || undefined,
      count: s.count,
      aspectRatio: s.aspectRatio,
      size: s.size,
      seed: s.seed,
      parameters: s.parameters,
    };
  },
}));

export type { GenerateTask };
