"use client";

import { useEffect } from "react";
import { useStudio } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Star, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { AiService } from "@/lib/types";

async function fetchServices() {
  const r = await fetch("/api/services");
  return (await r.json()).services as AiService[];
}

const STATUS_DOT: Record<string, string> = {
  online: "bg-ok",
  offline: "bg-ink-3",
  degraded: "bg-warn",
  rate_limited: "bg-warn",
  maintenance: "bg-ink-3",
};
const STATUS_LABEL: Record<string, string> = {
  online: "在线",
  offline: "离线",
  degraded: "异常",
  rate_limited: "限流",
  maintenance: "维护",
};

export function ServiceSelect() {
  const serviceId = useStudio((s) => s.serviceId);
  const set = useStudio((s) => s.set);
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: fetchServices });

  // pick first recommended/online service by default
  useEffect(() => {
    if (!serviceId && services?.length) {
      const rec =
        services.find((s) => s.recommended && s.status === "online") ??
        services.find((s) => s.status === "online") ??
        services[0];
      set("serviceId", rec.id);
    }
  }, [serviceId, services, set]);

  const current = services?.find((s) => s.id === serviceId);
  if (!current || !services) return <SectionShell label="AI 服务" />;

  if (services.length === 0) {
    return (
      <SectionShell label="AI 服务">
        <div className="rounded-md border border-dashed border-line bg-paper-3/30 p-3 text-center">
          <p className="text-xs text-ink-3">尚未接入任何服务</p>
          <a
            href="/admin"
            className="mt-1.5 inline-block text-xs font-medium text-accent hover:underline"
          >
            去管理后台添加 →
          </a>
        </div>
      </SectionShell>
    );
  }

  const alternates = services.filter((s) => s.id !== current.id);

  return (
    <SectionShell label="AI 服务">
      <div className="group rounded-md border border-line bg-paper-3/40 p-2.5 transition-[background-color,border-color] duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-paper-3 hover:border-[color:var(--color-line)]">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[current.status])} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{current.name}</span>
              {current.recommended && (
                <Star className="h-3 w-3 fill-accent text-accent" />
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
              <span>{STATUS_LABEL[current.status]}</span>
              <span>·</span>
              <span className="font-mono">{(current.latencyMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
          {current.tags?.[0] && <Badge variant="accent">{current.tags[0]}</Badge>}
        </div>
      </div>

      {alternates.length > 0 && (
        <details className="group mt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-1 text-xs text-ink-3 transition-colors hover:text-ink-2">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            切换服务 ({alternates.length})
          </summary>
          <div className="mt-1.5 space-y-1">
            {alternates.map((s) => (
              <button
                key={s.id}
                onClick={() => set("serviceId", s.id)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-left transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-line hover:bg-paper-3 active:scale-[0.98]"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s.status])} />
                <span className="flex-1 truncate text-sm text-ink-2">{s.name}</span>
                <span className="font-mono text-xs text-ink-3">
                  {(s.latencyMs / 1000).toFixed(1)}s
                </span>
              </button>
            ))}
          </div>
        </details>
      )}

      <div className="mt-2 flex items-center gap-1.5 px-1 text-xs text-ink-3">
        <Zap className="h-3 w-3 text-accent" />
        自动故障转移已开启
      </div>
    </SectionShell>
  );
}

function SectionShell({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-ink-3">{label}</h3>
      {children}
    </section>
  );
}
