"use client";

import { useQuery } from "@tanstack/react-query";
import { useStudio } from "@/lib/store";
import { Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import type { AiModel } from "@/lib/types";

async function fetchModel(id: string) {
  const r = await fetch(`/api/models/${id}`);
  return (await r.json()).model as AiModel;
}

export function GenerateButton({ onGenerate }: { onGenerate: () => void }) {
  const modelId = useStudio((s) => s.modelId);
  const count = useStudio((s) => s.count);
  const prompt = useStudio((s) => s.prompt);
  const activeTaskId = useStudio((s) => s.activeTaskId);

  const { data: model } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => fetchModel(modelId!),
    enabled: !!modelId,
  });

  const busy = !!activeTaskId;
  const cost = (model?.priceCredits ?? 0) * count;
  const canGenerate = prompt.trim().length > 0 && !busy;

  return (
    <div className="space-y-2">
      <Button
        onClick={onGenerate}
        disabled={!canGenerate}
        className="h-11 w-full text-sm font-medium"
        size="lg"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            生成中…
          </>
        ) : (
          <>
            <Wand2 className="h-4 w-4" />
            生成图片
          </>
        )}
      </Button>
      <div className="flex items-center justify-center gap-1.5 text-xs text-ink-3">
        <Coins className="h-3 w-3 text-accent" />
        预计消耗 <span className="font-mono text-ink-2">{cost}</span> Credits
        {model && (
          <>
            · <span>{model.displayName}</span>
          </>
        )}
      </div>
    </div>
  );
}
