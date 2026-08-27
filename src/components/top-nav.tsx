"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
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

// fetchCredits — 拉取当前账号的 Credits 余额与是否开启自动故障转移。
// 余额数字直接 Driving 顶栏展示，30s 轮询一次以保证「实时感」。
async function fetchCredits() {
  const r = await fetch("/api/credits");
  return (await r.json()) as { credits: number; autoFailover: boolean };
}

// fetchServices — 拉取全部已接入服务的在线状态。
// staleTime 30s：服务状态变化慢，短间隔轮询只会浪费带宽与触发无意义重渲染。
async function fetchServices() {
  const r = await fetch("/api/services");
  return (await r.json()).services as AiService[];
}

// 导航项清单。顺序即用户心智模型：先创作，再浏览社区，最后是历史/统计/管理。
// label 使用中文，只在 <md 屏幕隐藏文字、只留图标，避免小屏拥挤。
const LINKS = [
  { href: "/", label: "创作", icon: PenTool },
  { href: "/explore", label: "探索", icon: Compass },
  { href: "/history", label: "历史", icon: History },
  { href: "/stats", label: "统计", icon: BarChart3 },
  { href: "/admin", label: "管理", icon: Settings },
];

/**
 * TopNav — 全局顶栏，跨页面共享的外壳组件。
 *
 * 它不是页面，而是「骨架」的一部分：无论用户在 /、/explore 还是 /admin，
 * 顶栏都常驻，承担三件事：
 *   1. 页面间跳转（中间的五个入口）；
 *   2. 实时服务健康状态——让用户在开跑生成前就知道哪些服务可用；
 *   3. 真实 Credits 余额——生成前就能看到还剩多少额度。
 *
 * 之所以把这三项放在顶栏而不是各自页面里，是因为它们是「全局上下文」：
 * 用户在任何一页都有可能决定「换服务」或「确认余额」，放在最高层就无需每页重复。
 */
export function TopNav() {
  const pathname = usePathname();
  // Credits 余额：30s 轮询。余额在生成后会变，但用户很少盯着看，
  // 30s 足够在点击生成前刷新到最新值，又不至于拖垮移动端信号。
  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: fetchCredits,
    refetchInterval: 30000,
  });
  // 服务列表：staleTime 30s，与顶栏 Badge 的用途一致——
  // 只有真正在线数变化时才需要更新，避免每次 focus/refetch 都重排。
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
    staleTime: 30_000,
  });

  // 服务健康度的三种分类，用于 Badge 的变体与文案：
  //   allOnline  → 全部在线，绿色 success
  //   noneOnline  → 全部掉线，红色 danger，提示用户别点生成
  //   部分在线     → 黄色 warning，显示「x/总数 在线」
  const total = services?.length ?? 0;
  const online = services?.filter((s) => s.status === "online").length ?? 0;
  const allOnline = total > 0 && online === total;
  const noneOnline = total > 0 && online === 0;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4">
        {/* Wordmark — 衬线字标， editorial 风格。点击即回工作台首页 */}
        <Link
          href="/"
          className="mr-4 flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <img src="/image/logo.svg" alt="绘界" className="h-7 w-7 rounded-sm" />
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            绘界
          </span>
        </Link>

        {/* 中央导航 — 选中项底部有 accent 下划线，hover 时文字变深。
            active 判定同时匹配精确路径与前缀路径，使得 /admin/services/123
            也能高亮「管理」项（因为 /admin 是它的前缀）。 */}
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

        {/* 右侧信息簇 — 「全局上下文」的另外两块：
            服务健康 Badge（仅 lg 以上屏显示，移动端省空间）+ 实时余额 + 用户入口。
            Badge 的 variant 根据 allOnline / noneOnline / 部分在线 三态切换，
            颜色本身就已经传达了「能不能点生成」，title 再补一行精确数字。 */}
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
          {/* Credits 余额：tabular-nums 让数字等宽，轮询刷新时不会跳动列宽 */}
          <div className="flex items-center gap-1.5 text-xs">
            <Wallet className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono font-medium tabular-nums text-ink">
              {credits ? credits.credits.toLocaleString() : "—"}
            </span>
            <span className="text-ink-3">Credits</span>
          </div>
          {/* 用户入口 — 目前为占位，点击仅 hover 反馈，未接认证流程 */}
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
