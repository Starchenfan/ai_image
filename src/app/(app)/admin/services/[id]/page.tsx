"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Cpu,
  Settings2,
  Save,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import type { AiService, AiModel, ModelParameterSchema, AdapterType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

const ADAPTER_TYPES: AdapterType[] = [
  "openai",
  "flux",
  "stable_diffusion",
  "custom",
  "proxy",
];

const FIELD_TYPES: ModelParameterSchema["type"][] = [
  "number",
  "select",
  "slider",
  "text",
  "boolean",
];

async function fetchService(id: string) {
  const r = await fetch(`/api/admin/services/${id}`);
  return (await r.json()) as { service: AiService; models: AiModel[] };
}

async function fetchModels(serviceId: string) {
  const r = await fetch(`/api/admin/models?serviceId=${serviceId}`);
  return (await r.json()).models as AiModel[];
}

export default function ServiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-service", id],
    queryFn: () => fetchService(id),
  });

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState(false);

  const delService = useMutation({
    mutationFn: async () => {
      await fetch(`/api/admin/services/${id}`, { method: "DELETE" });
    },
    onSuccess: () => router.push("/admin"),
  });

  const service = data?.service;
  const models = data?.models ?? [];

  return (
    <div className="space-y-5">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <Link href="/admin" className="transition-colors hover:text-ink">
          服务管理
        </Link>
        <span>/</span>
        <span className="text-ink-2">{service?.name ?? "…"}</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-ink">
              {service?.name ?? "加载中…"}
            </h1>
            <p className="font-mono text-[10px] text-ink-3">
              {service?.baseUrl}
            </p>
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (confirm("删除服务将同时移除其所有模型。确认删除?"))
              delService.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除服务
        </Button>
      </div>

      <Tabs defaultValue="models">
        <TabsList>
          <TabsTrigger value="models">
            <Cpu className="mr-1.5 h-3.5 w-3.5" />
            模型 ({models.length})
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            服务配置
          </TabsTrigger>
        </TabsList>

        {/* MODELS TAB */}
        <TabsContent value="models" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-3">
              每个模型的参数 Schema 独立配置 · 前端据此自动渲染
            </p>
            <Button size="sm" onClick={() => setAddingModel(true)}>
              <Plus className="h-3.5 w-3.5" />
              添加模型
            </Button>
          </div>

          <div className="grid gap-2.5">
            {models.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                serviceId={id}
                expanded={selectedModel === m.id}
                onToggle={() =>
                  setSelectedModel((s) => (s === m.id ? null : m.id))
                }
              />
            ))}
            {models.length === 0 && (
              <div className="rounded-lg border border-dashed border-line p-10 text-center text-sm text-ink-3">
                该服务暂无模型。添加模型后即可在工作台中使用。
              </div>
            )}
          </div>

          <AddModelDialog
            open={addingModel}
            onOpenChange={setAddingModel}
            serviceId={id}
          />
        </TabsContent>

        {/* CONFIG TAB */}
        <TabsContent value="config">
          {service && <ServiceConfig service={service} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ModelRow({
  model,
  serviceId,
  expanded,
  onToggle,
}: {
  model: AiModel;
  serviceId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper-2/40">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-paper-3/30"
      >
        <GripVertical className="h-4 w-4 shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {model.displayName}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {model.modelId}
            </Badge>
            {!model.enabled && <Badge variant="danger">已禁用</Badge>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-3">
            {model.description}
          </p>
        </div>
        <div className="hidden items-center gap-3 text-[10px] text-ink-3 sm:flex">
          <span className="font-mono">{model.parameters.length} 参数</span>
          <span>·</span>
          <span>{model.supportedAspectRatios.length} 比例</span>
          <span>·</span>
          <span className="font-mono">{model.priceCredits}c</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line animate-fade-in">
          <ModelEditor model={model} serviceId={serviceId} />
        </div>
      )}
    </div>
  );
}

function ModelEditor({
  model,
  serviceId: _serviceId,
}: {
  model: AiModel;
  serviceId: string;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AiModel>({ ...model });
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = async () => {
    setSaving(true);
    try {
      await fetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      await qc.invalidateQueries({ queryKey: ["admin-service"] });
      await qc.invalidateQueries({ queryKey: ["models"] });
    } finally {
      setSaving(false);
    }
  };

  const delModel = useMutation({
    mutationFn: async () => {
      await fetch(`/api/admin/models/${model.id}`, { method: "DELETE" });
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["admin-service"] }),
  });

  const updateField = (patch: Partial<AiModel>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const updateParam = (i: number, patch: Partial<ModelParameterSchema>) =>
    setDraft((d) => ({
      ...d,
      parameters: d.parameters.map((p, idx) =>
        idx === i ? { ...p, ...patch } : p
      ),
    }));

  const addParam = () => {
    const newParam: ModelParameterSchema = {
      key: `param_${draft.parameters.length + 1}`,
      type: "slider",
      label: "新参数",
      min: 0,
      max: 100,
      step: 1,
      default: 50,
      group: "basic",
    };
    updateField({ parameters: [...draft.parameters, newParam] });
  };

  const removeParam = (i: number) =>
    setDraft((d) => ({
      ...d,
      parameters: d.parameters.filter((_, idx) => idx !== i),
    }));

  return (
    <div className="space-y-4 p-4">
      {/* basic fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="显示名称">
          <Input
            value={draft.displayName}
            onChange={(e) => updateField({ displayName: e.target.value })}
            className="text-sm"
          />
        </Field>
        <Field label="模型 ID (发送给 provider)">
          <Input
            value={draft.modelId}
            onChange={(e) => updateField({ modelId: e.target.value })}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="描述">
          <Input
            value={draft.description}
            onChange={(e) => updateField({ description: e.target.value })}
            className="text-sm"
          />
        </Field>
        <Field label="价格 (Credits)">
          <Input
            type="number"
            value={draft.priceCredits}
            onChange={(e) =>
              updateField({ priceCredits: Number(e.target.value) })
            }
            className="font-mono text-xs"
          />
        </Field>
        <Field label="最大批量">
          <Input
            type="number"
            value={draft.maxBatch}
            onChange={(e) => updateField({ maxBatch: Number(e.target.value) })}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="平均耗时 (秒)">
          <Input
            type="number"
            value={draft.avgDurationSec}
            onChange={(e) =>
              updateField({ avgDurationSec: Number(e.target.value) })
            }
            className="font-mono text-xs"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="支持比例 (逗号分隔)">
          <Input
            value={draft.supportedAspectRatios.join(", ")}
            onChange={(e) =>
              updateField({
                supportedAspectRatios: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className="font-mono text-xs"
          />
        </Field>
        <Field label="支持尺寸 (逗号分隔)">
          <Input
            value={draft.supportedSizes.join(", ")}
            onChange={(e) =>
              updateField({
                supportedSizes: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className="font-mono text-xs"
          />
        </Field>
      </div>

      <Field label="标签 (逗号分隔)">
        <Input
          value={(draft.tags ?? []).join(", ")}
          onChange={(e) =>
            updateField({
              tags: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="text-sm"
        />
      </Field>

      {/* enabled toggle */}
      <div className="flex items-center justify-between rounded-md border border-line bg-paper-3/30 px-3 py-2">
        <span className="text-xs text-ink-2">启用模型</span>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => updateField({ enabled: v })}
        />
      </div>

      {/* PARAMETER SCHEMA EDITOR */}
      <div className="space-y-2.5 rounded-md border border-line bg-paper-3/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-ink-2">
              参数 Schema ({draft.parameters.length})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowJson((s) => !s)}
              title="查看 JSON"
            >
              {showJson ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={addParam}>
              <Plus className="h-3 w-3" />
              添加参数
            </Button>
          </div>
        </div>

        {showJson ? (
          <Textarea
            readOnly
            value={JSON.stringify(draft.parameters, null, 2)}
            className="max-h-64 overflow-auto font-mono text-[10px]"
          />
        ) : (
          <div className="space-y-2">
            {draft.parameters.map((p, i) => (
              <ParamEditor
                key={i}
                param={p}
                onChange={(patch) => updateParam(i, patch)}
                onRemove={() => removeParam(i)}
              />
            ))}
            {draft.parameters.length === 0 && (
              <p className="py-3 text-center text-[11px] text-ink-3">
                无参数。前端将只显示默认控件。
              </p>
            )}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            if (confirm("删除该模型?")) delModel.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除模型
        </Button>
        <Button onClick={patch} disabled={saving} size="sm">
          <Save className="h-3.5 w-3.5" />
          {saving ? "保存中…" : "保存模型"}
        </Button>
      </div>
    </div>
  );
}

function ParamEditor({
  param,
  onChange,
  onRemove,
}: {
  param: ModelParameterSchema;
  onChange: (patch: Partial<ModelParameterSchema>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-line bg-paper-2/50 p-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Key" tiny>
          <Input
            value={param.key}
            onChange={(e) => onChange({ key: e.target.value })}
            className="h-8 font-mono text-[11px]"
          />
        </Field>
        <Field label="Label" tiny>
          <Input
            value={param.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="h-8 text-[11px]"
          />
        </Field>
        <Field label="Type" tiny>
          <Select
            value={param.type}
            onValueChange={(v) =>
              onChange({ type: v as ModelParameterSchema["type"] })
            }
          >
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Group" tiny>
          <Select
            value={param.group ?? "basic"}
            onValueChange={(v) =>
              onChange({ group: v as ModelParameterSchema["group"] })
            }
          >
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["basic", "advanced", "sampler", "quality"].map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Min" tiny>
          <Input
            type="number"
            value={param.min ?? ""}
            onChange={(e) =>
              onChange({ min: e.target.value ? Number(e.target.value) : undefined })
            }
            className="h-8 font-mono text-[11px]"
          />
        </Field>
        <Field label="Max" tiny>
          <Input
            type="number"
            value={param.max ?? ""}
            onChange={(e) =>
              onChange({ max: e.target.value ? Number(e.target.value) : undefined })
            }
            className="h-8 font-mono text-[11px]"
          />
        </Field>
        <Field label="Step" tiny>
          <Input
            type="number"
            value={param.step ?? ""}
            onChange={(e) =>
              onChange({
                step: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-8 font-mono text-[11px]"
          />
        </Field>
        <Field label="Default" tiny>
          <Input
            value={
              param.default === undefined || param.default === null
                ? ""
                : String(param.default)
            }
            onChange={(e) => onChange({ default: e.target.value })}
            className="h-8 font-mono text-[11px]"
          />
        </Field>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Options (逗号分隔, select 类型用)" tiny>
            <Input
              value={(param.options ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className="h-8 font-mono text-[11px]"
            />
          </Field>
        </div>
        <div className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-paper-3/40 px-2">
          <Switch
            checked={!!param.advanced}
            onCheckedChange={(v) => onChange({ advanced: v })}
          />
          <span className="text-[10px] text-ink-3">高级</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-danger" />
        </Button>
      </div>
    </div>
  );
}

function ServiceConfig({ service }: { service: AiService }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AiService>({ ...service });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<AiService>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const body: Partial<AiService> & { apiKey?: string } = { ...draft };
      if (apiKey) body.apiKey = apiKey;
      await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await qc.invalidateQueries({ queryKey: ["admin-service"] });
      setApiKey("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4 rounded-lg border border-line bg-paper-2/40 p-4">
      <Field label="服务名称">
        <Input
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>
      <Field label="适配器类型">
        <Select
          value={draft.adapterType}
          onValueChange={(v) => update({ adapterType: v as AdapterType })}
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
      </Field>
      <Field label="Base URL">
        <Input
          value={draft.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          className="font-mono text-xs"
        />
      </Field>
      <Field label="状态">
        <Select
          value={draft.status}
          onValueChange={(v) => update({ status: v as AiService["status"] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["online", "offline", "degraded", "rate_limited", "maintenance"].map(
              (t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="延迟 (ms)">
          <Input
            type="number"
            value={draft.latencyMs}
            onChange={(e) => update({ latencyMs: Number(e.target.value) })}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="标签 (逗号分隔)">
          <Input
            value={(draft.tags ?? []).join(", ")}
            onChange={(e) =>
              update({
                tags: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            className="text-xs"
          />
        </Field>
      </div>
      <Field label="API Key (覆盖)">
        <Input
          type="password"
          placeholder={service.apiKeyMasked}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-[10px] text-ink-3">
          当前: <span className="font-mono">{service.apiKeyMasked}</span>
        </p>
      </Field>
      <div className="flex items-center justify-between rounded-md border border-line bg-paper-3/30 px-3 py-2">
        <span className="text-xs text-ink-2">推荐服务</span>
        <Switch
          checked={!!draft.recommended}
          onCheckedChange={(v) => update({ recommended: v })}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button onClick={save} disabled={saving} size="sm">
          <Save className="h-3.5 w-3.5" />
          {saving ? "保存中…" : "保存配置"}
        </Button>
      </div>
    </div>
  );
}

function AddModelDialog({
  open,
  onOpenChange,
  serviceId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceId: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    displayName: "",
    modelId: "",
    description: "",
    priceCredits: 2,
    maxBatch: 1,
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, serviceId }),
      });
      await qc.invalidateQueries({ queryKey: ["admin-service"] });
      onOpenChange(false);
      setForm({ displayName: "", modelId: "", description: "", priceCredits: 2, maxBatch: 1 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加模型</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="显示名称">
            <Input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
          </Field>
          <Field label="模型 ID">
            <Input
              value={form.modelId}
              onChange={(e) => setForm({ ...form, modelId: e.target.value })}
              className="font-mono text-xs"
            />
          </Field>
          <Field label="描述">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="text-xs"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="价格 (Credits)">
              <Input
                type="number"
                value={form.priceCredits}
                onChange={(e) =>
                  setForm({ ...form, priceCredits: Number(e.target.value) })
                }
                className="font-mono text-xs"
              />
            </Field>
            <Field label="最大批量">
              <Input
                type="number"
                value={form.maxBatch}
                onChange={(e) =>
                  setForm({ ...form, maxBatch: Number(e.target.value) })
                }
                className="font-mono text-xs"
              />
            </Field>
          </div>
          <p className="text-[10px] text-ink-3">
            创建后可在模型编辑器中配置参数 Schema、比例、尺寸等。
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={saving || !form.displayName}>
            {saving ? "创建中…" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  tiny,
}: {
  label: string;
  children: React.ReactNode;
  tiny?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label
        className={cn(
          tiny ? "text-[10px]" : "text-xs",
          "text-ink-3"
        )}
      >
        {label}
      </Label>
      {children}
    </div>
  );
}
