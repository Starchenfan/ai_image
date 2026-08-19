"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import type { GenerateTask } from "@/lib/types";

export interface CompareEntry {
  modelName: string;
  taskId: string;
}

/**
 * Renders N models side by side for the same prompt. Polls each task until
 * it completes or fails — no SSE, a simple parallel poll is enough for a
 * comparison board where latency is secondary to the side-by-side view.
 */
export function CompareBoard({
  entries,
  prompt,
}: {
  entries: CompareEntry[];
  prompt: string;
}) {
  const [tasks, setTasks] = useState<Record<string, GenerateTask>>({});
  const doneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    doneRef.current = new Set();
    const timers: ReturnType<typeof setInterval>[] = [];
    for (const e of entries) {
      const poll = async () => {
        if (doneRef.current.has(e.taskId)) return;
        try {
          const r = await fetch(`/api/tasks/${e.taskId}`);
          if (!r.ok) return;
          const d = (await r.json()) as { task: GenerateTask };
          setTasks((prev) => ({ ...prev, [e.taskId]: d.task }));
          if (d.task.status === "completed" || d.task.status === "failed") {
            doneRef.current.add(e.taskId);
          }
        } catch {
          /* ignore — retry next tick */
        }
      };
      poll();
      timers.push(setInterval(poll, 1000));
    }
    return () => timers.forEach((t) => clearInterval(t));
  }, [entries]);

  const allDone = entries.every((e) => {
    const t = tasks[e.taskId];
    return t && (t.status === "completed" || t.status === "failed");
  });

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">模型对比</h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{prompt}</p>
        </div>
        <span className="shrink-0 text-xs text-ink-3">{entries.length} 个模型</span>
      </div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        {entries.map((e) => {
          const t = tasks[e.taskId];
          const done = t && (t.status === "completed" || t.status === "failed");
          return (
            <div
              key={e.taskId}
              className="overflow-hidden rounded-lg border border-line bg-paper-2"
            >
              <div className="border-b border-line px-3 py-2">
                <div className="truncate text-xs font-medium text-ink">{e.modelName}</div>
                <div className="mt-0.5 text-[10px] text-ink-3">
                  {!t
                    ? "排队中…"
                    : done
                      ? t.status === "completed"
                        ? `完成 · ${(t.durationMs ?? 0) / 1000}s`
                        : "失败"
                      : `${t.stage} · ${t.progress}%`}
                </div>
              </div>
              <div className="relative aspect-square bg-paper-3">
                {!done ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    {t && (
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-paper-4">
                        <div
                          className="h-full bg-accent transition-[width] duration-500 ease-[var(--ease-out)]"
                          style={{ width: `${t.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : t.status === "failed" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3 text-center">
                    <AlertTriangle className="h-5 w-5 text-danger" />
                    <p className="line-clamp-4 text-[10px] leading-relaxed text-ink-3">
                      {t.errorMessage}
                    </p>
                  </div>
                ) : t.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.images[0].url}
                    alt={e.modelName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-ink-3">
                    无图片
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <p className="text-center text-xs text-ink-3">
          对比完成 — 满意结果会随任务一起写入历史
        </p>
      )}
    </div>
  );
}
