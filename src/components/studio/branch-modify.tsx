"use client";

import { useState } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { useStudio } from "@/lib/store";
import type { GenerateTask, GeneratedImage } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * 分支修改面板 — 在某张已生成图的基础上「二次创作」。
 *
 * 三种模式对应三种「怎么改」：
 *   - 改 prompt：保留原 prompt，把用户写的修改指令拼在后面，重新生成
 *   - 变体：prompt 不变，seed 重新随机，得到一张「同prompt不同结果」
 *   - 图生图：把父图当参考图传给 adapter，真正以图生图
 *
 * 选中某张图点「二次创作」后弹出。提交后交回给父页面切到轮询态，
 * 链路（parentTaskId / branchId / rootImageId）由服务端写进新任务。
 */
export function BranchModifyPanel({
  task,
  image,
  onClose,
  onStarted,
}: {
  task: GenerateTask;
  image: GeneratedImage;
  onClose: () => void;
  onStarted: (taskId: string) => void;
}) {
  const [delta, setDelta] = useState("");
  const [mode, setMode] = useState<"reprompt" | "variant" | "edit">("reprompt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    // 变体模式不需要用户写指令；另外两种必须写点东西，否则分支出来跟父图一模一样。
    if (mode !== "variant" && !delta.trim()) {
      setError("请写下修改指令，否则生成结果与原图相同");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/tasks/${task.id}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentTaskId: task.id,
          parentImageId: image.id,
          editMode: mode,
          promptDelta: delta.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const err = (await r.json()) as { error?: string };
        throw new Error(err.error || `请求失败 (${r.status})`);
      }
      const data = (await r.json()) as { task: { id: string } };
      onStarted(data.task.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const modes: Array<{
    id: typeof mode;
    label: string;
    hint: string;
    needInput: boolean;
  }> = [
    {
      id: "reprompt",
      label: "改 prompt",
      hint: "保留原 prompt，拼接你的修改指令后重新生成",
      needInput: true,
    },
    {
      id: "variant",
      label: "变体",
      hint: "prompt 不变，重新随机 seed，得到一张不同的图",
      needInput: false,
    },
    {
      id: "edit",
      label: "图生图",
      hint: "以这张图为参考，按修改指令生成新图",
      needInput: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-paper-2 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-accent" />
            <span className="text-sm font-medium text-ink">二次创作</span>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 父图缩略图 */}
        <div className="flex gap-3 border-b border-line p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt="父图"
            className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-ink-3">
              在这张图的基础上继续创作
            </p>
            <p className="line-clamp-2 text-xs text-ink-2">
              {task.request.prompt}
            </p>
            {image.seed !== undefined && image.seed !== -1 && (
              <p className="text-[10px] text-ink-3">seed {image.seed}</p>
            )}
          </div>
        </div>

        {/* 模式切换 */}
        <div className="p-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-3">
            修改方式
          </p>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-line bg-paper-3/40 p-1">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded px-2 py-1.5 text-xs font-medium transition-colors",
                  mode === m.id
                    ? "bg-accent text-accent-ink"
                    : "text-ink-3 hover:text-ink"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-ink-3">
            {modes.find((m) => m.id === mode)?.hint}
          </p>
        </div>

        {/* 修改指令 */}
        {modes.find((m) => m.id === mode)?.needInput && (
          <div className="px-4 pb-4">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink-3">
              修改指令
            </label>
            <textarea
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder={
                mode === "edit"
                  ? "例如：把背景换成星空，人物保持不变"
                  : "例如：让画面更明亮、加一朵云"
              }
              rows={3}
              className="w-full resize-none rounded-md border border-line bg-paper-3/40 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent/60"
            />
          </div>
        )}

        {/* 底部 */}
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          {error ? (
            <p className="min-w-0 flex-1 truncate text-xs text-danger">{error}</p>
          ) : (
            <span className="text-[10px] text-ink-3">
              {mode === "edit" ? "以原图为参考生成" : "继承原模型与参数"}
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:bg-paper-3"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              {busy ? "提交中…" : "生成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}