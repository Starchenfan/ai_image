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

/** The model currently selected in the generate form, or undefined while the
 *  list is still loading. Read `.capabilities` off this to gate UI that maps to
 *  a provider field the model may not accept. */
export function useSelectedModel(): AiModel | undefined {
  const modelId = useStudio((s) => s.modelId);
  const { data: models } = useServiceModels();
  return models?.find((m) => m.id === modelId);
}
