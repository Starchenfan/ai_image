"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
import type { GenerateTask } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

const STAGES = ["queued", "processing", "generating", "completed"] as const;

function stageIndex(status: GenerateTask["status"]) {
  const i = STAGES.indexOf(status as (typeof STAGES)[number]);
  if (status === "failed") return 2;
  if (status === "canceled") return 0;
  return i === -1 ? 0 : i;
}

/**
 * Synthesize a failed task when the real one has vanished from the store
 * (e.g. dev server restarted mid-task, bad id). Lets the UI unblock instead of
 * spinning forever on a task id that no longer exists.
 */
function syntheticFailedTask(taskId: string): GenerateTask {
  return {
    id: taskId,
    status: "failed",
    progress: 0,
    stage: "任务丢失",
    request: {} as GenerateTask["request"],
    images: [],
    errorMessage: "任务不存在或已过期（服务可能重启过），请重新生成。",
    costCredits: 0,
    createdAt: Date.now(),
  };
}

/**
 * Subscribes to a task via SSE (preferred), polls as fallback.
 * Exposes progress bar, stage label, failure UI with retry/switch options.
 */
export function TaskStatus({
  taskId,
  onDone,
  onRetry,
  onSwitchService,
}: {
  taskId: string;
  onDone: (task: GenerateTask) => void;
  onRetry: () => void;
  onSwitchService: () => void;
}) {
  const [task, setTask] = useState<GenerateTask | null>(null);
  const [usingSse, setUsingSse] = useState(true);
  const done = useRef(false);

  useEffect(() => {
    if (!taskId) return;
    done.current = false;

    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };

    const poll = async () => {
      try {
        const r = await fetch(`/api/tasks/${taskId}`);
        if (r.status === 404) {
          // Task vanished (server restarted, bad id, etc.) — unblock the UI.
          const t = syntheticFailedTask(taskId);
          setTask(t);
          if (!done.current) {
            done.current = true;
            onDone(t);
            cleanup();
          }
          return;
        }
        const data = (await r.json()) as { task: GenerateTask };
        setTask(data.task);
        if (
          (data.task.status === "completed" || data.task.status === "failed") &&
          !done.current
        ) {
          done.current = true;
          onDone(data.task);
          cleanup();
        }
      } catch {
        /* swallow — will retry next tick */
      }
    };

    try {
      es = new EventSource(`/api/tasks/${taskId}/stream`);
      es.onmessage = (ev) => {
        try {
          const t = JSON.parse(ev.data) as GenerateTask;
          // Stream may emit {error:"not found"} when task is gone.
          if (t && !("id" in t) && !Array.isArray(t)) {
            throw new Error("not found");
          }
          setTask(t);
          if (
            (t.status === "completed" || t.status === "failed") &&
            !done.current
          ) {
            done.current = true;
            onDone(t);
            cleanup();
          }
        } catch {
          // Payload wasn't a task (likely the error event) — fall back to poll.
          setUsingSse(false);
          es?.close();
          es = null;
          if (!pollTimer && !done.current) {
            poll();
            pollTimer = setInterval(poll, 800);
          }
        }
      };
      es.onerror = () => {
        // SSE failed — fall back to polling
        setUsingSse(false);
        es?.close();
        es = null;
        if (!pollTimer && !done.current) {
          poll();
          pollTimer = setInterval(poll, 800);
        }
      };
    } catch {
      setUsingSse(false);
      poll();
      pollTimer = setInterval(poll, 800);
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-ink-3">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <p className="text-sm">初始化任务…</p>
      </div>
    );
  }

  if (task.status === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-20 text-center animate-fade-in">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/15">
          <AlertTriangle className="h-6 w-6 text-danger" />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">生成失败</p>
          <p className="mt-1 max-w-sm text-xs text-ink-3">{task.errorMessage}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRetry} size="sm">
            <RefreshCw className="h-3.5 w-3.5" />
            重新生成
          </Button>
          <Button onClick={onSwitchService} variant="secondary" size="sm">
            切换服务
          </Button>
        </div>
      </div>
    );
  }

  if (task.status === "completed") return null;

  const idx = stageIndex(task.status);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-16 animate-fade-in">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-paper-2">
        <Loader2 className="h-7 w-7 animate-spin text-accent" />
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-ink">正在生成</p>
        <p className="mt-0.5 text-xs text-ink-3">{task.model?.displayName}</p>
      </div>

      {/* progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-4">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out)]"
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-ink-3">
          <span>{task.stage}</span>
          <span className="font-mono">{task.progress}%</span>
        </div>
      </div>

      {/* stage stepper */}
      <div className="flex items-center gap-1.5">
        {STAGES.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] transition-colors",
                i <= idx
                  ? "bg-accent/15 text-accent"
                  : "bg-paper-3 text-ink-3"
              )}
            >
              {i < idx ? (
                <CheckCircle2 className="h-2.5 w-2.5" />
              ) : i === idx ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
              )}
              {s}
            </div>
            {i < STAGES.length - 1 && (
              <span className="h-px w-3 bg-line" />
            )}
          </div>
        ))}
      </div>

      <p className="font-mono text-[10px] text-ink-3">
        {usingSse ? "SSE 实时流" : "轮询中"} · {task.id}
      </p>
    </div>
  );
}
