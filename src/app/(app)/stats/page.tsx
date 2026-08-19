"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ImageIcon, Coins, Timer, Activity, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

interface ModelStat {
  name: string;
  count: number;
  credits: number;
  avgDurationMs: number;
}
interface ServiceStat {
  name: string;
  count: number;
  credits: number;
}
interface TrendPoint {
  day: string;
  count: number;
  credits: number;
}
interface Stats {
  totalTasks: number;
  totalImages: number;
  totalCredits: number;
  avgDurationMs: number;
  byModel: ModelStat[];
  byService: ServiceStat[];
  dailyTrend: TrendPoint[];
}

async function fetchStats() {
  const r = await fetch("/api/stats");
  return (await r.json()).stats as Stats;
}

function fmtDuration(ms: number) {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function StatsPage() {
  const { data } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });

  const s = data;

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-5.75rem)] lg:min-h-[620px] lg:overflow-y-auto lg:pr-1">
      <header className="flex shrink-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-2 shadow-soft">
          <BarChart3 className="h-5 w-5 text-accent" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
            用量统计
          </h1>
          <p className="mt-0.5 text-xs text-ink-3">
            生成次数、消费与耗时 · 近 14 天趋势
          </p>
        </div>
      </header>

      {!s ? (
        <StatsSkeleton />
      ) : s.totalTasks === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-paper-2 px-6 py-16 text-center animate-fade-in">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-paper-3/50">
            <BarChart3 className="h-5 w-5 text-ink-3" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink-2">还没有生成记录</p>
            <p className="mt-1 text-xs text-ink-3">
              去创作几张图后，这里就会有你的用量数据。
            </p>
          </div>
          <Button asChild size="sm" className="mt-1">
            <a href="/">
              <Wand2 className="h-3.5 w-3.5" />
              去创作
            </a>
          </Button>
        </div>
      ) : (
        <>
          {/* stat cards */}
          <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Activity} label="生成次数" value={s.totalTasks.toLocaleString()} delay={0} />
            <StatCard icon={ImageIcon} label="生成图片" value={s.totalImages.toLocaleString()} delay={60} />
            <StatCard icon={Coins} label="总消费" value={`${s.totalCredits.toLocaleString()} c`} accent delay={120} />
            <StatCard icon={Timer} label="平均耗时" value={fmtDuration(s.avgDurationMs)} delay={180} />
          </div>

          {/* charts row — stretches to fill remaining viewport height */}
          <div className="grid min-h-[300px] flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <TrendChart points={s.dailyTrend} />
            <DonutChart rows={s.byModel} />
          </div>

          {/* model + service breakdown */}
          <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <BreakdownTable title="模型消耗" rows={s.byModel} showDuration />
            <BreakdownTable title="服务消耗" rows={s.byService} />
          </div>
        </>
      )}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-hidden>
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[66px] rounded-lg" />
        ))}
      </div>
      <div className="grid min-h-[300px] flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="skeleton rounded-lg" />
        <div className="skeleton rounded-lg" />
      </div>
      <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="skeleton h-32 rounded-lg" />
        <div className="skeleton h-32 rounded-lg" />
      </div>
    </div>
  );
}

/* ---------------- stat card ---------------- */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  delay = 0,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  accent?: boolean;
  delay?: number;
}) {
  return (
    <div
      className="group flex items-center gap-3 rounded-lg border border-line bg-paper-2 p-3 shadow-soft transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-0.5 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors duration-[var(--dur-base)]",
          accent
            ? "bg-accent/15 text-accent"
            : "bg-paper-3 text-ink-3 group-hover:text-ink-2"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-mono text-lg font-semibold leading-none tabular-nums tracking-tight text-ink">
          {value}
        </p>
        <p className="mt-1.5 text-[10px] text-ink-3">{label}</p>
      </div>
    </div>
  );
}

/* ---------------- interactive trend chart ---------------- */

type Metric = "credits" | "count";

function TrendChart({ points }: { points: TrendPoint[] }) {
  const [metric, setMetric] = useState<Metric>("credits");
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...points.map((p) => p[metric]));
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-line bg-paper-2 p-4 shadow-soft animate-fade-up">
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-ink-3">
          每日趋势
        </h2>
        {/* metric toggle — filters which series the bars show */}
        <div className="flex rounded-md border border-line p-0.5">
          {(["credits", "count"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-[10px] font-medium transition-colors duration-[var(--dur-fast)]",
                metric === m
                  ? "bg-paper-3 text-ink shadow-soft"
                  : "text-ink-3 hover:text-ink-2"
              )}
            >
              {m === "credits" ? "Credits" : "次数"}
            </button>
          ))}
        </div>
      </div>

      {/* plot area — stretches with the card, min height on unconstrained
          (mobile) layouts where flex-1 alone would collapse to zero */}
      <div className="relative mt-3 min-h-[180px] flex-1">
        {/* gridlines + y ticks */}
        {[0, 0.5, 1].map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: `${t * 100}%` }}
          >
            <span className="w-7 shrink-0 -translate-y-1/2 text-right font-mono text-[9px] tabular-nums text-ink-3">
              {Math.round(max * t)}
            </span>
            <span
              className={cn(
                "h-px flex-1",
                t === 0 ? "bg-line" : "border-t border-dashed border-line/70"
              )}
            />
          </div>
        ))}

        {/* bars */}
        <div className="absolute inset-y-0 left-9 right-0 flex items-end gap-1 sm:gap-1.5">
          {points.map((p, i) => {
            const v = p[metric];
            const pct = Math.max(v > 0 ? 2 : 0.8, (v / max) * 100);
            return (
              <div
                key={p.day}
                className="group relative flex h-full flex-1 cursor-default items-end"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* hover hit-area highlight */}
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 top-2 rounded-sm transition-colors duration-[var(--dur-fast)]",
                    hover === i ? "bg-paper-3/60" : "bg-transparent"
                  )}
                />
                <div
                  className={cn(
                    "relative w-full origin-bottom rounded-t-sm animate-grow-y transition-[height,background-color] duration-500 ease-[var(--ease-out)]",
                    v > 0
                      ? hover === i
                        ? "bg-accent/80"
                        : "bg-accent"
                      : "bg-paper-4"
                  )}
                  style={{ height: `${pct}%`, animationDelay: `${i * 30}ms` }}
                />
              </div>
            );
          })}

          {/* tooltip — anchored to the hovered bar inside the plot area */}
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-paper-2 px-2.5 py-1.5 shadow-lift animate-fade-in"
              style={{
                left: `${((hover + 0.5) / points.length) * 100}%`,
                bottom: `calc(${Math.max(2, (hovered[metric] / max) * 100)}% + 10px)`,
              }}
            >
              <p className="font-mono text-[10px] text-ink-3">{hovered.day}</p>
              <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] tabular-nums text-ink">
                <span className="text-accent">{hovered.credits} c</span>
                <span className="mx-1 text-line">·</span>
                {hovered.count} 次
              </p>
            </div>
          )}
        </div>
      </div>

      {/* x labels */}
      <div className="mt-1.5 flex shrink-0 gap-1 pl-9 sm:gap-1.5">
        {points.map((p, i) => (
          <span
            key={p.day}
            className={cn(
              "flex-1 text-center font-mono text-[9px] tabular-nums text-ink-3",
              i % 2 === 1 && "hidden sm:block"
            )}
          >
            {p.day.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- donut chart — model credit share ---------------- */

const DONUT_COLORS = [
  "var(--color-accent)",
  "var(--color-ink-3)",
  "var(--color-paper-4)",
  "oklch(52% 0.16 30 / 0.55)",
  "var(--color-ink-2)",
  "var(--color-line)",
];

function DonutChart({ rows }: { rows: ModelStat[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = Math.max(1, rows.reduce((n, r) => n + r.credits, 0));

  let cum = 0;
  const segments = rows.map((r, i) => {
    const pct = (r.credits / total) * 100;
    const seg = { ...r, pct, offset: cum, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    cum += pct;
    return seg;
  });

  const shown = active !== null ? segments[active] : null;

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-line bg-paper-2 p-4 shadow-soft animate-fade-up">
      <h2 className="shrink-0 text-xs font-medium uppercase tracking-wider text-ink-3">
        模型消费占比
      </h2>

      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[168px] shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
          {segments.map((s, i) => (
            <circle
              key={s.name}
              cx="21"
              cy="21"
              r="15.9155"
              fill="transparent"
              stroke={s.color}
              strokeWidth={active === i ? 6.5 : 5}
              strokeDasharray={`${Math.max(s.pct - 1, 0.5)} ${100 - Math.max(s.pct - 1, 0.5)}`}
              strokeDashoffset={-s.offset}
              className="cursor-default transition-[stroke-width] duration-[var(--dur-fast)]"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        {/* center readout */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="max-w-[70%] truncate text-[10px] text-ink-3">
            {shown ? shown.name : "总消费"}
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums leading-tight text-ink">
            {shown ? shown.credits : rows.reduce((n, r) => n + r.credits, 0)}
            <span className="ml-0.5 text-[10px] font-normal text-ink-3">c</span>
          </p>
          <p className="font-mono text-[10px] tabular-nums text-ink-3">
            {shown ? `${shown.pct.toFixed(0)}%` : `${rows.length} 个模型`}
          </p>
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {segments.map((s, i) => (
          <button
            key={s.name}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-[var(--dur-fast)]",
              active === i ? "bg-paper-3/60" : "hover:bg-paper-3/40"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{s.name}</span>
            <span className="font-mono text-[10px] tabular-nums text-ink-3">
              {s.pct.toFixed(0)}%
            </span>
            <span className="w-10 text-right font-mono text-[10px] tabular-nums text-ink-2">
              {s.credits} c
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- breakdown tables ---------------- */

function BreakdownTable({
  title,
  rows,
  showDuration,
}: {
  title: string;
  rows: (ModelStat | ServiceStat)[];
  showDuration?: boolean;
}) {
  const maxCredits = Math.max(1, ...rows.map((r) => r.credits));
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper-2 shadow-soft animate-fade-up">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-xs font-medium uppercase tracking-wider text-ink-3">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-ink-3">暂无数据</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wider text-ink-3">
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-2 py-2 text-right font-medium">次数</th>
              <th className="px-2 py-2 text-right font-medium">消费</th>
              {showDuration && (
                <th className="px-4 py-2 text-right font-medium">平均耗时</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.name}
                className="border-b border-line transition-colors duration-[var(--dur-fast)] last:border-b-0 hover:bg-paper-3/40"
              >
                <td className="px-4 py-2.5 font-medium text-ink">
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-0 truncate">{r.name}</span>
                    <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-paper-3">
                      <span
                        className="block h-full rounded-full bg-accent/60"
                        style={{ width: `${(r.credits / maxCredits) * 100}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right font-mono tabular-nums text-ink-2">{r.count}</td>
                <td className="px-2 py-2.5 text-right font-mono tabular-nums text-accent">{r.credits}</td>
                {showDuration && (
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-3">
                    {"avgDurationMs" in r ? fmtDuration(r.avgDurationMs) : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
