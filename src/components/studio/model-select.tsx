"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Clock, Coins, Check } from "lucide-react";
import { useStudio } from "@/lib/store";
import { fetchModels } from "@/lib/use-models";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AiModel } from "@/lib/types";

/**
 * 模型选择器 — 工作台表单组件。
 *
 * 根据 store 中的 serviceId 拉取该服务下的全部模型列表（/api/models?serviceId=），
 * 支持两种模式：
 *   - 单选模式：点击主卡展开搜索列表，选中后写入 modelId
 *   - 对比模式：勾选至少 2 个模型，同一 Prompt 侧向对比生成
 * 模型切换时会自动把动态参数、比例、尺寸、数量重置为新模型 schema 的默认值。
 *
 * 交互对象：
 *   - TanStack Query 缓存（queryKey: ["models", serviceId]）
 *   - useStudio store（serviceId / modelId / compareMode / compareIds / parameters 等）
 *   - /api/models 路由（GET）
 *   - lib/use-models（useSelectedModel）
 */
export function ModelSelect() {
  const serviceId = useStudio((s) => s.serviceId);
  const modelId = useStudio((s) => s.modelId);
  const set = useStudio((s) => s.set);
  const compareMode = useStudio((s) => s.compareMode);
  const compareIds = useStudio((s) => s.compareIds);
  const toggleCompare = useStudio((s) => s.toggleCompare);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data: models } = useQuery({
    queryKey: ["models", serviceId],
    queryFn: () => fetchModels(serviceId!),
    enabled: !!serviceId,
  });

  // 服务切换后，若当前 modelId 已不在新服务的模型列表中，自动选中首个模型
  useEffect(() => {
    if (models?.length) {
      const stillValid = models.some((m) => m.id === modelId);
      if (!stillValid) set("modelId", models[0].id);
    }
  }, [models, modelId, set]);

  // 模型切换时，把动态参数、比例、尺寸、数量全部重置为新模型 schema 的默认值，
  // 避免把旧模型的参数发给新模型（上游可能 400）。
  // 例外：若 store 中 pendingRecipeFor 正好指向当前模型，
  // 说明是预设/历史配方刚填的表，保留用户真实值，不做覆盖。
  useEffect(() => {
    if (!models) return;
    const m = models.find((x) => x.id === modelId);
    if (!m) return;
    // 预设 / 历史配方刚刚给这个模型填了真实参数值——如果执行下方的重置，
    // 这些值就会被丢掉，所以要先跳过。
    if (useStudio.getState().pendingRecipeFor === modelId) {
      set("pendingRecipeFor", null);
      return;
    }
    const defaults: Record<string, number | string | boolean> = {};
    m.parameters.forEach((p) => {
      if (p.default !== undefined) defaults[p.key] = p.default;
    });
    set("parameters", defaults);
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
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-3">模型</h3>
        <label className="flex items-center gap-1.5 text-[10px] text-ink-3">
          对比
          <Switch
            checked={compareMode}
            onCheckedChange={(v) => {
              set("compareMode", v);
              if (v) setOpen(true);
              else set("compareIds", []);
            }}
          />
        </label>
      </div>

      {/* 当前模型主卡（仅单选模式显示） */}
      {!compareMode && current && (
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
      {(open || compareMode) && (
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
          {compareMode && (
            <p className="px-1 text-[10px] text-accent">
              {compareIds.length > 0
                ? `已选 ${compareIds.length} 个模型进行对比`
                : "勾选至少 2 个模型，用同一 Prompt 对比生成"}
            </p>
          )}
          {filtered.map((m) => {
            const isChecked = compareMode && compareIds.includes(m.id);
            const isActive = m.id === modelId;
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (compareMode) toggleCompare(m.id);
                  else {
                    set("modelId", m.id);
                    setOpen(false);
                  }
                }}
                className={cn(
                  "w-full rounded-md border p-2.5 text-left transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-line hover:bg-paper-3 active:scale-[0.98]",
                  compareMode
                    ? isChecked
                      ? "border-accent/60 bg-accent/5"
                      : "border-transparent"
                    : isActive
                      ? "border-accent/40 bg-accent/5"
                      : "border-transparent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {compareMode && (
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isChecked
                            ? "border-accent bg-accent text-accent-ink"
                            : "border-line"
                        )}
                      >
                        {isChecked && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium text-ink">
                      {m.displayName}
                    </span>
                  </div>
                  <Badge variant="default">
                    <Coins className="mr-1 h-3 w-3" />
                    {m.priceCredits}
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{m.description}</p>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-ink-3">无匹配模型</p>
          )}
        </div>
      )}
    </section>
  );
}
