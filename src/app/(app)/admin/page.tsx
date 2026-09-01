"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Settings,
  Plus,
  ChevronRight,
  Trash2,
  Server,
  Activity,
  Zap,
  Shield,
  Import,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { AiService, AdapterType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ADAPTER_TYPES: AdapterType[] = [
  "openai",
  "flux",
  "stable_diffusion",
  "custom",
  "proxy",
];

const STATUS_STYLE: Record<string, string> = {
  online: "bg-ok",
  offline: "bg-ink-3",
  degraded: "bg-warn",
  rate_limited: "bg-warn",
  maintenance: "bg-ink-3",
};

// fetchServices — 仅管理员可见的服务列表。走 /api/admin/services 而不是公共的
  // /api/services：前者返回完整字段（apiKeyMasked、latencyMs、adapterType），
  // 公共接口只返回工作台展示所需的最小字段。
async function fetchServices() {
  const r = await fetch("/api/admin/services");
  return (await r.json()).services as AiService[];
}

/**
 * AdminPage — 服务管理后台（/admin）。
 *
 * 它是「基础设施」面：不涉及任何生成，只负责接入/编辑/删除 AI 图像服务。
 * 和 /admin/services/[id] 的分工：这里是「列表 + 概览 + 入口」，那里是「单个服务的详情 + 模型编辑」。
 *
 * 核心设计原则「不写死任何 provider」：每个服务由 adapterType + baseUrl + apiKey 三个字段描述，
  * adapterType 决定后端走哪个 Adapter，所以接入新 provider 只需要后端加一个 adapter，
  * 前端（包括这个页面和工作台）零改动。
 *
 * 布局：header（标题 + 两个操作按钮）→ 四张概览卡 → 服务列表（桌面对齐表格、手机对齐卡片）。
 * 桌面用 grid 模拟表格列宽，手机退化为 2 列网格，因为手机放不下 6 列。
 */
export default function AdminPage() {
  const qc = useQueryClient();
  // 服务列表是管理页的唯一数据源，默认 [] 让空列表不闪「加载中」。
  // 修改（添加/删除/导入）后统一只 invalidate，不手动 setQueryData：
  // 因为服务列表的顺序、字段都由后端决定，让后端说了算最安全。
  const { data: services = [] } = useQuery({
    queryKey: ["admin-services"],
    queryFn: fetchServices,
  });

  // 两个对话框的开关状态，用布尔量控制显隐（受控组件模式）。
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  /**
   * del — 删除一个服务的 mutation。
   *
   * 角色：列表页只提供「删除」这一个写操作（编辑要去详情页）。
   * 不做乐观更新：删除是不可逆的，用户需要确认（confirm），
   * 失败了也比「界面删了但后端没删」好排查。onSettled 统一失效缓存。
   */
  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-services"] }),
  });

  const online = services.filter((s) => s.status === "online").length;

  return (
    <div className="space-y-5">
      {/* header — 标题 + 两个操作按钮。右侧按钮顺序是「导入 NewAPI（secondary）」在前、
          「添加服务（primary）」在后：导入是高频但需要中转站凭据的操作，
          次要样式避免喧宾夺主；手动添加是兜底路径，用主色强调。 */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-paper-2">
            <Settings className="h-4.5 w-4.5 text-accent" />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">服务管理</h1>
            <p className="text-xs text-ink-3">
              接入新的 AI 图像服务 · 不写死任何 provider
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminLogoutButton />
          <Button onClick={() => setImporting(true)} size="sm" variant="secondary">
            <Import className="h-4 w-4" />
            导入 NewAPI
          </Button>
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="h-4 w-4" />
            添加服务
          </Button>
        </div>
      </header>

      {/* stat strip — 四张概览卡：总数 / 在线数 / 适配器类型数 / API Key 状态。
          「在线」标 accent，因为它是唯一带判断性质的指标——用户关心的是
          「现在有几个人能用」，不是「一共接了多少」。
          API Key 显示「已加密」而不是具体掩码，因为列表页不承担展示密钥的任务（详情页才展示）。
       */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Server} label="服务总数" value={String(services.length)} />
        <StatCard icon={Activity} label="在线" value={String(online)} accent />
        <StatCard
          icon={Zap}
          label="适配器类型"
          value={String(new Set(services.map((s) => s.adapterType)).size)}
        />
        <StatCard
          icon={Shield}
          label="API Key"
          value="已加密"
        />
      </div>

      {/* table — 服务列表。桌面端是 grid 模拟的 6 列对齐表格（列宽写死在 grid-cols 里），
          移动端退化为 2 列网格（只显示名称 + 状态点），因为手机放不下 6 列。
          表头与行用同一份 grid-cols 定义，保证列严格对齐。
          每行是一个 Link，整行点击跳转到 /admin/services/[id] 详情页。
          手机上 md:grid-cols 会失效、回到默认 grid grid-cols-2，
          所以每行在手机上只有两列：左侧名称区 + 右侧（被挤掉的字段都 hidden）。 */}
      <div className="overflow-hidden rounded-lg border border-line bg-paper-2/40">
        <div className="hidden grid-cols-[2fr_1.2fr_1fr_0.8fr_0.6fr_40px] gap-3 border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-3 md:grid">
          <span>服务名称</span>
          <span>适配器</span>
          <span>状态</span>
          <span>延迟</span>
          <span>Key</span>
          <span />
        </div>
        {services.map((s) => (
          <Link
            key={s.id}
            href={`/admin/services/${s.id}`}
            className="grid grid-cols-2 items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-paper-3/40 md:grid-cols-[2fr_1.2fr_1fr_0.8fr_0.6fr_40px]"
          >
            {/* name — 服务名 + Base URL。左侧状态点用 STATUS_STYLE 映射：
            online 绿、offline/维护 灰、degraded/rate_limited 黄。
            未知状态回退 bg-ink-3 灰，保证不会因为后端加了新状态而崩。
            推荐服务额外标一个 accent 的「推荐」Badge。 */}
            {/* name */}
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  STATUS_STYLE[s.status] ?? "bg-ink-3"
                )}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-ink">
                    {s.name}
                  </span>
                  {s.recommended && <Badge variant="accent">推荐</Badge>}
                </div>
                <span className="truncate font-mono text-[10px] text-ink-3">
                  {s.baseUrl}
                </span>
              </div>
            </div>
            {/* adapter — 后端适配器类型（openai / flux / stable_diffusion / custom / proxy），
            outline Badge + font-mono，一眼看出这个服务走的是哪套协议。 */}
            {/* adapter */}
            <div className="hidden md:block">
              <Badge variant="outline" className="font-mono text-[10px]">
                {s.adapterType}
              </Badge>
            </div>
            {/* status — 服务当前状态文本（online / offline / degraded / rate_limited / maintenance）。 */}
            {/* status */}
            <div className="hidden md:block">
              <span className="text-xs text-ink-2">{s.status}</span>
            </div>
            {/* latency — 后端探测到的响应延迟，font-mono 等宽方便横向比较谁快谁慢。 */}
            {/* latency */}
            <div className="hidden font-mono text-xs text-ink-3 md:block">
              {s.latencyMs}ms
            </div>
            {/* key — API Key 的掩码串（如 sk-****1234）。列表页只展示掩码，
            明文只在详情页「覆盖 Key」输入框里出现，且保存时才发给后端。 */}
            {/* key */}
            <div className="hidden font-mono text-[10px] text-ink-3 md:block">
              {s.apiKeyMasked}
            </div>
            <div className="hidden justify-end md:flex">
              <ChevronRight className="h-4 w-4 text-ink-3" />
            </div>
          </Link>
        ))}
        {services.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-3">
            暂无服务。点击右上角「添加服务」接入第一个 AI 图像 API。
          </div>
        )}
      </div>

      <AddServiceDialog open={adding} onOpenChange={setAdding} />
      <ImportNewApiDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}

/**
   * StatCard — 管理页概览卡。图标 + 大数字 + 小标签。
   * accent 标记（在线数）用 accent 色，和 stats 页的 StatCard 是同一套语言，
   * 但这里没有 hover 动效（不需要），更轻量。
   */
  function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-paper-2/40 p-3">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md",
          accent ? "bg-accent/15 text-accent" : "bg-paper-3 text-ink-3"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-lg font-semibold leading-none text-ink">{value}</p>
        <p className="mt-0.5 text-[10px] text-ink-3">{label}</p>
      </div>
    </div>
  );
}

/**
   * AddServiceDialog — 「添加服务」对话框。手动录入一个 AI 图像服务的最小字段：
   * 名称 / 适配器类型 / Base URL / API Key。
   *
   * 和 ImportNewApiDialog 的分工：这个是「我知道服务的全部信息，直接录」；
   * 那个是「我只有一个 NewAPI 中转站地址，帮我把模型也扒过来」。
   *
   * 安全性：API Key 明文只在表单内存里存在，提交后立即从 form state 清空，
   * 且后端只存掩码，前端列表/详情都只看得到掩码。
   */
  function AddServiceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    adapterType: "openai" as AdapterType,
    baseUrl: "",
    apiKey: "",
  });
  const [saving, setSaving] = useState(false);

  /**
   * submit — 录入新服务。角色是「写操作的唯一出口」：POST 一条服务记录，
   * 成功后失效 admin-services 缓存让列表刷新，关闭对话框并重置表单。
   * 用 finally 而不是 catch：无论成功失败 saving 都要还原，按钮不会一直转圈。
   * 提交按钮 disabled 条件是 !form.name：名称是唯一必填项，其他留空由后端决定默认值。
   */
  const submit = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await qc.invalidateQueries({ queryKey: ["admin-services"] });
      onOpenChange(false);
      setForm({ name: "", adapterType: "openai", baseUrl: "", apiKey: "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 AI 服务</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>服务名称</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如: Replicate Relay"
            />
          </div>
          <div className="space-y-1.5">
            <Label>适配器类型</Label>
            <Select
              value={form.adapterType}
              onValueChange={(v) =>
                setForm({ ...form, adapterType: v as AdapterType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADAPTER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-ink-3">
              决定后端走哪个 Adapter。新 provider → 新 adapter，前端无需改动。
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Base URL</Label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="仅服务器存储，前端只展示掩码"
            />
            <p className="text-[10px] text-ink-3">
              Key 永不出现在前端。存储为掩码字符串。
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={saving || !form.name}>
            {saving ? "保存中…" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ListedModelItem = {
  id: string;
  ownedBy?: string;
  likelyImage: boolean;
};

type ProbeResult = {
  baseUrl: string;
  apiKeyMasked: string;
  count: number;
  items: ListedModelItem[];
};

/**
 * ImportNewApiDialog — 导入 NewAPI / One-API 中转站的三步向导。
 *
 * 为什么需要它：NewAPI 是一个「模型聚合中转」，一个中转站背后可能挂了几十个模型。
 * 用户不想一个个手动添加，所以这个对话框帮用户「连上中转站 → 看到模型列表 →
 * 勾选要哪些 → 一键建成一个服务 + N 个模型」。
 *
 * 三步：
 *   Step 1 — 输入中转站 baseUrl + apiKey，调 GET /api/admin/import/newapi
 *           探测连通性并拉取模型列表（带「是否可能是图像模型」的启发式标记）。
 *   Step 2 — 勾选要导入的模型。默认把 flagged likelyImage 的全选，
 *            用户可取消勾选对话模型或追加其他模型。
 *   Step 3 — 提交 POST /api/admin/import/newapi，后端批量建一个
 *            AiService（openai 适配器）+ 选中的 AiModels。
 *
 * 安全性：apiKey 明文只在 Step 1 的表单和 Step 3 的提交体里存在，
 * 探测返回的 apiKeyMasked 是掩码，后端只在 db.apiKeys vault 里存明文，
 * 客户端全程只看得到掩码。
 */

function ImportNewApiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // reset — 把对话框的所有表单/状态重置为初始值。
  // 角色：它是「关闭时清场」的唯一入口——用户点取消、点提交成功、
  // 或点右上角 X，最终都走 close(false) → reset()。
  // 之所以不直接在 onOpenChange 里重置：打开时（v=true）不重置，
  // 否则用户「点开 → 看一眼 → 关掉 → 再点开」时输入内容会被清。
  const reset = () => {
    setStep(1);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setSelected(new Set());
    setResult(null);
    setProbeError(null);
  };

  // close — 对话框的统一关闭入口，区分「打开」与「关闭」两种语义。
  // v=true → 直接 onOpenChange(true)（对话框本来就是开的，不重置）；
  // v=false → 先 reset() 清场再 onOpenChange(false)。
  // 为什么包一层：让「取消」「提交成功」「点 X」三种关闭路径行为一致，
  // 避免各自直接调用 onOpenChange 而漏掉重置。
  const close = (v: boolean) => {
    if (v) {
      onOpenChange(v);
    } else {
      reset();
      onOpenChange(false);
    }
  };

  /**
   * probe — Step 1 的动作：连接中转站并拉取模型列表。
   *
   * 角色：它是「后端可达性」的唯一探测器。PUT /api/admin/import/newapi
   * 把 baseUrl+apiKey 透传给后端，由后端真正去请求中转站的 /models 端点，
   * 前端不直接跨域接触中转站。返回的 likelyImage 是按模型 id 命名的启发式判断
   * （中转站本身不区分图像/对话模型），所以只是「建议」，用户仍需按需勾选。
   * 副作用：成功时写入 result + selected（预选）+ 切到 Step 2；
   * 失败时写入 probeError，停留在 Step 1 让用户改凭据。
   */
  const probe = async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const r = await fetch("/api/admin/import/newapi", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const data = (await r.json()) as ProbeResult & { error?: string };
      if (!r.ok) {
        setProbeError(data.error || `中转站返回 ${r.status}`);
        return;
      }
      // pre-select everything flagged likely-image so the user can just
      // hit "导入选中" — they can deselect chat models or add more.
      // 中文注释：探测返回后，默认把所有「可能是图像模型」的项全选，
      // 用户只需直接点「导入选中」；不想导入的对话模型可以取消勾选，也可以追加其他模型。
      const likelyImage = new Set(
        data.items.filter((it) => it.likelyImage).map((it) => it.id)
      );
      setSelected(likelyImage);
      setResult(data);
      setStep(2);
    } catch (e) {
      setProbeError(`连接失败: ${(e as Error).message}`);
    } finally {
      setProbing(false);
    }
  };

  /**
   * toggle — Step 2 里单个模型的勾选/取消勾选。
   * 角色：纯本地状态翻转（Set 增删），无网络请求，点击立即反馈。
   */
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /**
   * submit — Step 3 的动作：把选中的模型批量导入。
   *
   * 角色：它是导入流程的最后一步，POST /api/admin/import/newapi 让后端建一个
   * AiService + N 个 AiModels。body 用 result.baseUrl（探测返回的权威地址）
   * 而不是用户输入的 baseUrl，避免用户手滑打错；name 缺省时回落默认值。
   * 成功后同时失效 admin-services（列表页）与 services（工作台服务列表）两个缓存，
   * 因为导入会在两个地方都产生可见变化。
   * 失败时把错误写回 probeError 并停留在 Step 2，用户可改了再提交。
   * finally 还原 submitting，按钮不会一直转圈。
   */
  const submit = async () => {
    if (!result || selected.size === 0) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/import/newapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "NewAPI 中转",
          baseUrl: result.baseUrl,
          apiKey,
          modelIds: Array.from(selected),
        }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({})) as { error?: string });
        setProbeError(data.error || `导入失败: ${r.status}`);
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin-services"] });
      await qc.invalidateQueries({ queryKey: ["services"] });
      close(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            导入 NewAPI 中转站{" "}
            <span className="ml-1 text-xs font-normal text-ink-3">
              {step === 1 ? "1/2 连接中转站" : "2/2 选择模型"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>服务名称（可选）</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: 我的 NewAPI 中转"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://relay.example.com/v1"
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-ink-3">
                NewAPI / One-API 中转站地址。导入后走 OpenAI-compat 适配器。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="中转站的令牌"
              />
              <p className="text-[10px] text-ink-3">
                Key 仅服务器端存储为掩码，前端不保存明文。
              </p>
            </div>
            {probeError && (
              <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-all">{probeError}</span>
              </div>
            )}
          </div>
        )}

        {step === 2 && result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-md bg-paper-3/40 p-2 text-xs">
              <span className="text-ink-3">
                共 {result.count} 个模型 · 推荐图像模型已预选
              </span>
              <span className="font-mono text-ink-3">{result.apiKeyMasked}</span>
            </div>
            {/* 模型列表 — Step 2 的主体。max-h-72 限高 + overflow-y-auto，
            让几十个模型也能滚动而不是把对话框撑出屏幕。
            每行是一个 button（而非 checkbox 组件），整行点击切换勾选态，
            左侧自绘勾选框（border-accent + CheckCircle2）——
            之所以不直接用原生 checkbox：样式完全可控，和设计系统一致。
            中转站不区分图像/对话模型，「图像?」Badge 仅按命名启发式判断，
            所以底部有行小字提醒用户按需勾选。 */}
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-line p-1.5">
              {result.items.map((it) => {
                const checked = selected.has(it.id);
                return (
                  <button
                    key={it.id}
                    onClick={() => toggle(it.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded p-2 text-left transition-colors",
                      checked
                        ? "bg-accent/10"
                        : "hover:bg-paper-3/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line"
                      )}
                    >
                      {checked && <CheckCircle2 className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs text-ink">
                          {it.id}
                        </span>
                        {it.likelyImage && (
                          <Badge variant="accent" className="shrink-0 text-[9px]">
                            图像?
                          </Badge>
                        )}
                      </div>
                      {it.ownedBy && (
                        <span className="text-[10px] text-ink-3">
                          {it.ownedBy}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {result.items.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-ink-3">
                  中转站未返回任何模型
                </p>
              )}
            </div>
            <p className="text-[10px] text-ink-3">
              中转站不区分图像/对话模型，「图像?」仅按命名启发式判断，
              请按需勾选。
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 1 ? (
            <>
              <Button variant="secondary" onClick={() => close(false)} disabled={probing}>
                取消
              </Button>
              <Button
                onClick={probe}
                disabled={probing || !baseUrl || !apiKey}
              >
                {probing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    连接中…
                  </>
                ) : (
                  "连接并获取模型列表"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}>
                上一步
              </Button>
              <Button
                onClick={submit}
                disabled={submitting || selected.size === 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    导入中…
                  </>
                ) : (
                  `导入选中 (${selected.size})`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
