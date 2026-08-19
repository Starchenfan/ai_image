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

async function fetchServices() {
  const r = await fetch("/api/admin/services");
  return (await r.json()).services as AiService[];
}

export default function AdminPage() {
  const qc = useQueryClient();
  const { data: services = [] } = useQuery({
    queryKey: ["admin-services"],
    queryFn: fetchServices,
  });

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-services"] }),
  });

  const online = services.filter((s) => s.status === "online").length;

  return (
    <div className="space-y-5">
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

      {/* stat strip */}
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

      {/* table — card list on mobile */}
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
            {/* adapter */}
            <div className="hidden md:block">
              <Badge variant="outline" className="font-mono text-[10px]">
                {s.adapterType}
              </Badge>
            </div>
            {/* status */}
            <div className="hidden md:block">
              <span className="text-xs text-ink-2">{s.status}</span>
            </div>
            {/* latency */}
            <div className="hidden font-mono text-xs text-ink-3 md:block">
              {s.latencyMs}ms
            </div>
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
 * ImportNewApiDialog — multi-step importer for NewAPI / One-API relays.
 *
 * Step 1: enter relay baseUrl + apiKey → call GET /api/admin/import/newapi
 *         to list models (with heuristic "likely image" flags).
 * Step 2: checkbox-select the image models to import.
 * Step 3: submit → POST /api/admin/import/newapi bulk-creates one
 *         AiService (openai adapter) + the selected AiModels. The apiKey
 *         is stored ONLY server-side in the db.apiKeys vault; the client
 *         only ever sees the masked stub.
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

  const reset = () => {
    setStep(1);
    setName("");
    setBaseUrl("");
    setApiKey("");
    setSelected(new Set());
    setResult(null);
    setProbeError(null);
  };

  const close = (v: boolean) => {
    if (v) {
      onOpenChange(v);
    } else {
      reset();
      onOpenChange(false);
    }
  };

  const probe = async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const r = await fetch(
        `/api/admin/import/newapi?baseUrl=${encodeURIComponent(
          baseUrl
        )}&apiKey=${encodeURIComponent(apiKey)}`
      );
      const data = (await r.json()) as ProbeResult & { error?: string };
      if (!r.ok) {
        setProbeError(data.error || `中转站返回 ${r.status}`);
        return;
      }
      // pre-select everything flagged likely-image so the user can just
      // hit "导入选中" — they can deselect chat models or add more.
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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
