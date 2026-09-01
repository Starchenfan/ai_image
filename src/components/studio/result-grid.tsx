"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import {
  Download,
  Maximize2,
  Star,
  Copy,
  Trash2,
  ImagePlus,
  Edit3,
} from "lucide-react";
import type { GeneratedImage, GenerateTask } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ImageViewer } from "./image-viewer";
import { Portal } from "@/components/ui/portal";

/**
 * 结果网格 — 工作台展示组件。
 *
 * 把任务生成的图片按 1 张单列 / 多张双列网格渲染。辅助操作（下载、放大、收藏、
 * 复制 Prompt、删除）走 hover 浮层，不常显；只有「二次创作」用主色胶囊按钮
 * 常驻在图片下方，一眼就能找到这个「无限画布」的一期入口 —— 点击后由父页面
 * 弹出 BranchModifyPanel，在该图基础上改 prompt / 取变体 / 图生图，
 * 产生一个带版本树链路的子任务。点击图片可进入全屏查看器（ImageViewer）。
 * 收藏状态仅本地记忆。
 *
 * 交互对象：
 *   - useStudio store（无直接依赖，纯展示）
 *   - 子组件 ImageViewer
 */

export function ResultGrid({
  task,
  onBranch,
  onEdit,
  onRemove,
}: {
  task: GenerateTask;
  /** 点击「二次创作」时的回调，由父页面决定如何处理（弹面板 / 跳转）。 */
  onBranch?: (task: GenerateTask, image: GeneratedImage) => void;
  /** 点击「编辑图片」时的回调，打开全屏图片编辑器。 */
  onEdit?: (task: GenerateTask, image: GeneratedImage) => void;
  /** 点击「删除」时的回调，由父页面负责清理历史与任务。 */
  onRemove?: (taskId: string) => void;
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
              ? "(100dvh - 13.5rem)" // 单图：给下方常驻的「二次创作」留出空间
              : "((100dvh - 13.5rem) / 2)";
          return (
          <div key={img.id} className="flex flex-col items-center gap-2">
            <figure
              className="group relative mx-auto overflow-hidden rounded-lg border border-line bg-paper-3 animate-fade-up"
              style={{
                aspectRatio: `${ratio}`,
                width: `min(100%, calc(${heightBudget} * ${ratio}))`,
                animationDelay: `${i * 60}ms`,
              }}
              onClick={() => setViewerIdx(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={task.request.prompt.slice(0, 60)}
                className="h-full w-full cursor-pointer object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-[1.03]"
              />

              {/* hover 浮层 —— 仅辅助操作（下载/放大/收藏/复制/删除），
                  二次创作不放这里，避免和其他按钮挤在一起 */}
              <figcaption className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/0 to-black/0 p-2 opacity-0 transition-opacity duration-[var(--dur-base)] ease-[var(--ease-out)] group-hover:opacity-100 pointer-events-none">
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
                      label={favSet.has(img.id) ? "取消收藏" : "收藏"}
                      active={favSet.has(img.id)}
                      onClick={() => toggleFav(img.id)}
                    />
                    <HoverAction icon={Copy} label="复制" onClick={copyPrompt} />
                  </div>
                  <div className="flex gap-1">
                    <HoverAction
                      icon={Trash2}
                      label="删除"
                      danger
                      onClick={() => onRemove?.(task.id)}
                    />
                  </div>
                </div>
              </figcaption>
            </figure>

            {/* 二次创作 —— 始终可见，放在图片下方，一眼就能找到入口。
                其他操作走上面的 hover 浮层，不挤在这里。 */}
            {onBranch && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onBranch(task, img); }}
                title="二次创作这张图"
                className="flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-white shadow-lg shadow-black/30 transition hover:bg-accent-2 hover:scale-[1.03]"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                二次创作
              </button>
            )}
            {/* 编辑图片 —— 打开全屏编辑器 */}
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(task, img); }}
                title="编辑这张图"
                className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-paper-2/90 px-3 text-xs font-medium text-ink backdrop-blur-sm transition hover:border-accent hover:text-accent"
              >
                <Edit3 className="h-3.5 w-3.5" />
                编辑
              </button>
            )}
          </div>
          );
        })}
      </div>

      {viewerIdx !== null && (
        <Portal>
          <ImageViewer
            images={task.images}
            index={viewerIdx}
            onClose={() => setViewerIdx(null)}
            onIndex={setViewerIdx}
            task={task}
          />
        </Portal>
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
        "flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-ink-2 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-ink pointer-events-auto",
        active && "text-accent",
        danger && "hover:text-danger"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
