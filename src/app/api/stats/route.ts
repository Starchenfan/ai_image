import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPersistedHistory } from "@/lib/image-storage";
import type { HistoryItem } from "@/lib/types";

export const dynamic = "force-dynamic";

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

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function aggregate(history: HistoryItem[]): Stats {
  const totalTasks = history.length;
  const totalImages = history.reduce((n, h) => n + h.images.length, 0);
  const totalCredits = history.reduce((n, h) => n + h.costCredits, 0);
  const avgDurationMs =
    totalTasks === 0
      ? 0
      : Math.round(history.reduce((n, h) => n + h.durationMs, 0) / totalTasks);

  // by model
  const modelMap = new Map<string, { count: number; credits: number; durationMs: number }>();
  for (const h of history) {
    const key = h.modelName || "Unknown";
    const cur = modelMap.get(key) ?? { count: 0, credits: 0, durationMs: 0 };
    cur.count += 1;
    cur.credits += h.costCredits;
    cur.durationMs += h.durationMs;
    modelMap.set(key, cur);
  }
  const byModel: ModelStat[] = [...modelMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      credits: v.credits,
      avgDurationMs: Math.round(v.durationMs / v.count),
    }))
    .sort((a, b) => b.credits - a.credits);

  // by service
  const serviceMap = new Map<string, { count: number; credits: number }>();
  for (const h of history) {
    const key = h.serviceName || "Unknown";
    const cur = serviceMap.get(key) ?? { count: 0, credits: 0 };
    cur.count += 1;
    cur.credits += h.costCredits;
    serviceMap.set(key, cur);
  }
  const byService: ServiceStat[] = [...serviceMap.entries()]
    .map(([name, v]) => ({ name, count: v.count, credits: v.credits }))
    .sort((a, b) => b.credits - a.credits);

  // daily trend — last 14 days, zero-filled
  const DAYS = 14;
  const now = Date.now();
  const trendMap = new Map<string, { count: number; credits: number }>();
  for (let i = DAYS - 1; i >= 0; i--) {
    trendMap.set(dayKey(now - i * 86_400_000), { count: 0, credits: 0 });
  }
  for (const h of history) {
    const key = dayKey(h.createdAt);
    const cur = trendMap.get(key);
    if (cur) {
      cur.count += 1;
      cur.credits += h.costCredits;
    }
  }
  const dailyTrend: TrendPoint[] = [...trendMap.entries()].map(([day, v]) => ({
    day,
    count: v.count,
    credits: v.credits,
  }));

  return { totalTasks, totalImages, totalCredits, avgDurationMs, byModel, byService, dailyTrend };
}

// GET /api/stats
export async function GET() {
  const history = (await getPersistedHistory()) ?? db.history;
  return NextResponse.json({ stats: aggregate(history) });
}
