"use client";

import { useQuery } from "@tanstack/react-query";
import { useStudio } from "@/lib/store";
import type { AiModel } from "@/lib/types";

export async function fetchModels(serviceId: string) {
  const r = await fetch(`/api/models?serviceId=${serviceId}`);
  return (await r.json()).models as AiModel[];
}

/** Models of the currently selected service. Shares the react-query cache key
 *  with ModelSelect, so no extra request. */
export function useServiceModels() {
  const serviceId = useStudio((s) => s.serviceId);
  return useQuery({
    queryKey: ["models", serviceId],
    queryFn: () => fetchModels(serviceId!),
    enabled: !!serviceId,
  });
}

/** 当前生成表单中选中的模型，列表加载中时为 undefined。
 *  读取 .capabilities 可以判断某些 provider 字段模型是否接受（如 negativePrompt）。 */
export function useSelectedModel(): AiModel | undefined {
  const modelId = useStudio((s) => s.modelId);
  const { data: models } = useServiceModels();
  return models?.find((m) => m.id === modelId);
}
