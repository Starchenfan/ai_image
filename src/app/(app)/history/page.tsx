"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  History as HistoryIcon,
  Star,
  Trash2,
  RefreshCw,
  Download,
  Search,
  ImageIcon,
  SlidersHorizontal,
  ClipboardCopy,
} from "lucide-react";
import type { HistoryItem } from "@/lib/types";
import { cn, formatRelativeTime, formatDuration } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudio } from "@/lib/store";

type Filter = "all" | "today" | "favorite";

async function fetchHistory(filter: Filter) {
  const r = await fetch(`/api/history?filter=${filter}`);
  return (await r.json()).items as HistoryItem[];
}

/** The full recipe behind one run — enough to reproduce it elsewhere. */
function recipeJson(h: HistoryItem) {
  return JSON.stringify(
    {
      prompt: h.prompt,
      negativePrompt: h.negativePrompt,
      service: h.serviceName,
      model: h.modelName,
      serviceId: h.serviceId,
      modelId: h.modelId,
      aspectRatio: h.aspectRatio,
      size: h.size,
      count: h.count,
      requestedSeed: h.seed ?? -1,
      seeds: h.images.map((i) => i.seed),
      parameters: h.parameters,
    },
    null,
    2
  );
}

/** Images are stored as WebP or PNG — never SVG. Take the real extension when
 *  the URL carries one, otherwise fall back to png. */
function downloadName(h: HistoryItem, url: string) {
  const ext = /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.exec(url)?.[1] ?? "png";
  return `huijie-${h.id}.${ext.toLowerCase()}`;
}

export default function HistoryPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const set = useStudio((s) => s.set);
  const applyHistoryItem = useStudio((s) => s.applyHistoryItem);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Refill the studio form from a past run and jump back to it. Seed is locked
  // to the one the provider actually used, so the run is reproducible.
  const reuse = (h: HistoryItem) => {
    applyHistoryItem(h, { lockSeed: true });
    router.push("/");
  };

  const copyRecipe = async (h: HistoryItem) => {
    try {
      await navigator.clipboard.writeText(recipeJson(h));
      setCopiedId(h.id);
      setTimeout(() => setCopiedId((cur) => (cur === h.id ? null : cur)), 1600);
    } catch {
      // Clipboard is unavailable outside a secure context — nothing to undo.
    }
  };

  const { data: items = [] } = useQuery({
    queryKey: ["history", filter],
    queryFn: () => fetchHistory(filter),
  });

  const toggleFav = useMutation({
    mutationFn: async ({ id, fav }: { id: string; fav: boolean }) => {
      await fetch(`/api/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: fav }),
      });
    },
    onMutate: async ({ id, fav }) => {
      qc.setQueryData<HistoryItem[]>(["history", filter], (old) =>
        old?.map((h) => (h.id === id ? { ...h, favorite: fav } : h))
      );
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/history/${id}`, { method: "DELETE" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["history"] }),
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/generate/${id}/retry`, { method: "POST" });
      return (await r.json()).task;
    },
    onSuccess: (task) => {
      set("activeTaskId", task.id);
      // route to studio
      router.push("/");
    },
  });

  const filtered = items.filter(
    (h) =>
      h.prompt.toLowerCase().includes(q.toLowerCase()) ||
      h.modelName.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper-2">
            <HistoryIcon className="h-4.5 w-4.5 text-accent" />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">生成历史</h1>
            <p className="text-xs text-ink-3">查看、复用、收藏过往的生成结果</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索 Prompt 或模型…"
              className="h-9 w-full pl-8 sm:w-64"
            />
          </div>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="today">今日</TabsTrigger>
          <TabsTrigger value="favorite">收藏</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyHistory />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((h, i) => (
            <article
              key={h.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-paper-2/40 animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* thumb */}
              <div className="relative aspect-video overflow-hidden bg-paper-3">
                {h.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.images[0].url}
                    alt={h.prompt.slice(0, 40)}
                    className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-3">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  {h.count > 1 && (
                    <Badge variant="default" className="bg-black/60 text-ink backdrop-blur-sm">
                      ×{h.count}
                    </Badge>
                  )}
                  {h.favorite && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-accent backdrop-blur-sm">
                      <Star className="h-3 w-3 fill-accent" />
                    </span>
                  )}
                </div>
              </div>

              {/* body */}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 text-xs text-ink-2">{h.prompt}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-3">
                  <Badge variant="accent">{h.modelName}</Badge>
                  <span className="font-mono">{h.size}</span>
                  <span>·</span>
                  <span>{h.aspectRatio}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-ink-3">
                  <span>{formatRelativeTime(h.createdAt)}</span>
                  <span className="font-mono">
                    {formatDuration(h.durationMs)} · {h.costCredits}c
                  </span>
                </div>
              </div>

              {/* actions */}
              <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                <ActionBtn
                  icon={SlidersHorizontal}
                  label="复用参数（回到工作台，锁定 seed）"
                  onClick={() => reuse(h)}
                />
                <ActionBtn
                  icon={RefreshCw}
                  label="重试"
                  loading={retry.isPending}
                  onClick={() => retry.mutate(h.id)}
                />
                <ActionBtn
                  icon={Star}
                  label="收藏"
                  active={h.favorite}
                  onClick={() => toggleFav.mutate({ id: h.id, fav: !h.favorite })}
                />
                <ActionBtn
                  icon={ClipboardCopy}
                  label={copiedId === h.id ? "已复制参数 JSON" : "复制参数 JSON"}
                  active={copiedId === h.id}
                  onClick={() => copyRecipe(h)}
                />
                {h.images[0] && (
                  <ActionBtn
                    icon={Download}
                    label="下载"
                    onClick={() => {
                      const url = h.images[0].url;
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = downloadName(h, url);
                      a.click();
                    }}
                  />
                )}
                <ActionBtn
                  icon={Trash2}
                  label="删除"
                  danger
                  onClick={() => del.mutate(h.id)}
                  className="ml-auto"
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
  loading,
  className,
}: {
  icon: typeof Star;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink",
        active && "text-accent",
        danger && "hover:text-danger",
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
    </button>
  );
}

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper-2">
        <HistoryIcon className="h-6 w-6 text-ink-3" />
      </div>
      <div>
        <p className="text-sm font-medium text-ink-2">还没有历史记录</p>
        <p className="mt-0.5 text-xs text-ink-3">生成的图片会自动保存在这里</p>
      </div>
      <Button asChild size="sm" variant="secondary">
        <a href="/">去创作</a>
      </Button>
    </div>
  );
}
