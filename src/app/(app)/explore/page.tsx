"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Heart, Copy, Images, TrendingUp } from "lucide-react";
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

// fetchExplore — 按分类拉取社区作品。后端同时返回当前可用的分类列表，
// 所以一次请求就把「数据」和「分类 chips」一起给前端，省一次 round-trip。
async function fetchExplore(cat: string) {
  const r = await fetch(`/api/explore?category=${encodeURIComponent(cat)}`);
  const data = (await r.json()) as { items: ExploreItem[]; categories: string[] };
  return data;
}

/** aspectToPadding — 把 "3:2" 这类宽高比换算成 CSS padding-top 百分比。
 *  用于图片外层容器的等比占位：padding-top=h/w*100%，让图片在栅格里按真实比例
 *  占位，避免瀑布流各列高度不一致时图片被拉伸变形。解析失败时退回 100%（正方形）。 */
function aspectToPadding(aspect: string): string {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return "100%";
  return `${(h / w) * 100}%`;
}

/**
 * ExplorePage — 社区探索页（/explore）。
 *
 * 它是「输入端」而非「生成端」：自己不发起任何生成，只做两件事——
 * 展示别人分享的作品，并提供「一键复用 Prompt」跳回工作台。
 *
 * 和其他页面的关系：它是工作台的灵感来源。用户在这里看到好图 → 点「复用 Prompt」
 * → store 写入 prompt → 跳回 / → 在工作台直接生成同款。所以它和 / 之间是
 * 「浏览 → 回炉」的闭环，数据流向是单向的（只写 store 的 prompt 字段）。
 *
 * 布局：顶栏标题 + 作品计数 → 横滑分类 chips → CSS 多列瀑布流。
 * 瀑布流用 columns 而非 grid，因为社区作品比例各异（3:2 / 2:3 / 1:1），
 * grid 会把每张图强制统一高度，要么留白要么裁切，columns 自然填充最接近原生瀑布流。
 */
export default function ExplorePage() {
  const router = useRouter();
  // 当前选中的分类，初始为「全部」。切换分类会重取数据，
  // chips 的选中态由 cat === c 控制，是典型的「受控组件 + 数据驱动」模式。
  const [cat, setCat] = useState("全部");
  // 本地 liked 集合：点赞是纯前端乐观状态，不回写后端（社区作品点赞暂未持久化）。
  // 用 Set 而不是数组，去重与翻转都是 O(1)。
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const set = useStudio((s) => s.set);

  // staleTime: 0 + refetchOnMount: always：切回此页时总是拿最新作品，
  // 因为社区内容更新快，用户期望看到「刚发的图」。
  const { data } = useQuery({
    queryKey: ["explore", cat],
    queryFn: () => fetchExplore(cat),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const items = data?.items ?? [];
  const categories = data?.categories ?? [];

  /**
   * toggleLike — 单张作品的点赞开关。
   *
   * 角色：纯本地状态管理，不调 API。它在流程里扮演「即时反馈」的角色——
   * 用户点爱心时不需要等服务器返回就能看到红色填充，交互感立刻建立。
   * 副作用：同时影响 hover 遮罩里的爱心图标（fill）和底部始终可见的 likes 计数
   * （+1），两处 UI 由同一个 liked 集合驱动，保证一致。
   */
  const toggleLike = (id: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /**
   * usePrompt — 「复用 Prompt」按钮的回调，社区 → 工作台的唯一通道。
   *
   * 角色：它做两件事——把 prompt 写进 store（让工作台参数轨自动带过来），
   * 然后 router.push("/") 回炉。副作用是跨页面写状态，所以依赖 zustand store
   * 而非组件参数，保证跳转后数据不丢。
   */
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
            <h1 className="font-display text-lg font-semibold text-ink">探索社区</h1>
            <p className="text-xs text-ink-3">发现精彩作品，一键复用 Prompt</p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit">
          <Images className="h-3 w-3 text-accent" />
          {items.length} 作品
        </Badge>
      </header>

      {/* 分类 chips — 横向可滚动的筛选栏。分类由后端随数据一起返回，
          前端不预设分类列表，所以「后端加了新分类，前端自动出现 chip」。
          移动端 -mx-4 + overflow-x-auto 让 chips 可横滑，避免小屏换行挤压；
          选中态用 accent 边框 + 底色高亮，未选中态是线框 + 灰字，切换成本低。 */}
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

      {/* 瀑布流（CSS 多列布局）— 用 columns 而非 grid，因为社区作品比例各异
          （3:2 / 2:3 / 1:1），grid 会把每张图强制统一高度，要么留白要么裁切；
          columns 让各列自然填充，最接近原生瀑布流。
          column-fill: balance 让首屏两列尽量等高，避免第一屏只渲半张图。
          每张卡片带 35ms 错开的 fade-up 入场，滚动时陆续出现，比一次性全亮柔和。 */}
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

              {/* hover 遮罩 — 默认 opacity-0，hover 时淡入。纵向两端对齐：
          顶部放点赞按钮，底部放 prompt 预览 + 「复用 Prompt」按钮。
          之所以把 prompt 预览也塞进 hover 遮罩，是因为瀑布流卡片高度不固定，
          如果 prompt 放在图片下方的固定区域，会把每张卡片撑成一样高，
          破坏瀑布流的自然错落感。底部渐变从黑往透明，保证浅色 prompt 在图上可读。 */}
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

              {/* 始终可见的 likes 计数 — 没 hover 时显示在右下角，hover 时随遮罩一起
          淡出（避免和遮罩上的点赞按钮抢视觉）。计数 = 后端 likes + 本地是否已赞，
          因为点赞是纯前端状态，不等后端刷新就能让用户看到 +1。 */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-ink backdrop-blur-sm group-hover:opacity-0">
                <Heart className="h-2.5 w-2.5" />
                {item.likes + (liked.has(item.id) ? 1 : 0)}
              </div>
            </div>

            {/* meta strip — 图片下方的固定信息行：左侧模型名（accent Badge），
          右侧作者 @handle。放在图片外而非 hover 遮罩里，是为了让这条信息
          「不依赖 hover 就能被看到」——用户不移动鼠标时也能知道这张图是谁生成的。
          truncate 防止长模型名/长用户名撑破列宽。 */}
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

/**
   * EmptyExplore — 社区页的零状态。当分类筛选后没有任何作品时展示。
   *
   * 和 EmptyState（工作台）是同一套空状态语言：图标 → 标题 → 说明 →
   * 一个行动按钮。按钮直接跳回 / 让用户去创作，形成「浏览发现空 → 立刻去生产」的闭环。
   */
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
