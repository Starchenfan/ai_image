"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkPlus, Trash2, X, Check } from "lucide-react";
import { useStudio } from "@/lib/store";
import { Input } from "@/components/ui/input";
import type { Preset } from "@/lib/types";

async function fetchPresets() {
  const r = await fetch("/api/presets");
  return (await r.json()).presets as Preset[];
}

export function PresetBar() {
  const qc = useQueryClient();
  const { data: presets = [] } = useQuery({
    queryKey: ["presets"],
    queryFn: fetchPresets,
  });

  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const applyPreset = useStudio((s) => s.applyPreset);
  const serviceId = useStudio((s) => s.serviceId);
  const modelId = useStudio((s) => s.modelId);
  const prompt = useStudio((s) => s.prompt);
  const negativePrompt = useStudio((s) => s.negativePrompt);
  const count = useStudio((s) => s.count);
  const aspectRatio = useStudio((s) => s.aspectRatio);
  const size = useStudio((s) => s.size);
  const seed = useStudio((s) => s.seed);
  const parameters = useStudio((s) => s.parameters);

  const save = useMutation({
    mutationFn: async () => {
      if (!serviceId || !modelId) throw new Error("请先选择服务和模型");
      const r = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          serviceId,
          modelId,
          prompt: prompt || undefined,
          negativePrompt: negativePrompt || undefined,
          count,
          aspectRatio,
          size,
          seed,
          parameters,
        }),
      });
      if (!r.ok) {
        const e = (await r.json()) as { error?: string };
        throw new Error(e.error || "保存失败");
      }
    },
    onSuccess: () => {
      setName("");
      setNaming(false);
      qc.invalidateQueries({ queryKey: ["presets"] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/presets/${id}`, { method: "DELETE" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["presets"] }),
  });

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ink-3 transition-colors hover:text-ink"
        >
          <Bookmark className="h-3.5 w-3.5" />
          配方{presets.length > 0 ? ` (${presets.length})` : ""}
        </button>
        <button
          onClick={() => setNaming((n) => !n)}
          disabled={!serviceId || !modelId}
          className="flex items-center gap-1 text-xs text-accent transition-colors hover:underline disabled:opacity-40"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          保存当前
        </button>
      </div>

      {naming && (
        <div className="flex items-center gap-1.5 animate-fade-in">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="配方名称，如「国风人像 16:9」"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) save.mutate();
            }}
          />
          <button
            onClick={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label="确认保存"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => setNaming(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink"
            aria-label="取消"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {save.isError && (
        <p className="px-1 text-[11px] text-danger">
          {(save.error as Error).message}
        </p>
      )}

      {open && (
        <div className="space-y-1.5 animate-fade-in">
          {presets.length === 0 ? (
            <p className="px-1 py-2 text-center text-xs text-ink-3">
              还没有配方。调好参数后点「保存当前」。
            </p>
          ) : (
            presets.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-2 rounded-md border border-line bg-paper-3/40 px-2.5 py-1.5 transition-colors hover:bg-paper-3"
              >
                <button
                  onClick={() => {
                    applyPreset(p);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-xs font-medium text-ink">
                    {p.name}
                  </div>
                  <div className="truncate font-mono text-[10px] text-ink-3">
                    {p.aspectRatio} · {p.size}
                    {p.prompt ? " · 含 Prompt" : ""}
                  </div>
                </button>
                <button
                  onClick={() => del.mutate(p.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 opacity-0 transition-opacity hover:bg-paper-4 hover:text-danger group-hover:opacity-100"
                  aria-label="删除配方"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
