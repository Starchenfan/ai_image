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

/**
 * fmtDuration — 把毫秒格式化成人类可读的耗时。
 *
 * 三段式：0 或负数 → 「—」（没数据）；< 1000ms → 「Nms」保留整数；
 * >= 1000ms → 「N.Ns」保留 1 位小数。统计页要横向对比多行，
 * ms 和 s 混排时用 tabular-nums 对齐，避免数字跳列。
 */
function fmtDuration(ms: number) {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * StatsPage — 用量统计仪表盘（/stats）。
 *
 * 它是「回顾」面：不产生任何生成，只把历史数据聚合后可视化。
 * 和 /history 的区别：history 是「逐条翻」，stats 是「一眼看总量」。
 *
 * 三态渲染：数据未到 → StatsSkeleton 骨架屏；到了但总量为 0 → 空状态引导去创作；
 * 有数据 → 四张统计卡 + 趋势图 + 环形图 + 两个明细表。
 *
 * 布局在 lg 以上锁定视口高度（100dvh - 5.75rem）并纵向可滚动，
 * 这样四张卡 + 两个图表 + 两个明细表在一页内不会把页面顶出视口，
 * 用户不用滚就能看到「总消费」和「模型占比」这两个最关心的数字。
 */
export default function StatsPage() {
  // stats 是「聚合快照」而非实时数据：一次请求拿全部指标，不需要轮询。
  // 默认 undefined 用来驱动首屏骨架，而不是用 data?.totalTasks === 0——
  // 后者会把「还没请求完」和「确实一条记录都没有」混为一谈。
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

      三态渲染（由上至下判定）：
          1. !s              → 数据还没到，渲染 StatsSkeleton，避免数字「从 0 跳到 123」的闪烁。
          2. s.totalTasks === 0 → 没有任何生成记录，渲染空状态并引导去创作。
          3. 否则              → 四张统计卡 + 图表 + 明细表。
          注意 1 和 2 必须分开：不能用 totalTasks===0 同时代表「未加载」和「真为空」。
          之所以用 !s 而不是 s.totalTasks===0 做第一层判断，是为了把「未加载」与「真为空」区分开。 */}
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
          {/* stat cards — 顶部四张大数卡片，/lg 以下 2 列、以上 4 列。
          顺序按「用户关心程度」排：次数 → 图片 → 消费 → 耗时。
          每张带错开 60ms 的 fade-up 入场，让数字「一块一块」浮现而不是一起亮。
          总消费标 accent（橙色），因为「花了多少」是唯一带情绪色彩的指标，
          其余三张是中性灰，视觉上把消费单独拎出来。 */}
          <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Activity} label="生成次数" value={s.totalTasks.toLocaleString()} delay={0} />
            <StatCard icon={ImageIcon} label="生成图片" value={s.totalImages.toLocaleString()} delay={60} />
            <StatCard icon={Coins} label="总消费" value={`${s.totalCredits.toLocaleString()} c`} accent delay={120} />
            <StatCard icon={Timer} label="平均耗时" value={fmtDuration(s.avgDurationMs)} delay={180} />
          </div>

          {/* charts row — 中段：左侧趋势图（flex-1 自适应宽度）+ 右侧环形图（固定 300px）。
          lg 以下竖排占满宽度，因为手机上看环形图 + 趋势图并排太挤。
          min-h-[300px] + flex-1：在 unconstrained 布局（如手机竖屏）里，
          光靠 flex-1 会让图表塌成 0 高度，min-h 保证至少能看清坐标轴。 */}
          <div className="grid min-h-[300px] flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <TrendChart points={s.dailyTrend} />
            <DonutChart rows={s.byModel} />
          </div>

          {/* model + service breakdown — 底部两张明细表，lg 以上并排。
          模型表带「平均耗时」列，服务表不带——耗时是模型属性（不同模型推理速度差很多），
          服务只是路由层，拼上耗时没有意义。名称列里的进度条是「消费占比」的可视化，
          让横向对比不用读数字也能感知谁是大头。 */}
          <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <BreakdownTable title="模型消耗" rows={s.byModel} showDuration />
            <BreakdownTable title="服务消耗" rows={s.byService} />
          </div>
        </>
      )}
    </div>
  );
}

/**
   * StatsSkeleton — 数据加载中的骨架屏。结构与有数据时的布局完全一致
   * （四张卡 + 两个图表 + 两个表），只是把数字替换成灰色块。
   * 用 aria-hidden 挡住屏幕阅读器，避免「读出一堆无意义的骨架块」。
   * 这样用户感知到的是「内容在生长」而非「页面在刷新」。
   */
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

/**
   * StatCard — 统计卡片。图标 + 大数字 + 小标签，标准「指标卡」形态。
   * accent 标记（总消费）用 accent 底色，非 accent 卡 hover 时图标变深灰→黑，
   * 给「可交互」的 hover 反馈。delay 用于入场错峰，四张卡依次出现。
   */
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

/**
   * TrendChart — 近 14 天每日趋势的柱状图。
   *
   * 角色：它是统计页唯一「能看趋势走向」的图表，其余都是快照。
   * 默认显示 Credits（消费）而非次数，因为「钱」比「次数」更能说明用户的投入程度。
   * 顶部的 toggle 让用户在两根序列间切换——同一根柱子不可能同时画两条线，
   * 所以用 metric 状态切换数据源，而不是双 Y 轴（双轴容易误读）。
   *
   * 高度策略：max 取 1 兜底，避免某天数据全 0 时所有柱子塌成 0；
   * 每根柱子最低 0.8%（或非零时最低 2%），保证 0 值那天也有一个「底座」可见。
   */
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
        {/* 指标切换 toggle — 决定柱子显示哪根序列（Credits 或次数）。
          选中项用纸色底 + 阴影，未选中项是透明底灰字，切换成本很低。 */}
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

      {/* plot area — 随卡片高度伸缩的绘图区。min-h-[180px] 是刻意加的：
          在 unconstrained 布局（如手机竖屏）里光靠 flex-1 会让图表塌成 0 高度，
          180px 保证坐标轴和至少一根柱子能看清。 */}
      <div className="relative mt-3 min-h-[180px] flex-1">
        {/* gridlines + y ticks — 三条水平参考线（0% / 50% / 100%），对应 max 的 0/0.5/1。
          0% 是实线（底线），50% 和 100% 是虚线，视觉上区分「基准线」和「刻度线」。
          刻度值用 tabular-nums 等宽，多根柱子并排时数字不会错位。 */}
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

        {/* bars — 每天一根柱子，flex-1 均分宽度。hover 时该柱子上方出现一条半透明高亮带
          （hover hit-area），同时柱子颜色从 accent 深一点到 accent/80，
          给用户「鼠标在这根上」的反馈。
          animate-grow-y 让柱子从 0 高度生长出来，配合 30ms 错峰，
          14 根柱子依次出现比一起出现更易读。 */}
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

          {/* tooltip — 锚定在被 hover 的柱子上方，显示当天的日期 + 两个指标的具体值。
          位置用 left/bottom 百分比计算：left 按柱子索引均分，
          bottom 在柱子高度之上再抬 10px，保证浮在柱子顶上不被遮挡。
          之所以同时显示 credits 和 count：切换 metric 只改变柱子高度，
          但 tooltip 里两个数字都给，用户不用切回去看另一根序列。 */}
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

      {/* x labels — 日期轴。只显示 MM-DD（slice(5) 去掉年份），
          奇数索引在 sm 以下隐藏，避免 14 个日期挤在一起糊成一片。 */}
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

/**
   * DonutChart — 各模型消费占比的环形图。
   *
   * 角色：和趋势图互补——趋势图回答「什么时候花得多」，环形图回答「花在谁身上」。
   * 用环形而不是饼图：环中间可以放「总消费 / 当前选中模型」的读数，
   * 饼图中间是空的，放不下这个关键数字。
   *
   * 实现：SVG circle 的 stroke-dasharray 做分段。每段长度 = 该模型占比，
   * strokeDashoffset 逐段累加偏移，形成环形分段。hover 某段时线宽从 5 加到 6.5，
   * 中心读数切换成该模型名 + 消费 + 占比，下方图例同步高亮。
   *
   * 为什么用消费（credits）而不是次数做占比：不同模型单次价格差几倍，
   * 「谁花了钱」比「谁被点了几次」更有商业意义。
   */
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
        {/* center readout — 环形正中的三行字。默认显示「总消费 + 总额 + 模型个数」；
          hover 某段时切换成「该模型名 + 该模型消费 + 该模型占比」。
          pointer-events-none 是因为这层只是展示，事件要穿透到下方的 SVG 环形段。 */}
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

      {/* 图例 — 环形下方的可滚动列表。每行：色块 + 模型名 + 占比 + 消费金额。
          整行都是 button，hover 时环形对应段加宽、中心读数切换成该模型，
          让「图例 ↔ 环形」双向联动，比只 hover 环形本身更容易命中（
          环形段是 SVG path，鼠标判定区域窄，图例行宽更容易点到）。
          flex-1 + overflow-y-auto：模型多时图例自己滚动，不至于撑破卡片。 */}
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

/**
   * BreakdownTable — 模型/服务维度的明细表。两个表共用一个组件，
   * 差异只有「是否显示平均耗时列」（模型表有，服务表没有）。
   *
   * 名称列内嵌一条 mini 进度条：该行消费 / 全部行最大消费，
   * 让横向对比不用读数字也能感知谁是大头——表格 + 条形图的双重编码。
   * maxCredits 兜底 1 避免除以 0。
   */
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
