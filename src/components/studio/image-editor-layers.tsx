"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Unlock, Trash2, Edit3, GripVertical, Plus, Layers as LayersIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Layer {
  id: string;
  name: string;
  type: "image" | "brush" | "shape" | "text" | "mask";
  visible: boolean;
  locked: boolean;
  order: number;
}

interface Props {
  layers: Layer[];
  onChange: (layers: Layer[]) => void;
}

export function ImageEditorLayers({ layers, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const sorted = [...layers].sort((a, b) => a.order - b.order);

  const toggleVisible = (id: string) => {
    onChange(layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const toggleLocked = (id: string) => {
    onChange(layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
  };

  const deleteLayer = (id: string) => {
    onChange(layers.filter((l) => l.id !== id));
  };

  const renameLayer = (id: string) => {
    if (editName.trim()) {
      onChange(layers.map((l) => (l.id === id ? { ...l, name: editName.trim() } : l)));
    }
    setEditingId(null);
    setEditName("");
  };

  const reorderLayer = (id: string, direction: "up" | "down") => {
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const newLayers = [...sorted];
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= newLayers.length) return;
    [newLayers[idx], newLayers[target]] = [newLayers[target], newLayers[idx]];
    newLayers[idx].order = idx;
    newLayers[target].order = target;
    onChange(newLayers);
  };

  const typeLabel = (t: Layer["type"]) => {
    switch (t) {
      case "image": return "背景";
      case "brush": return "画笔";
      case "shape": return "形状";
      case "text": return "文字";
      case "mask": return "蒙版";
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink">图层列表</span>
        <span className="text-[10px] text-ink-3">{layers.length} 层</span>
      </div>

      {layers.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <LayersIcon className="h-6 w-6 text-ink-3/50" />
          <span className="text-[10px] text-ink-3">暂无图层</span>
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((layer) => (
            <div
              key={layer.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-md border border-line bg-paper-2 px-2 py-1.5 transition-all",
                !layer.visible && "opacity-50"
              )}
            >
              <GripVertical className="h-3 w-3 cursor-grab text-ink-3/50" />

              <button
                type="button"
                onClick={() => toggleVisible(layer.id)}
                className="flex h-5 w-5 items-center justify-center rounded text-ink-3 hover:bg-paper-4 hover:text-ink"
                title={layer.visible ? "隐藏" : "显示"}
              >
                {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>

              <button
                type="button"
                onClick={() => toggleLocked(layer.id)}
                disabled={layer.type === "image"}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded transition-all",
                  layer.locked
                    ? "text-accent"
                    : "text-ink-3 hover:bg-paper-4 hover:text-ink",
                  layer.type === "image" && "cursor-not-allowed opacity-50"
                )}
                title={layer.locked ? "解锁" : "锁定"}
              >
                {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              </button>

              <div className="flex min-w-0 flex-1 flex-col">
                {editingId === layer.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => renameLayer(layer.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameLayer(layer.id);
                      if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                    }}
                    autoFocus
                    className="w-full rounded border border-accent bg-transparent px-1 text-xs text-ink outline-none"
                  />
                ) : (
                  <span className="truncate text-xs text-ink">
                    {layer.name}
                    <span className="ml-1 text-[10px] text-ink-3">· {typeLabel(layer.type)}</span>
                  </span>
                )}
              </div>

              <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => { setEditingId(layer.id); setEditName(layer.name); }}
                  className="flex h-5 w-5 items-center justify-center rounded text-ink-3 hover:bg-paper-4 hover:text-ink"
                  title="重命名"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteLayer(layer.id)}
                  disabled={layer.type === "image"}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded transition-all",
                    layer.type === "image"
                      ? "cursor-not-allowed text-ink-3/50"
                      : "text-danger opacity-0 group-hover:opacity-100 hover:bg-danger/10"
                  )}
                  title="删除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}