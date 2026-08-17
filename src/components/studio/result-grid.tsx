"use client";

import { useState } from "react";
import { useStudio } from "@/lib/store";
import {
  Download,
  Maximize2,
  Star,
  Copy,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { GeneratedImage, GenerateTask } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ImageViewer } from "./image-viewer";

const HOVER_ACTIONS = [
  { icon: Download, label: "下载" },
  { icon: Maximize2, label: "放大" },
  { icon: Star, label: "收藏" },
  { icon: Copy, label: "复制 Prompt" },
  { icon: RefreshCw, label: "重新生成" },
  { icon: Trash2, label: "删除" },
] as const;

export function ResultGrid({ task }: { task: GenerateTask }) {
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
    // Fetch as blob so cross-origin OSS URLs download as a real file rather
    // than opening in a tab; falls back to direct href if fetch is blocked.
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
        {task.images.map((img, i) => (
          <figure
            key={img.id}
            className="group relative overflow-hidden rounded-lg border border-line bg-paper-3 animate-fade-up"
            // Use the provider's real aspect ratio so the box doesn't snap
            // from square to wide when the image decodes. Falls back to
            // square when dimensions are absent.
            style={{
              aspectRatio: img.width && img.height ? `${img.width} / ${img.height}` : "1 / 1",
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
                  <HoverAction icon={RefreshCw} label="重新生成" />
                  <HoverAction icon={Trash2} label="删除" danger />
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
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
