"use client";

import { useEffect, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react";
import type { GenerateTask, GeneratedImage } from "@/lib/types";
import { cn } from "@/lib/cn";

export function ImageViewer({
  images,
  index,
  onClose,
  onIndex,
  task,
}: {
  images: GeneratedImage[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  task: GenerateTask;
}) {
  const [zoomed, setZoomed] = useState(false);
  const img = images[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < images.length - 1)
        onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndex]);

  if (!img) return null;

  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < images.length - 1 && onIndex(index + 1);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      {/* top bar */}
      <div
        className="flex items-center justify-between p-4 text-ink-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-ink">{task.model?.displayName}</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-3">
            {index + 1} / {images.length}
          </span>
          <span className="text-ink-3">·</span>
          <span className="font-mono text-ink-3">
            {img.width}×{img.height}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ViewerBtn icon={zoomed ? ZoomOut : ZoomIn} onClick={() => setZoomed((z) => !z)} />
          <ViewerBtn icon={Maximize} onClick={() => setZoomed(true)} />
          <ViewerBtn
            icon={Download}
            onClick={async () => {
              const ext = img.url.startsWith("data:")
                ? "png"
                : (img.url.split("?")[0].split(".").pop() || "png").toLowerCase();
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
            }}
          />
          <ViewerBtn
            icon={Copy}
            onClick={() => void navigator.clipboard.writeText(task.request.prompt)}
          />
          <ViewerBtn icon={X} onClick={onClose} />
        </div>
      </div>

      {/* image area */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-16"
        onClick={onClose}
      >
        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-ink transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt={task.request.prompt.slice(0, 60)}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "max-h-full max-w-full rounded-lg object-contain shadow-lift transition-transform duration-300 ease-[var(--ease-out)]",
            zoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
          )}
        />
        {index < images.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-ink transition-colors hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* prompt + params */}
      <div
        className="border-t border-white/10 p-4 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto max-w-4xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-ink-3">Prompt</span>
            <p className="line-clamp-2 text-ink-2">{task.request.prompt}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-ink-3">
            <span>模型: {task.model?.displayName}</span>
            <span>服务: {task.service?.name}</span>
            <span>
              尺寸: {task.request.size}
            </span>
            <span>比例: {task.request.aspectRatio}</span>
            <span>Seed: {img.seed}</span>
            {Object.entries(task.request.parameters).map(([k, v]) => (
              <span key={k}>
                {k}: {String(v)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewerBtn({
  icon: Icon,
  onClick,
}: {
  icon: typeof X;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-white/10 hover:text-ink"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
