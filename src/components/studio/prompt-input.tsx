"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Eraser,
  History as HistoryIcon,
  LayoutGrid,
} from "lucide-react";
import { useStudio } from "@/lib/store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PromptTemplate } from "@/lib/types";

async function fetchTemplates() {
  const r = await fetch("/api/templates");
  return (await r.json()).templates as PromptTemplate[];
}

const QUICK = [
  { label: "AI 润色", icon: Sparkles, tag: "优化" },
  { label: "风格", icon: Sparkles, tag: "风格" },
  { label: "人物", icon: Sparkles, tag: "人物" },
  { label: "场景", icon: Sparkles, tag: "场景" },
  { label: "光影", icon: Sparkles, tag: "光影" },
];

const SUFFIX: Record<string, string> = {
  优化: "，超精细细节，8K，专业级，锐利对焦",
  风格: "，电影感构图，戏剧性光影，氛围感",
  人物: "，全身像，自然姿态，精致面容",
  场景: "，宏大场景，空间纵深感，沉浸氛围",
  光影: "，黄金时刻轮廓光，体积光，光线层次",
};

export function PromptInput() {
  const prompt = useStudio((s) => s.prompt);
  const negativePrompt = useStudio((s) => s.negativePrompt);
  const showNegative = useStudio((s) => s.showNegative);
  const set = useStudio((s) => s.set);
  const [optimizing, setOptimizing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: fetchTemplates,
  });

  const enhance = (tag: string) => {
    if (tag === "优化") {
      // Real polish via 基元律动 glm-5.2 chat completions. No mock fallback.
      setOptimizing(true);
      setPolishError(null);
      const base = prompt.trim();
      if (!base) {
        setPolishError("请先输入 prompt");
        setOptimizing(false);
        return;
      }
      fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: base }),
      })
        .then(async (r) => {
          const data = (await r.json()) as { polished?: string; error?: string };
          if (!r.ok || !data.polished) {
            throw new Error(data.error || `润色失败 (${r.status})`);
          }
          set("prompt", data.polished);
        })
        .catch((e: unknown) => {
          setPolishError(e instanceof Error ? e.message : "润色失败");
        })
        .finally(() => setOptimizing(false));
      return;
    }
    set("prompt", (prompt ? prompt + "，" : "") + SUFFIX[tag]);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-3">Prompt</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => set("prompt", "")}
            aria-label="清空"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="模板">
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Prompt 模板</DialogTitle>
              </DialogHeader>
              <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {templates && templates.length === 0 && (
                  <p className="col-span-full px-2 py-6 text-center text-xs text-ink-3">
                    暂无模板
                  </p>
                )}
                {templates?.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      set("prompt", t.prompt);
                      if (t.negativePrompt) {
                        set("negativePrompt", t.negativePrompt);
                        set("showNegative", true);
                      }
                    }}
                    className="rounded-md border border-line bg-paper-3/40 p-3 text-left transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-paper-3 hover:border-[color:var(--color-line)] active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{t.emoji}</span>
                      <span className="text-sm font-medium text-ink">{t.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-3">{t.prompt}</p>
                    {t.tags && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.tags.map((x) => (
                          <Badge key={x} variant="outline" className="text-[10px]">
                            {x}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Textarea
        value={prompt}
        onChange={(e) => set("prompt", e.target.value)}
        placeholder="描述你想要的图片…  江南古典庭院，古风少女，水墨国风，电影光影"
        className="min-h-[152px] resize-none rounded-lg bg-paper-2/80 px-3.5 py-3 text-[13px] leading-6 shadow-inner [scrollbar-gutter:stable] hover:bg-paper-3/55 focus-visible:bg-paper-3/65"
      />

      {/* quick enhance chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <button
              key={q.tag}
              onClick={() => enhance(q.tag)}
              disabled={optimizing && q.tag === "优化"}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-3/40 px-2.5 py-1 text-xs text-ink-2 transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-accent/40 hover:bg-paper-3 hover:text-ink active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className={q.tag === "优化" ? "h-3 w-3 text-accent" : "h-3 w-3"} />
              {optimizing && q.tag === "优化" ? "润色中…" : q.label}
            </button>
          );
        })}
      </div>

      {polishError && (
        <p className="px-1 text-[11px] text-red-400">
          {polishError}
        </p>
      )}

      {/* negative prompt toggle */}
      <div>
        <button
          onClick={() => set("showNegative", !showNegative)}
          className="flex items-center gap-1 px-1 text-xs text-ink-3 transition-colors hover:text-ink-2"
        >
          <HistoryIcon className="h-3 w-3" />
          {showNegative ? "隐藏" : "高级设置"} · 反向提示词
        </button>
        {showNegative && (
          <div className="mt-1.5 animate-fade-in">
            <Textarea
              value={negativePrompt}
              onChange={(e) => set("negativePrompt", e.target.value)}
              placeholder="不希望出现的元素，如：低质量、模糊、变形、多余手指、水印"
              className="min-h-[60px] text-xs"
            />
          </div>
        )}
      </div>
    </section>
  );
}
