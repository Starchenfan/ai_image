"use client";

import { memo } from "react";
import {
  MousePointer,
  Crop,
  Brush,
  Eraser,
  Type,
  Square,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type DrawTool =
  | "select"
  | "crop"
  | "brush"
  | "eraser"
  | "text"
  | "shape"
  | "ai";

export type FilterPresetKey =
  | "none"
  | "grayscale"
  | "sepia"
  | "vintage"
  | "film"
  | "cool"
  | "warm";

interface ToolbarProps {
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFlipX: () => void;
  onFlipY: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const TOOLS: Array<{ id: DrawTool; icon: React.ReactNode; label: string }> = [
  { id: "select", icon: <MousePointer className="h-4 w-4" />, label: "选择" },
  { id: "crop", icon: <Crop className="h-4 w-4" />, label: "裁剪" },
  { id: "brush", icon: <Brush className="h-4 w-4" />, label: "画笔" },
  { id: "eraser", icon: <Eraser className="h-4 w-4" />, label: "橡皮擦" },
  { id: "text", icon: <Type className="h-4 w-4" />, label: "文字" },
  { id: "shape", icon: <Square className="h-4 w-4" />, label: "形状" },
];

export const Toolbar = memo(function Toolbar({
  tool,
  onToolChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFlipX,
  onFlipY,
  onRotateLeft,
  onRotateRight,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ToolbarProps) {
  return (
    <div className="flex w-14 flex-col items-center gap-0.5 rounded-lg border border-line bg-paper-2/90 p-1 backdrop-blur-sm">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onToolChange(t.id)}
          title={t.label}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-all",
            tool === t.id
              ? "bg-accent text-accent-ink"
              : "text-ink-3 hover:bg-paper-4 hover:text-ink"
          )}
        >
          {t.icon}
        </button>
      ))}

      <div className="mx-0.5 h-5 w-px bg-line" />

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="撤销 (Ctrl+Z)"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-all",
          canUndo ? "text-ink-2 hover:bg-paper-4 hover:text-ink" : "cursor-not-allowed text-ink-3/50"
        )}
      >
        <Undo className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="重做 (Ctrl+Y)"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-all",
          canRedo ? "text-ink-2 hover:bg-paper-4 hover:text-ink" : "cursor-not-allowed text-ink-3/50"
        )}
      >
        <Redo className="h-4 w-4" />
      </button>

      <div className="mx-0.5 h-5 w-px bg-line" />

      <button
        type="button"
        onClick={onZoomIn}
        title="放大 (Ctrl++)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title="缩小 (Ctrl+-)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onResetView}
        title="重置视图 (Ctrl+0)"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      <div className="mx-0.5 h-5 w-px bg-line" />

      <button
        type="button"
        onClick={onFlipX}
        title="水平翻转"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <FlipHorizontal className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onFlipY}
        title="垂直翻转"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <FlipVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onRotateLeft}
        title="逆时针旋转 90°"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onRotateRight}
        title="顺时针旋转 90°"
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
      >
        <RotateCw className="h-4 w-4" />
      </button>
    </div>
  );
});