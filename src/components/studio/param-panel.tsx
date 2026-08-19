"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Label } from "@/components/ui/label";
import { Dices } from "lucide-react";
import type { AiModel } from "@/lib/types";

const RATIOS: { v: string; w: number; h: number }[] = [
  { v: "1:1", w: 1, h: 1 },
  { v: "16:9", w: 16, h: 9 },
  { v: "9:16", w: 9, h: 16 },
  { v: "4:3", w: 4, h: 3 },
  { v: "3:4", w: 3, h: 4 },
  { v: "21:9", w: 21, h: 9 },
];

const COUNT_PRESETS = [1, 2, 4, 8];

async function fetchModel(id: string) {
  const r = await fetch(`/api/models/${id}`);
  return (await r.json()).model as AiModel;
}

export function ParamPanel() {
  const { aspectRatio, size, count, seed, set } = useStudio();
  const modelId = useStudio((s) => s.modelId);

  // Read the current model so the Size chips reflect what the provider
  // actually supports (high-res options live here).
  const { data: model } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => fetchModel(modelId!),
    enabled: !!modelId,
  });

  const sizes = useMemo(() => {
    const ms = model?.supportedSizes ?? [];
    return ms.length > 0
      ? ms
      : ["512x512", "768x768", "1024x1024", "1536x1024"];
  }, [model]);

  // maxBatch = max images per single provider request. Only show count
  // options up to the provider's real batch ceiling — no faking by looping.
  const maxBatch = model?.maxBatch ?? 1;
  const counts = useMemo(
    () => COUNT_PRESETS.filter((c) => c <= maxBatch),
    [maxBatch]
  );

  // Pull current model's supported ratios/sizes from store-level state.
  // We read from the models query via the parent; here we just use whatever
  // the store holds — ModelSelect enforces validity on model switch.
  return (
    <section className="space-y-4">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-ink-3">
        图片参数
      </h3>

      {/* Aspect ratio */}
      <div className="space-y-1.5">
        <Label>比例</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {RATIOS.map((r) => {
            const active = aspectRatio === r.v;
            const maxBox = 26;
            const bw = r.w >= r.h ? maxBox : Math.round((r.w / r.h) * maxBox);
            const bh = r.h >= r.w ? maxBox : Math.round((r.h / r.w) * maxBox);
            return (
              <button
                key={r.v}
                onClick={() => set("aspectRatio", r.v)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border border-line bg-paper-3/40 py-2 transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-paper-3 active:scale-95",
                  active && "border-accent bg-accent/10"
                )}
              >
                <span
                  className={cn(
                    "block rounded-sm border transition-[background-color,border-color] duration-[var(--dur-fast)]",
                    active ? "border-accent bg-accent" : "border-ink-3"
                  )}
                  style={{ width: bw, height: bh }}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    active ? "text-accent" : "text-ink-3"
                  )}
                >
                  {r.v}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Size */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>尺寸</Label>
          <span className="text-[10px] text-ink-3">分辨率越高越清晰</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sizes.map((s) => {
            const isHighRes = Number(s.split("x")[0]) >= 1536;
            const active = size === s;
            return (
              <button
                key={s}
                onClick={() => set("size", s)}
                aria-pressed={active}
                className={cn(
                  "rounded-md border border-line bg-paper-3/40 px-2.5 py-1 font-mono text-xs transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-paper-3 active:scale-95",
                  active ? "border-accent/60 bg-accent/5 text-ink" : "text-ink-2"
                )}
              >
                {s}
                {isHighRes && (
                  <span className="ml-1 text-[9px] text-accent">HD</span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => {
              const v = window.prompt("自定义尺寸（如 1024x1024）", size);
              if (v) set("size", v);
            }}
            className={cn(
              "rounded-md border border-line bg-paper-3/40 px-2.5 py-1 font-mono text-xs text-ink-3 transition-[background-color,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-paper-3 hover:text-ink active:scale-95",
              !sizes.includes(size) && size && "border-accent/60 bg-accent/5 text-ink"
            )}
          >
            自定义
          </button>
        </div>
      </div>

      {/* Count */}
      <div className="space-y-1.5">
        <Label>
          生成数量
          {maxBatch <= 1 && (
            <span className="ml-2 text-[10px] font-normal text-ink-3">
              该模型不支持批量
            </span>
          )}
        </Label>
        {maxBatch <= 1 ? (
          <div className="rounded-md border border-dashed border-line bg-paper-3/20 px-2.5 py-1.5 text-center text-sm font-medium text-ink-2">
            1 张
          </div>
        ) : (
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${counts.length}, 1fr)` }}
          >
            {counts.map((c) => {
              const active = count === c;
              return (
                <button
                  key={c}
                  onClick={() => set("count", c)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-md border border-line bg-paper-3/40 py-1.5 text-sm font-medium transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-paper-3 active:scale-95",
                    active && "border-accent/60 bg-accent/5 text-ink"
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Seed */}
      <div className="space-y-1.5">
        <Label>Seed</Label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={seed === -1 ? "" : seed}
            onChange={(e) =>
              set("seed", e.target.value === "" ? -1 : Number(e.target.value))
            }
            placeholder="Random"
            className="flex h-8 w-full rounded-md border border-line bg-paper-3/50 px-2.5 font-mono text-xs text-ink shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]"
          />
          <button
            onClick={() => set("seed", -1)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-paper-3/40 text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink"
            aria-label="随机 Seed"
          >
            <Dices className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
