"use client";

import { useMemo } from "react";
import { Edit, Image, RefreshCw, X, Loader2 } from "lucide-react";
import type { BranchMode } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { BranchDraft, VersionTreeItem } from "./types";

type BranchPanelProps = {
  item: VersionTreeItem;
  draft: BranchDraft;
  busy: boolean;
  error: string | null;
  left: number;
  top: number;
  onDraftChange: (draft: BranchDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

const modes: Array<{
  value: BranchMode;
  label: string;
  hint: string;
  icon: typeof Edit;
}> = [
  {
    value: "reprompt",
    label: "改 prompt",
    hint: "保留原 prompt，追加你的修改指令",
    icon: Edit,
  },
  {
    value: "variant",
    label: "变体",
    hint: "prompt 不变，重新随机生成一个版本",
    icon: RefreshCw,
  },
  {
    value: "edit",
    label: "图生图",
    hint: "把原图作为参考图继续修改",
    icon: Image,
  },
];

export function BranchPanel({
  item,
  draft,
  busy,
  error,
  left,
  top,
  onDraftChange,
  onCancel,
  onSubmit,
}: BranchPanelProps) {
  const submitKey = useMemo(
    () => (typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl"),
    []
  );

  return (
    <div
      data-branch-card
      className="absolute z-20 w-[min(360px,calc(100vw-24px))] rounded-xl border border-line bg-paper-2 p-4 shadow-2xl"
      style={{ left, top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-3 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-line"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-2">二次创作这张图</p>
          <p className="truncate text-[10px] text-ink-3">
            {item.serviceName} · seed {item.seed}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="nodrag nopan ml-auto rounded-md p-1 text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink"
          title="关闭"
          aria-label="关闭二次创作面板"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex rounded-md border border-line bg-paper-3/40 p-0.5 text-xs">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.value}
              type="button"
              className={cn(
                "nodrag nopan flex flex-1 items-center justify-center gap-1 rounded py-1.5 transition-colors",
                draft.mode === mode.value
                  ? "bg-paper-2 text-accent shadow-sm"
                  : "text-ink-3 hover:text-ink"
              )}
              onClick={() => onDraftChange({ ...draft, mode: mode.value })}
              title={mode.hint}
            >
              <Icon className="h-3 w-3" />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>

      {draft.mode !== "variant" && (
        <textarea
          value={draft.promptDelta}
          onChange={(event) => onDraftChange({ ...draft, promptDelta: event.target.value })}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSubmit();
          }}
          placeholder={
            draft.mode === "edit"
              ? "描述要怎么改这张图…（如：换成雨天的街景）"
              : "描述要怎么改…（如：加上一顶帽子）"
          }
          rows={3}
          autoFocus
          className="nodrag nopan w-full resize-none rounded-md border border-line bg-paper-3/40 px-3 py-2 text-sm text-ink-2 outline-none focus:border-accent"
        />
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-3">
          <kbd className="rounded bg-paper-3 px-1 py-0.5 font-mono">{submitKey}</kbd>+Enter 提交
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="nodrag nopan rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:bg-paper-3"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="nodrag nopan flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {busy ? "生成中…" : "生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
