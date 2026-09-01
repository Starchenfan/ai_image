"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  History as HistoryIcon,
  Star,
  Trash2,
  RefreshCw,
  Download,
  Search,
  Edit3,
  SlidersHorizontal,
  ClipboardCopy,
  ImagePlus,
} from "lucide-react";
import type { HistoryItem, GenerateTask, GeneratedImage, AiModel, AiService } from "@/lib/types";
import { cn, formatRelativeTime, formatDuration } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudio } from "@/lib/store";
import { VersionTree } from "@/components/studio/version-tree/version-tree";
import { ImageEditor } from "@/components/studio/image-editor";
import { Portal } from "@/components/ui/portal";

type Filter = "all" | "today" | "favorite";

// fetchHistory — 按筛选条件拉取历史记录。filter 既是查询参数，也是 react-query 的
// queryKey 的一部分，切换 filter 会自动触发重取，无需手动 invalidate。
async function fetchHistory(filter: Filter) {
  const r = await fetch(`/api/history?filter=${filter}`);
  return (await r.json()).items as HistoryItem[];
}

/**
 * recipeJson — 把一条历史记录序列化成「完整配方」JSON，供复制分享或外部复现。
 *
 * 为什么需要它：历史卡片上的「复用参数」只是把表单填回工作台，而这个 JSON
 * 是给人/脚本/其它工具看的完整描述——包含 serviceId、modelId、aspectRatio、
 * 甚至每张图实际用到的 seed。requestedSeed 塞 -1 是因为后端约定 undefined/null
 * 表示「没手动指定 seed」，JSON 里不能省字段所以用 -1 占位。
 */
function recipeJson(h: HistoryItem) {
  return JSON.stringify(
    {
      prompt: h.prompt,
      negativePrompt: h.negativePrompt,
      service: h.serviceName,
      model: h.modelName,
      serviceId: h.serviceId,
      modelId: h.modelId,
      aspectRatio: h.aspectRatio,
      size: h.size,
      count: h.count,
      requestedSeed: h.seed ?? -1,
      seeds: h.images.map((i) => i.seed),
      parameters: h.parameters,
    },
    null,
    2
  );
}

/**
 * downloadName — 生成下载文件名。
 *
 * 历史图片存成 WebP 或 PNG，从不存 SVG（SVG 无像素数据，不适合当图下载）。
 * 文件名从 URL 里取真实扩展名：正则匹配 png/jpg/jpeg/webp/gif/avif，
 * 匹配不到就退回 png，保证扩展名永远合理。
 * 前缀 huijie- + id 保证唯一且好认。
 */
function downloadName(h: HistoryItem, url: string) {
  const ext = /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.exec(url)?.[1] ?? "png";
  return `huijie-${h.id}.${ext.toLowerCase()}`;
}

/**
 * toTask — 把历史记录还原成 VersionTree 需要的 GenerateTask 形态。
 *
 * 为什么需要它：VersionTree 的分支提交走 /api/tasks/[id]/branch，
 * 后端 resolveParentTask 已经支持从 MySQL 还原历史记录当父任务；
 * 但画布自身需要 task.request.prompt / task.model / task.service
 * 来渲染节点标签，这些字段 HistoryItem 不直接提供，所以在这里补全。
 * model / service 只有展示名（历史表不存对象），没有真实对象引用，
 * 分支提交时后端会自己按 id 重新解析，这里用 displayName 占位即可。
 */
function toTask(h: HistoryItem): GenerateTask {
  return {
    id: h.id,
    status: "completed",
    progress: 100,
    stage: "完成",
    request: {
      serviceId: h.serviceId ?? "",
      modelId: h.modelId ?? "",
      prompt: h.prompt,
      negativePrompt: h.negativePrompt,
      count: h.count,
      aspectRatio: h.aspectRatio,
      size: h.size,
      seed: h.seed ?? -1,
      parameters: h.parameters,
    },
    // 版本树画布用 model.displayName / service.name 渲染节点标签。
    // 历史表只存展示名，这里补成最小对象，避免节点显示 "Unknown"。
    model: { displayName: h.modelName } as unknown as AiModel,
    service: { name: h.serviceName } as unknown as AiService,
    images: h.images,
    costCredits: h.costCredits,
    durationMs: h.durationMs,
    createdAt: h.createdAt,
    parentTaskId: h.parentTaskId,
    parentImageId: h.parentImageId,
    rootImageId: h.rootImageId,
  };
}

/**
 * HistoryPage — 生成历史页（/history）。
 *
 * 它是工作台的「回溯」面：所有生成结果自动落库到这里，用户可以翻旧账、
 * 复用参数、重试、收藏、删除。和 / 的关系是「生产 → 存档」：
 * 工作台生成完跳到这里查看，这里复用又跳回工作台。
 *
 * 筛选维度有三层：Tabs（全部/今日/收藏）控制后端查询，搜索框在前端再做一次
 * 关键词过滤（prompt 或模型名命中）。搜索是纯前端的，因为 Tabs 已经把范围
 * 缩小到几百条以内，客户端 filter 比再请求后端更快且无加载态。
 *
 * 布局：header（标题 + 搜索）→ Tabs → 网格卡片（4 列起，随宽度增加）。
 * 每张卡片自包含：缩略图 + prompt + 模型/尺寸/比例 + 时间/耗时/消费 + 一排动作。
 * 动作按钮全部放在卡片底部的 border-t 条里，hover 卡片时按钮并不显示/隐藏，
 * 保证用户随时能点——历史页的高频操作就是「复用」「重试」。
 */
export default function HistoryPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const set = useStudio((s) => s.set);
  const applyHistoryItem = useStudio((s) => s.applyHistoryItem);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 二次创作：用户在历史卡片上点「二次创作」时，记下选中的父任务与父图，
  // 弹出全屏树状画布（VersionTree），和工作台主页的分支流程共用同一组件。
  const [branchTarget, setBranchTarget] = useState<{
    task: GenerateTask;
    image: GeneratedImage;
  } | null>(null);
  // 图片编辑器：用户在历史卡片上点「编辑」时，打开全屏编辑器。
  const [editTarget, setEditTarget] = useState<{
    imageSrc: string;
    width: number;
    height: number;
  } | null>(null);
  // 编辑器所需的模型/服务列表（异步拉取，编辑器面板用）。
  const [editorModels, setEditorModels] = useState<AiModel[]>([]);
  const [editorServices, setEditorServices] = useState<AiService[]>([]);

  // 加载编辑器所需的模型/服务列表
  useEffect(() => {
    if (!editTarget) return;
    let cancelled = false;
    async function load() {
      try {
        const [svcsRes, allModelsRes] = await Promise.all([
          fetch("/api/services"),
          fetch("/api/models"),
        ]);
        const svcs = (await svcsRes.json()).services as AiService[];
        const allModels = (await allModelsRes.json()).models as AiModel[];
        if (!cancelled) {
          setEditorServices(svcs);
          setEditorModels(allModels);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [editTarget]);

  /**
   * reuse — 「复用参数」按钮的回调，历史页 → 工作台的主通道。
   *
   * 角色：它不直接发请求，而是调用 store 的 applyHistoryItem 把整条历史记录
   * 填回工作台表单（服务、模型、prompt、参数、参考图全部还原），再 router.push("/")
   * 回到工作台。lockSeed: true 是关键副作用：把 seed 锁成当时真的用的那个值，
   * 保证「复用」后重新生成的结果与原图一致，可复现、可比对。
   */
  const reuse = (h: HistoryItem) => {
    applyHistoryItem(h, { lockSeed: true });
    router.push("/");
  };

  /**
   * branch — 历史卡片上「二次创作」的回调。
   *
   * 和 reuse 不同：reuse 是把参数填回工作台重新生成（消耗 token），
   * branch 是直接在原图基础上改 prompt / 取变体 / 图生图，产出带版本树链路的子任务。
   * 卡片展示的是首图，所以默认基于 h.images[0] 分支；分支提交由 VersionTree 内部完成。
   */
  const branch = (h: HistoryItem) => {
    const img = h.images[0];
    if (!img) return;
    setBranchTarget({ task: toTask(h), image: img });
  };

  /**
   * edit — 历史卡片上「编辑」的回调。
   *
   * 打开全屏图片编辑器，用户可以做基础调整/裁剪/滤镜，也可以用 AI 编辑。
   */
  const edit = (h: HistoryItem) => {
    const img = h.images[0];
    if (!img) return;
    setEditTarget({ imageSrc: img.url, width: img.width, height: img.height });
  };

  /**
   * copyRecipe — 「复制参数 JSON」按钮的回调。
   *
   * 角色：把 recipeJson 的输出写进剪贴板，给用户一个可粘贴到别处的完整配方。
   * 副作用：本地 copiedId 记录「刚复制了哪一条」1600ms，让对应按钮的文案
   * 从「复制参数 JSON」翻成「已复制参数 JSON」并高亮，给用户确认反馈。
   * catch 里什么都不做：非安全上下文（如 localhost http）clipboard 会拒绝，
   * 但此时没有可回滚的状态，静默失败比弹错误框体验好。
   */
  const copyRecipe = async (h: HistoryItem) => {
    try {
      await navigator.clipboard.writeText(recipeJson(h));
      setCopiedId(h.id);
      setTimeout(() => setCopiedId((cur) => (cur === h.id ? null : cur)), 1600);
    } catch {
      // Clipboard is unavailable outside a secure context — nothing to undo.
    }
  };

  // useQuery — 历史记录主数据源。默认 [] 让首屏不闪空，
  // queryKey 含 filter，切 Tabs 就是换 key，自动重取且不会和别的 filter 的数据混。
  const { data: items = [] } = useQuery({
    queryKey: ["history", filter],
    queryFn: () => fetchHistory(filter),
  });

  /**
   * toggleFav — 收藏/取消收藏的 mutation。
   *
   * 角色：它是历史页里唯一「乐观更新」的操作。onMutate 里先用 setQueryData
   * 改本地缓存（把目标 item 的 favorite 翻转），页面立刻响应；
   * 网络请求在后台发，失败了 react-query 会自动回滚缓存。
   * 之所以敢这么写，是因为 PATCH 是幂等的，重复提交不会出脏数据。
   */
  const toggleFav = useMutation({
    mutationFn: async ({ id, fav }: { id: string; fav: boolean }) => {
      await fetch(`/api/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: fav }),
      });
    },
    onMutate: async ({ id, fav }) => {
      qc.setQueryData<HistoryItem[]>(["history", filter], (old) =>
        old?.map((h) => (h.id === id ? { ...h, favorite: fav } : h))
      );
    },
  });

  /**
   * del — 删除一条历史记录的 mutation。
   *
   * 角色：单条删除，不做乐观更新（删除比收藏重，失败了用户更容易困惑），
   * 而是等请求落定后 onSettled 统一失效 history 查询缓存、重新拉取。
   * 注意是 invalidate 而不是 setQueryData：删除后列表长度变了，
   * 服务端返回的顺序也可能变，让后端决定最终态最安全。
   */
  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/history/${id}`, { method: "DELETE" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["history"] }),
  });

  /**
   * retry — 「重试」按钮的 mutation。它和卡片上的「复用参数」是两个不同的诉求：
   * 复用 = 把参数填回去用户自己改；重试 = 直接以原参数重新提交一次生成。
   *
   * 角色：调 /api/generate/{id}/retry 拿到新 taskId 后，写进 store 的 activeTaskId，
   * 然后 router.push("/") 回工作台——回到工作台时 TaskStatus 会立刻开始轮询这个新任务。
   * 之所以不直接在历史页展示结果，是因为生成是异步任务、可能耗时很久，
   * 交给工作台的 TaskStatus 统一处理轮询/重试/换服务，历史页只负责触发。
   */
  const retry = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/generate/${id}/retry`, { method: "POST" });
      return (await r.json()).task;
    },
    onSuccess: (task) => {
      set("activeTaskId", task.id);
      // route to studio
      router.push("/");
    },
  });

  // filtered — 前端二次过滤。Tabs 已经把数据范围缩小（全部/今日/收藏），
  // 这里只按 prompt 与模型名做大小写不敏感的子串匹配，无额外网络开销。
  // 之所以不做成服务端搜索接口：历史数据量小，前端 filter 足够且无加载态。
  const filtered = items.filter(
    (h) =>
      h.prompt.toLowerCase().includes(q.toLowerCase()) ||
      h.modelName.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper-2">
            <HistoryIcon className="h-4.5 w-4.5 text-accent" />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">生成历史</h1>
            <p className="text-xs text-ink-3">查看、复用、收藏过往的生成结果</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索 Prompt 或模型…"
              className="h-9 w-full pl-8 sm:w-64"
            />
          </div>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="today">今日</TabsTrigger>
          <TabsTrigger value="favorite">收藏</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyHistory />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((h, i) => (
            <article
              key={h.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-paper-2/40 animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* thumb — 卡片顶部的图片区，固定 aspect-video（16:9）。
          有图时显示首张图，hover 时轻微放大（scale-105）给「可交互」感；
          没图（生成失败且未产出图片）时显示居中的金山图标占位，
          保证卡片高度一致、网格不乱。右上角两个角标：
          count>1 时显示「×N」（批量生成），收藏时显示实心星星。 */}
              <div className="relative aspect-video overflow-hidden bg-paper-3">
                {h.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.images[0].url}
                    alt={h.prompt.slice(0, 40)}
                    className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-3">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <div className="absolute right-2 top-2 flex gap-1">
                  {h.count > 1 && (
                    <Badge variant="default" className="bg-black/60 text-ink backdrop-blur-sm">
                      ×{h.count}
                    </Badge>
                  )}
                  {h.favorite && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-accent backdrop-blur-sm">
                      <Star className="h-3 w-3 fill-accent" />
                    </span>
                  )}
                </div>
              </div>

              {/* body — 缩略图下方的信息区，flex-1 撑开，自上而下：

                  prompt（2 行截断）→ 模型/尺寸/比例标签行 → 时间 + 耗时/消费。
                  耗时和消费挤在同一行右侧，用 font-mono 对齐，方便扫一眼就知道
                  「什么时候跑的、花了多久、多少钱」。
               */}
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 text-xs text-ink-2">{h.prompt}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink-3">
                  <Badge variant="accent">{h.modelName}</Badge>
                  <span className="font-mono">{h.size}</span>
                  <span>·</span>
                  <span>{h.aspectRatio}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-ink-3">
                  <span>{formatRelativeTime(h.createdAt)}</span>
                  <span className="font-mono">
                    {formatDuration(h.durationMs)} · {h.costCredits}c
                  </span>
                </div>
              </div>

              {/* actions — 卡片底部 border-t 条上的操作按钮，始终可见（不依赖 hover）。

                  从左到右：复用参数 → 重试 → 收藏 → 复制参数 JSON → 下载（有图时）→ 删除。
                  删除按钮带 ml-auto 挤到最右，把常用操作聚在左侧。
                  之所以全部用 ActionBtn（图标 + title/aria-label）而不是文字按钮：
                  横向空间有限，图标一行能塞下 6 个动作，文字按钮一行最多 3-4 个。
               */}
              <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                <ActionBtn
                  icon={ImagePlus}
                  label="二次创作（在原图基础上改 prompt / 变体 / 图生图）"
                  onClick={() => branch(h)}
                />
                <ActionBtn
                  icon={Edit3}
                  label="编辑（调整/滤镜/AI 编辑）"
                  onClick={() => edit(h)}
                />
                <ActionBtn
                  icon={SlidersHorizontal}
                  label="复用参数（回到工作台，锁定 seed）"
                  onClick={() => reuse(h)}
                />
                <ActionBtn
                  icon={RefreshCw}
                  label="重试"
                  loading={retry.isPending}
                  onClick={() => retry.mutate(h.id)}
                />
                <ActionBtn
                  icon={Star}
                  label="收藏"
                  active={h.favorite}
                  onClick={() => toggleFav.mutate({ id: h.id, fav: !h.favorite })}
                />
                <ActionBtn
                  icon={ClipboardCopy}
                  label={copiedId === h.id ? "已复制参数 JSON" : "复制参数 JSON"}
                  active={copiedId === h.id}
                  onClick={() => copyRecipe(h)}
                />
                {h.images[0] && (
                  <ActionBtn
                    icon={Download}
                    label="下载"
                    onClick={() => {
                      const url = h.images[0].url;
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = downloadName(h, url);
                      a.click();
                    }}
                  />
                )}
                <ActionBtn
                  icon={Trash2}
                  label="删除"
                  danger
                  onClick={() => del.mutate(h.id)}
                  className="ml-auto"
                />
              </div>
            </article>
          ))}
        </div>
      )}

    {branchTarget && (
      <Portal>
        <VersionTree
          task={branchTarget.task}
          image={branchTarget.image}
          onClose={() => setBranchTarget(null)}
          onStarted={() => {}}
        />
      </Portal>
    )}
    {editTarget && (
      <Portal>
        <ImageEditor
          imageSrc={editTarget.imageSrc}
          imageWidth={editTarget.width}
          imageHeight={editTarget.height}
          models={editorModels}
          services={editorServices}
          onClose={() => setEditTarget(null)}
          onApply={(url) => {
            // 应用编辑结果：刷新历史列表
            qc.invalidateQueries({ queryKey: ["history"] });
            setEditTarget(null);
          }}
          onExport={(url, format) => {
            const a = document.createElement("a");
            a.href = url;
            a.download = `huijie-edited.${format}`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      </Portal>
    )}
    </div>
  );
}

/**
   * ActionBtn

/**
   * ActionBtn — 历史卡片操作栏的通用图标按钮。
   *
   * 它把「图标 + label + 三种状态（普通/激活/危险）+ 加载中）」抽成一个组件，
   * 避免每个动作重复 20 行 className。label 同时作为 title 和 aria-label，
   * 图标按钮没有可见文字时，靠 tooltip 让用户知道点下去会做什么。
   * active 状态（收藏/复制）用 accent 色区分「当前是开的」，
   * danger 状态（删除）hover 时变红，loading 时图标旋转并禁用。
   */
  function ActionBtn({
  icon: Icon,
  label,
  onClick,
  active,
  danger,
  loading,
  className,
}: {
  icon: typeof Star;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink",
        active && "text-accent",
        danger && "hover:text-danger",
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
    </button>
  );
}

/**
   * EmptyHistory — 历史页的零状态。在三种情况下出现：切到某个筛选后无结果、
   * 搜索无匹配、或账号从未生成过（和 stats 页的空状态是同一套视觉语言）。
   * 按钮直接跳 / 去创作，形成「查不到 → 立刻去生产」的闭环。
   */
  function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper-2">
        <HistoryIcon className="h-6 w-6 text-ink-3" />
      </div>
      <div>
        <p className="text-sm font-medium text-ink-2">还没有历史记录</p>
        <p className="mt-0.5 text-xs text-ink-3">生成的图片会自动保存在这里</p>
      </div>
      <Button asChild size="sm" variant="secondary">
        <a href="/">去创作</a>
      </Button>
    </div>
  );
}
