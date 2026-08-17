"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Compass, History, Settings, Wallet, Server } from "lucide-react";
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
  { href: "/", label: "创作", icon: Sparkles },
  { href: "/explore", label: "探索", icon: Compass },
  { href: "/history", label: "历史", icon: History },
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
    <header className="sticky top-0 z-40 w-full">
      <div className="mx-auto max-w-[1600px] px-4 pt-3">
        {/* N5 Floating pill — blur backdrop sells the atmospheric mood */}
        <nav className="glass flex h-12 items-center gap-1 rounded-full border border-line pr-2 pl-2 shadow-soft">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors hover:bg-paper-3"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-ink shadow-glow">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-ink sm:block">
              AI Image Studio
            </span>
          </Link>

          <div className="mx-1 h-5 w-px bg-line" />

          {/* Center links */}
          <div className="flex items-center gap-0.5">
            {LINKS.map((l) => {
              const active = pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href));
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-[background-color,color,transform] duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-95",
                    active
                      ? "bg-paper-4 text-ink"
                      : "text-ink-3 hover:bg-paper-3 hover:text-ink"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:block">{l.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right cluster — live service status + real credit balance */}
          <div className="ml-auto flex items-center gap-1.5">
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
            <div className="flex items-center gap-1.5 rounded-full bg-paper-3/60 px-2.5 py-1 text-xs">
              <Wallet className="h-3.5 w-3.5 text-accent" />
              <span className="font-mono font-medium text-ink">
                {credits ? credits.credits.toLocaleString() : "—"}
              </span>
              <span className="text-ink-3">Credits</span>
            </div>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent/80 to-accent text-xs font-semibold text-accent-ink transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] hover:scale-105 active:scale-95"
              aria-label="用户"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
