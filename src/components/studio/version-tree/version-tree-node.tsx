"use client";

import { memo, useRef, useState } from "react";
import { Maximize2, Plus, Image as ImageIcon, Loader2 } from "lucide-react";
import { Handle as FlowHandle, Position as FlowPosition, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/cn";
import type { VersionTreeFlowNode } from "./types";

function statusColor(status: VersionTreeFlowNode["data"]["item"]["status"]) {
  if (status === "completed") return "bg-ok";
  if (status === "failed") return "bg-danger";
  if (status === "processing" || status === "generating") return "bg-accent";
  return "bg-ink-3";
}

function statusLabel(status: VersionTreeFlowNode["data"]["item"]["status"]) {
  if (status === "completed") return "完成";
  if (status === "failed") return "失败";
  if (status === "queued") return "排队中";
  if (status === "processing") return "调用模型";
  if (status === "generating") return "生成中";
  return "已取消";
}

export const VersionTreeNode = memo(function VersionTreeNode({ data, selected }: NodeProps<VersionTreeFlowNode>) {
  const { item, actions } = data;
  const [broken, setBroken] = useState(false);
  const previewPointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const width = item.nodeWidth;
  const height = item.nodeHeight;
  // 节点最大只显示 240×320，且画布可缩放到 3x —— 向图片 API 请求 480px
  // 缩略图（服务端 sharp 缩放 + 缓存），而不是直接渲染全尺寸生成图。
  // 全尺寸原图只在点开预览时使用。外部 URL（非本服务图片 API）原样使用。
  const thumbnailUrl = item.imageUrl.startsWith("/api/images/")
    ? `${item.imageUrl}?w=480`
    : item.imageUrl;

  return (
    <div
      data-version-tree-node
      className={cn(
        "relative overflow-visible rounded-lg border bg-paper-2 shadow-xl",
        selected ? "border-accent shadow-accent/30" : "border-line"
      )}
      style={{ width, height }}
    >
      <FlowHandle
        type="target"
        position={FlowPosition.Left}
        className="!h-2 !w-2 !border-2 !border-paper-2 !bg-ink-3"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />
      <FlowHandle
        type="source"
        position={FlowPosition.Right}
        className="!h-2 !w-2 !border-2 !border-paper-2 !bg-ink-3"
        style={{ top: "50%", transform: "translateY(-50%)" }}
      />

      {item.imageUrl && !broken ? (
        <button
          type="button"
          className="relative block h-full w-full cursor-grab overflow-hidden rounded-lg border-0 p-0 active:cursor-grabbing"
          onPointerDown={(event) => {
            previewPointer.current = { x: event.clientX, y: event.clientY, moved: false };
          }}
          onPointerMove={(event) => {
            const start = previewPointer.current;
            if (!start || start.moved) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) {
              start.moved = true;
            }
          }}
          onPointerCancel={() => {
            previewPointer.current = null;
          }}
          onClick={(event) => {
            const pointer = previewPointer.current;
            previewPointer.current = null;
            if (pointer?.moved) {
              event.preventDefault();
              return;
            }
            actions.current.openPreview(item.imageUrl);
          }}
          aria-label="预览图片"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt={item.prompt}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setBroken(true)}
          />
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/40 p-1 text-white/80">
            <Maximize2 className="h-3 w-3" />
          </span>
        </button>
      ) : broken ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-ink-3 to-ink-2 p-2 text-center">
          <ImageIcon className="h-5 w-5 text-paper-3/50" />
          <span className="text-[10px] text-paper-3/70">图片链接已失效</span>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-ink-3 to-ink-2 p-2 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <span className="text-[10px] text-paper-3/70">{statusLabel(item.status)}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 rounded-b-lg bg-gradient-to-t from-black/90 via-black/45 to-transparent px-2 pb-2 pt-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10px] text-white/90">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor(item.status))} />
            <span className="truncate">{item.prompt}</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-white/60">
            <span className="truncate">{item.serviceName}</span>
            <span>·</span>
            <span>seed {item.seed}</span>
          </div>
        </div>
        {item.status === "completed" && (
          <button
            type="button"
            data-tree-branch
            className="nodrag nopan pointer-events-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform hover:scale-105"
            onClick={() => actions.current.openBranch(item.id)}
            title="在该节点上二次创作"
            aria-label="在该节点上二次创作"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
