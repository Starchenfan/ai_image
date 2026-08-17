"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Sparkles } from "lucide-react";
import { useStudio } from "@/lib/store";
import { ServiceSelect } from "@/components/studio/service-select";
import { ModelSelect } from "@/components/studio/model-select";
import { PromptInput } from "@/components/studio/prompt-input";
import { ParamPanel } from "@/components/studio/param-panel";
import { AdvancedParams } from "@/components/studio/dynamic-field";
import { GenerateButton } from "@/components/studio/generate-button";
import { TaskStatus } from "@/components/studio/task-status";
import { ResultGrid } from "@/components/studio/result-grid";
import type { AiModel, GenerateTask } from "@/lib/types";

async function fetchModel(id: string) {
  const r = await fetch(`/api/models/${id}`);
  return (await r.json()).model as AiModel;
}

export default function StudioPage() {
  const modelId = useStudio((s) => s.modelId);
  const activeTaskId = useStudio((s) => s.activeTaskId);
  const results = useStudio((s) => s.results);
  const set = useStudio((s) => s.set);
  const buildRequest = useStudio((s) => s.buildRequest);
  const [genError, setGenError] = useState<string | null>(null);

  const { data: model } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => fetchModel(modelId!),
    enabled: !!modelId,
  });

  const handleGenerate = async () => {
    const req = buildRequest();
    if (!req) return;
    setGenError(null);
    set("results", null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!r.ok) {
        const err = (await r.json()) as { error?: string };
        throw new Error(err.error || `请求失败 (${r.status})`);
      }
      const data = (await r.json()) as { task: GenerateTask };
      set("activeTaskId", data.task.id);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDone = (task: GenerateTask) => {
    set("activeTaskId", null);
    if (task.status === "completed") {
      set("results", task);
    } else if (task.status === "failed") {
      // Surface the failure on the canvas so the user sees why + can retry.
      setGenError(task.errorMessage || "生成失败,请重试");
    }
  };

  const handleSwitchService = () => {
    // open service dropdown by re-selecting — simplest: nudge user to left panel
    set("activeTaskId", null);
    setGenError(null);
    document.getElementById("service-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-5.75rem)] lg:min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* LEFT — parameter panel. Solid elevated card, no backdrop-filter: a
          sticky blurred surface repaints on every scroll/animation tick and
          is the main source of perceived lag. Elevated card (paper-2 on
          paper) carries the separation without the cost. */}
      <aside className="min-h-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-paper-2">
          <div className="space-y-5 overflow-y-auto p-4 pb-6">
            <div id="service-section">
              <ServiceSelect />
            </div>
            <Divider />
            <ModelSelect />
            <Divider />
            <PromptInput />
            <Divider />
            <ParamPanel />
            {model && model.parameters.length > 0 && (
              <>
                <Divider />
                <AdvancedParams fields={model.parameters} />
              </>
            )}
          </div>
          <div className="shrink-0 border-t border-line bg-paper-2 p-3 shadow-[0_-12px_28px_var(--color-paper-2)]">
            <GenerateButton onGenerate={handleGenerate} />
          </div>
        </div>
      </aside>

      {/* RIGHT — canvas / results */}
      <section className="min-h-[60vh] rounded-lg border border-line bg-paper-2/60 p-4 md:p-6 lg:min-h-0 lg:overflow-y-auto">
        {genError && (
          <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger animate-fade-in">
            {genError}
          </div>
        )}

        {activeTaskId ? (
          <TaskStatus
            taskId={activeTaskId}
            onDone={handleDone}
            onRetry={handleGenerate}
            onSwitchService={handleSwitchService}
          />
        ) : results ? (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-ink">生成结果</h2>
                <p className="text-xs text-ink-3">
                  {results.images.length} 张 · {results.model?.displayName} ·{" "}
                  {results.request.size}
                </p>
              </div>
            </div>
            <ResultGrid task={results} />
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line" />;
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-accent/15 blur-2xl animate-pulse-soft" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-paper-3">
          <ImagePlus className="h-7 w-7 text-ink-3" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-2">画布等待你的想法</p>
        <p className="max-w-xs text-xs text-ink-3">
          选择模型，写下 Prompt，点击生成。复杂 API 配置全部隐藏在后台。
        </p>
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper-3/40 px-3 py-1 text-xs text-ink-3">
        <Sparkles className="h-3 w-3 text-accent" />
        支持 多服务 + 多模型 + 动态参数 Schema
      </div>
    </div>
  );
}
