"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Clock, Coins } from "lucide-react";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AiModel } from "@/lib/types";

async function fetchModels(serviceId: string) {
  const r = await fetch(`/api/models?serviceId=${serviceId}`);
  return (await r.json()).models as AiModel[];
}

export function ModelSelect() {
  const serviceId = useStudio((s) => s.serviceId);
  const modelId = useStudio((s) => s.modelId);
  const set = useStudio((s) => s.set);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data: models } = useQuery({
    queryKey: ["models", serviceId],
    queryFn: () => fetchModels(serviceId!),
    enabled: !!serviceId,
  });

  // auto-select first model when service changes
  useEffect(() => {
    if (models?.length) {
      const stillValid = models.some((m) => m.id === modelId);
      if (!stillValid) set("modelId", models[0].id);
    }
  }, [models, modelId, set]);

  // when model changes, reset dynamic params to schema defaults
  useEffect(() => {
    if (!models) return;
    const m = models.find((x) => x.id === modelId);
    if (!m) return;
    const defaults: Record<string, number | string | boolean> = {};
    m.parameters.forEach((p) => {
      if (p.default !== undefined) defaults[p.key] = p.default;
    });
    set("parameters", defaults);
    // sync aspect/size/count to model-supported defaults if current invalid.
    // For size, prefer a 16:9 (landscape) high-res option when the current
    // ratio is 16:9, since the default store ratio is 16:9 — keeps the first
    // render showing a sensible high-res landscape size instead of the list's
    // first (often portrait/odd) entry.
    const curRatio = useStudio.getState().aspectRatio;
    if (!m.supportedAspectRatios.includes(curRatio)) {
      set("aspectRatio", m.supportedAspectRatios.includes("16:9") ? "16:9" : m.supportedAspectRatios[0]);
    }
    const ratio = useStudio.getState().aspectRatio;
    const cur = useStudio.getState().size;
    if (!m.supportedSizes.includes(cur)) {
      const wantWide = ["16:9", "21:9", "3:2", "4:3"].includes(ratio);
      const wantTall = ["9:16", "2:3", "3:4"].includes(ratio);
      const pick =
        m.supportedSizes.find((s) => {
          const [w, h] = s.split("x").map(Number);
          return wantWide ? w >= h : wantTall ? h > w : w === h;
        }) ?? m.supportedSizes[0];
      set("size", pick);
    }
    if (useStudio.getState().count > m.maxBatch) set("count", m.maxBatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, models]);

  const current = useMemo(
    () => models?.find((m) => m.id === modelId),
    [models, modelId]
  );

  const filtered = useMemo(() => {
    if (!models) return [];
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [models, query]);

  if (!serviceId) return null;

  if (models && models.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-ink-3">模型</h3>
        <div className="rounded-md border border-dashed border-line bg-paper-3/30 p-3 text-center">
          <p className="text-xs text-ink-3">该服务下还没有模型</p>
          <a
            href={`/admin/services/${serviceId}`}
            className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline"
          >
            去添加模型 →
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-ink-3">模型</h3>

      {/* current model card */}
      {current && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full rounded-md border border-line bg-paper-3/40 p-3 text-left transition-[background-color,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-paper-3 hover:border-[color:var(--color-line)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{current.displayName}</span>
              {current.rating && (
                <span className="flex items-center gap-0.5 text-xs text-accent">
                  <Star className="h-3 w-3 fill-accent" />
                  {current.rating}
                </span>
              )}
            </div>
            <Badge variant="accent">
              <Coins className="mr-1 h-3 w-3" />
              {current.priceCredits}
            </Badge>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-3">
            {current.description}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
            <Clock className="h-3 w-3" />
            预计 {current.avgDurationSec}s
            {current.tags?.map((t) => (
              <Badge key={t} variant="outline" className="ml-1">
                {t}
              </Badge>
            ))}
          </div>
        </button>
      )}

      {/* search + list */}
      {open && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索模型…"
              className="pl-8"
            />
          </div>
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                set("modelId", m.id);
                setOpen(false);
              }}
              className={cn(
                "w-full rounded-md border border-transparent p-2.5 text-left transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-line hover:bg-paper-3 active:scale-[0.98]",
                m.id === modelId && "border-accent/40 bg-accent/5"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">{m.displayName}</span>
                <Badge variant="default">
                  <Coins className="mr-1 h-3 w-3" />
                  {m.priceCredits}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{m.description}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-ink-3">无匹配模型</p>
          )}
        </div>
      )}
    </section>
  );
}
