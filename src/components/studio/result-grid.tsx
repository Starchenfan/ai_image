"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import {
  Download,
  Maximize2,
  Star,
  Copy,
  Trash2,
} from "lucide-react";
import type { GeneratedImage, GenerateTask } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ImageViewer } from "./image-viewer";
import { BranchModifyPanel, BranchAction } from "./branch-modify";

/**
 * 结果网格 — 工作台展示组件。
 *
 * 把任务生成的图片按 1 张单列 / 多张双列网格渲染，hover 时浮现
 * 下载、放大、收藏、复制 Prompt、继续修改、删除六个操作按钮，
 * 点击图片可进入全屏查看器（ImageViewer）。收藏状态仅本地记忆。
 *
 * 每张图的「继续修改」按钮会弹出 BranchModifyPanel：在该图基础上改 prompt /
 * 取变体 / 图生图，产生一个带版本树链路的子任务。这是「无限画布」功能的一期入口。
 *
 * 交互对象：
 *   - useStudio store（无直接依赖，纯展示）
 *   - 子组件 ImageViewer / BranchModifyPanel / BranchAction
 */

const HOVER_ACTIONS = [
  { icon: Download, label: "下载" },
  { icon: Maximize2, label: "放大" },
  { icon: Star, label: "收藏" },
  { icon: Copy, label: "复制 Prompt" },
] as const;

export function ResultGrid({
  task,
  onBranch,
}: {
  task: GenerateTask;
  /** 点击「继续修改」时的回调，由父页面决定如何处理（弹面板 / 跳转）。 */
  onBranch?: (task: GenerateTask, image: GeneratedImage) => void;
}) {
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [favSet, setFavSet] = useState<Set<string>>(new Set());

  if (task.images.length === 0) return null;

  const cols = task.images.length === 1 ? "grid-cols-1" : "grid-cols-2";

  const toggleFav = (id: string) => {
    setFavSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const download = async (img: GeneratedImage) => {
    // 用 fetch-as-blob 让跨域 OSS 地址真正下载成文件，而不是在标签页打开；
    // fetch 被拦截时退化为直接跳转 href。
    const ext = img.url.startsWith("data:") ? "png" : (img.url.split("?")[0].split(".").pop() || "png").toLowerCase();
    try {
      const res = await fetch(img.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `studio-${img.id}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      const a = document.createElement("a");
      a.href = img.url;
      a.download = `studio-${img.id}.${ext}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  };

  const copyPrompt = () => {
    void navigator.clipboard.writeText(task.request.prompt);
  };

  return (
    <>
      <div className={cn("grid gap-3", cols)}>
        {task.images.map((img, i) => {
          // 让图片完整塞进可视区：盒子宽度取「网格列宽」与
          // （可视区高度预算 × 宽高比）的较小值，这样高图/大图会缩小，
          // 而不是撑动画布导致滚动。aspect-ratio 保持原始比例。
          const ratio = img.width && img.height ? img.width / img.height : 1;
          const heightBudget =
            task.images.length === 1
              ? "(100dvh - 12rem)"
              : "((100dvh - 13.5rem) / 2)";
          return (
          <figure
            key={img.id}
            className="group relative mx-auto overflow-hidden rounded-lg border border-line bg-paper-3 animate-fade-up"
            style={{
              aspectRatio: `${ratio}`,
              width: `min(100%, calc(${heightBudget} * ${ratio}))`,
              animationDelay: `${i * 60}ms`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={task.request.prompt.slice(0, 60)}
              className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]"
            />

            {/* hover overlay */}
            <figcaption className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/0 to-black/0 p-2 opacity-0 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:opacity-100">
              <div className="flex justify-end">
                {favSet.has(img.id) && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-accent backdrop-blur-sm">
                    <Star className="h-3.5 w-3.5 fill-accent" />
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <HoverAction
                    icon={Download}
                    label="下载"
                    onClick={() => download(img)}
                  />
                  <HoverAction
                    icon={Maximize2}
                    label="放大"
                    onClick={() => setViewerIdx(i)}
                  />
                  <HoverAction
                    icon={Star}
                    label="收藏"
                    active={favSet.has(img.id)}
                    onClick={() => toggleFav(img.id)}
                  />
                  <HoverAction icon={Copy} label="复制" onClick={copyPrompt} />
                </div>
                <div className="flex gap-1">
                  {onBranch && (
                    <BranchAction
                      task={task}
                      image={img}
                      onBranch={onBranch}
                    />
                  )}
                  <HoverAction icon={Trash2} label="删除" danger />
                </div>
              </div>
            </figcaption>
          </figure>
          );
        })}
      </div>

      {viewerIdx !== null && (
        <ImageViewer
          images={task.images}
          index={viewerIdx}
          onClose={() => setViewerIdx(null)}
          onIndex={setViewerIdx}
          task={task}
        />
      )}
    </>
  );
}

function HoverAction({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
}: {
  icon: typeof Download;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-ink-2 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-ink",
        active && "text-accent",
        danger && "hover:text-danger"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
