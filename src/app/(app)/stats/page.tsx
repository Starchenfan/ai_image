"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, ImageIcon, Coins, Timer, Activity } from "lucide-react";
import { cn } from "@/lib/cn";

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
  const maxCredits = s
    ? Math.max(1, ...s.dailyTrend.map((p) => p.credits))
    : 1;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper-2">
          <BarChart3 className="h-4.5 w-4.5 text-accent" />
        </span>
        <div>
          <h1 className="font-display text-lg font-semibold text-ink">用量统计</h1>
          <p className="text-xs text-ink-3">生成次数、消费与耗时 · 近 14 天趋势</p>
        </div>
      </header>

      {!s ? (
        <div className="rounded-lg border border-line bg-paper-2 p-12 text-center text-sm text-ink-3">
          加载中…
        </div>
      ) : s.totalTasks === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-paper-2 p-12 text-center">
          <p className="text-sm text-ink-3">还没有生成记录。去创作几张图后这里就会有数据。</p>
        </div>
      ) : (
        <>
          {/* stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Activity} label="生成次数" value={s.totalTasks.toLocaleString()} />
            <StatCard icon={ImageIcon} label="生成图片" value={s.totalImages.toLocaleString()} />
            <StatCard icon={Coins} label="总消费" value={`${s.totalCredits.toLocaleString()} c`} accent />
            <StatCard icon={Timer} label="平均耗时" value={fmtDuration(s.avgDurationMs)} />
          </div>

          {/* daily trend bar chart */}
          <div className="rounded-lg border border-line bg-paper-2 p-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-ink-3">
              消费趋势（Credits / 天）
            </h2>
            <div className="mt-4 flex h-36 items-end gap-1.5">
              {s.dailyTrend.map((p) => {
                const h = Math.round((p.credits / maxCredits) * 120);
                return (
                  <div key={p.day} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[9px] font-mono text-ink-3">
                      {p.credits > 0 ? p.credits : ""}
                    </span>
                    <div
                      className={cn(
                        "w-full rounded-sm transition-all",
                        p.credits > 0 ? "bg-accent" : "bg-paper-4"
                      )}
                      style={{ height: `${Math.max(p.credits > 0 ? 3 : 1, h)}px` }}
                      title={`${p.day}: ${p.credits} credits`}
                    />
                    <span className="text-[9px] text-ink-3">{p.day.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* model + service breakdown */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <BreakdownTable title="模型消耗" rows={s.byModel} />
            <BreakdownTable title="服务消耗" rows={s.byService} />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-paper-2 p-3">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md",
          accent ? "bg-accent/15 text-accent" : "bg-paper-3 text-ink-3"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold leading-none text-ink">{value}</p>
        <p className="mt-1 text-[10px] text-ink-3">{label}</p>
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: (ModelStat | ServiceStat)[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper-2">
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
              <th className="px-4 py-2 text-right font-medium">平均耗时</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2 font-medium text-ink">{r.name}</td>
                <td className="px-2 py-2 text-right font-mono text-ink-2">{r.count}</td>
                <td className="px-2 py-2 text-right font-mono text-accent">{r.credits}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-3">
                  {"avgDurationMs" in r ? fmtDuration(r.avgDurationMs) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
