"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Heart, Copy, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStudio } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ExploreItem = {
  id: string;
  taskId: string;
  prompt: string;
  imageUrl: string;
  model: string;
  category: string;
  author: string;
  likes: number;
  aspect: string;
  width: number;
  height: number;
  createdAt: number;
};

async function fetchExplore(cat: string) {
  const r = await fetch(`/api/explore?category=${encodeURIComponent(cat)}`);
  const data = (await r.json()) as { items: ExploreItem[]; categories: string[] };
  return data;
}

/** aspect → padding-top % for proportional box */
function aspectToPadding(aspect: string): string {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return "100%";
  return `${(h / w) * 100}%`;
}

export default function ExplorePage() {
  const router = useRouter();
  const [cat, setCat] = useState("全部");
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const set = useStudio((s) => s.set);

  const { data } = useQuery({
    queryKey: ["explore", cat],
    queryFn: () => fetchExplore(cat),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const items = data?.items ?? [];
  const categories = data?.categories ?? [];

  const toggleLike = (id: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const usePrompt = (prompt: string) => {
    set("prompt", prompt);
    router.push("/");
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper-2">
            <TrendingUp className="h-4.5 w-4.5 text-accent" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink">探索社区</h1>
            <p className="text-xs text-ink-3">发现精彩作品，一键复用 Prompt</p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit">
          <Sparkles className="h-3 w-3 text-accent" />
          {items.length} 作品
        </Badge>
      </header>

      {/* category chips — horizontal scroll on mobile */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
              cat === c
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-ink-3 hover:border-[color:var(--color-line)] hover:text-ink-2"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* masonry via CSS columns */}
      {items.length === 0 ? (
        <EmptyExplore />
      ) : (
        <div className="columns-2 gap-3 [column-fill:_balance] md:columns-3 lg:columns-4">
          {items.map((item, i) => (
            <article
              key={item.id}
              className="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg border border-line bg-paper-2/40 animate-fade-up"
              style={{ animationDelay: `${i * 35}ms` }}
            >
            <div
              className="relative w-full overflow-hidden"
              style={{ paddingTop: aspectToPadding(item.aspect) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.prompt.slice(0, 80)}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]"
              />

              {/* hover overlay */}
              <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/0 to-black/0 p-2.5 opacity-0 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:opacity-100">
                <div className="flex justify-end">
                  <button
                    onClick={() => toggleLike(item.id)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80",
                      liked.has(item.id) && "text-accent"
                    )}
                  >
                    <Heart className={cn("h-3.5 w-3.5", liked.has(item.id) && "fill-accent")} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <p className="line-clamp-3 text-[11px] leading-relaxed text-ink">
                    {item.prompt}
                  </p>
                  <button
                    onClick={() => usePrompt(item.prompt)}
                    className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-ink transition-colors hover:opacity-90"
                  >
                    <Copy className="h-3 w-3" />
                    复用 Prompt
                  </button>
                </div>
              </div>

              {/* always-visible like count */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-ink backdrop-blur-sm group-hover:opacity-0">
                <Heart className="h-2.5 w-2.5" />
                {item.likes + (liked.has(item.id) ? 1 : 0)}
              </div>
            </div>

            {/* meta strip */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <Badge variant="accent" className="text-[10px]">
                {item.model}
              </Badge>
              <span className="truncate text-[10px] text-ink-3">@{item.author}</span>
            </div>
          </article>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyExplore() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper-2">
        <TrendingUp className="h-6 w-6 text-ink-3" />
      </div>
      <div>
        <p className="text-sm font-medium text-ink-2">社区还没有作品</p>
        <p className="mt-0.5 text-xs text-ink-3">生成并分享的作品会出现在这里</p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => router.push("/")}>
        去创作
      </Button>
    </div>
  );
}
