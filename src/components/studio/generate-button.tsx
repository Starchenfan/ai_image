"use client";

import { useQuery } from "@tanstack/react-query";
import { useStudio } from "@/lib/store";
import { Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import type { AiModel } from "@/lib/types";

/**
 * 生成按钮 — 工作台表单组件。
 *
 * 点击后回调 onGenerate（由父组件负责提交生成任务）。按钮状态受
 * activeTaskId 控制：有进行中的任务时禁用并显示「生成中…」。
 * 下方实时显示本次生成预计消耗的 Credits（模型单价 × 数量）与所选模型名。
 *
 * 交互对象：
 *   - useStudio store（modelId / count / prompt / activeTaskId）
 *   - /api/models/:id 路由（GET，获取 priceCredits）
 */
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
