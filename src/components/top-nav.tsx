"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Aperture,
  PenTool,
  Compass,
  History,
  Settings,
  Wallet,
  Server,
  User,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { AiService } from "@/lib/types";

async function fetchCredits() {
  const r = await fetch("/api/credits");
  return (await r.json()) as { credits: number; autoFailover: boolean };
}

async function fetchServices() {
  const r = await fetch("/api/services");
  return (await r.json()).services as AiService[];
}

const LINKS = [
  { href: "/", label: "创作", icon: PenTool },
  { href: "/explore", label: "探索", icon: Compass },
  { href: "/history", label: "历史", icon: History },
  { href: "/stats", label: "统计", icon: BarChart3 },
  { href: "/admin", label: "管理", icon: Settings },
];

export function TopNav() {
  const pathname = usePathname();
  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: fetchCredits,
    refetchInterval: 30000,
  });
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
    staleTime: 30_000,
  });

  const total = services?.length ?? 0;
  const online = services?.filter((s) => s.status === "online").length ?? 0;
  const allOnline = total > 0 && online === total;
  const noneOnline = total > 0 && online === 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4">
        {/* Wordmark — serif, editorial */}
        <Link
          href="/"
          className="mr-4 flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent text-accent-ink">
            <Aperture className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            绘界
          </span>
        </Link>

        {/* Center links — active underline */}
        <nav className="flex items-center">
          {LINKS.map((l) => {
            const active =
              pathname === l.href ||
              (l.href !== "/" && pathname.startsWith(l.href));
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative flex h-14 items-center gap-1.5 px-3 text-sm transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
                  active ? "font-medium text-ink" : "text-ink-3 hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:block">{l.label}</span>
                {active && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster — live service status + real credit balance */}
        <div className="ml-auto flex items-center gap-3">
          <Badge
            variant={noneOnline ? "danger" : allOnline ? "success" : "warning"}
            className="hidden gap-1 lg:flex"
            title={total ? `${online}/${total} 个服务在线` : "未接入服务"}
          >
            <Server className="h-3 w-3" />
            {total === 0
              ? "无服务"
              : allOnline
                ? `${online} 服务在线`
                : `${online}/${total} 在线`}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs">
            <Wallet className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono font-medium tabular-nums text-ink">
              {credits ? credits.credits.toLocaleString() : "—"}
            </span>
            <span className="text-ink-3">Credits</span>
          </div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-ink-3 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] hover:bg-paper-3 hover:text-ink active:translate-y-px"
            aria-label="用户"
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
