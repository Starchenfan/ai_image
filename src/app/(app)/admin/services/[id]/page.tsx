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

// FIELD_TYPES — 参数 Schema 的 type 字段可选值。顺序影响管理后台里下拉框的排列，
// 与后端 ModelParameterSchema 的 type 联类型一一对应，不能随意增删。
const FIELD_TYPES: ModelParameterSchema["type"][] = [
  "number",
  "select",
  "slider",
  "text",
  "boolean",
];

// fetchService — 按 id 拉取单个服务的完整定义 + 其下属模型列表。
// 一次请求同时拿到 service 与 models，避免工作台 和管理后台各自再调一次 /api/models。
async function fetchService(id: string) {
  const r = await fetch(`/api/admin/services/${id}`);
  return (await r.json()) as { service: AiService; models: AiModel[] };
}

// fetchModels — 按 serviceId 拉模型列表。
// 与 fetchService 冗余是因为某些场景（如 ImportNewApi 导入后刷新）只需要模型，
// 单独一个接口比耦合在一起更灵活。queryKey 里不含 serviceId 是有意的：
// 这里只在组件内联用，不参与跨组件缓存共享。
async function fetchModels(serviceId: string) {
  const r = await fetch(`/api/admin/models?serviceId=${serviceId}`);
  return (await r.json()).models as AiModel[];
}

/**
 * ServiceDetailPage — 单个 AI 图像服务的详情页（/admin/services/[id]）。
 *
 * 它是 /admin 列表页的「下钻」面：列表页回答「有哪些服务」，这里回答
 * 「这个服务下面有哪些模型、每个模型怎么配置」。
 *
 * 和其他页面的关系：它是纯管理后台页面，不参与生成流程；工作台（/）通过
* 服务列表间接消费这里配置的模型。用户在工作台选的每个模型，其参数 Schema
 * 都是在这个页面的 ModelEditor 里定义的——它是「生成器参数」的源头。
 *
 * 布局：面包屑 → 服务标题行（返回按钮 + 名称 + Base URL + 删除服务）→
 * 两个 Tab：「模型」Tab（模型列表，每条可展开编辑）与「服务配置」Tab
 * （服务级字段：适配器、Base URL、状态、Key 等）。
 * 之所以用 Tab 而不是上下分区：模型编辑和配置编辑是两个独立的关注面，
 * 同时展示会让页面过长，且模型编辑是高频操作、需要更多纵向空间。
 */
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

  /**
   * delService — 删除当前服务的 mutation。
   *
   * 角色：它是详情页唯一的「破坏性写操作」。删除会同时移除该服务下的所有模型，
   * 所以按钮上包了一层 confirm 用户确认，而不是直接调用。
   * onSuccess 里 router.push("/admin")：服务没了，继续停在详情页没有意义，
   * 直接退回列表页。不做乐观更新：删除不可逆，让后端和缓存同步说了算。
   */
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
      {/* breadcrumb — 面包屑导航。只有一层（服务管理 → 当前服务），
          因为详情页在整个管理后台里的深度就两层，不需要多级。
          当前项用 ink-2 加深，可点击项 hover 变黑，符合顶栏/列表页的链接语言。 */}
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <Link href="/admin" className="transition-colors hover:text-ink">
          服务管理
        </Link>
        <span>/</span>
        <span className="text-ink-2">{service?.name ?? "…"}</span>
      </div>

      {/* header — 服务标题行。
          左侧：返回按钮（ghost 图标，回到 /admin 列表）+ 服务名（H1，font-display）+ Base URL（monospace 小字，ink-3 灰）。
          右侧：删除服务按钮（danger 样式）。
          左右分离的理由：返回是高频轻操作、删除是低频破坏性操作，放在对侧避免
          用户在左半区「导航」时误触右半区的危险动作。
          标题用 service?.name ?? "加载中…" 兜底，Base URL 同理——数据未到时显示占位，
          不留空白 H1。删除按钮上的 confirm 是唯一一道人工闸门：删服务会连带删掉
          其下所有模型，不可逆，所以不靠后端 4xx 兜底，而是先问用户。 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link href="/admin">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">
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

      {/* Tabs — 两个标签页：「模型」与「服务配置」。
          之所以分 Tab 而不是上下分区：模型编辑与配置编辑是两个独立的关注面，
          同时展示会让页面过长；模型编辑是高频操作且需要更多纵向空间（参数表），
          所以放在默认激活的 Tab。
          模型 Tab 的计数直接取 models.length，用户能一眼知道这个服务下有多少模型。 */}
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

        {/* MODELS TAB — 模型列表。
            上方工具栏：提示文案 + 「添加模型」按钮（打开 AddModelDialog）。
            列表用 grid gap-2.5 竖向排列，每个 ModelRow 默认折叠，
            点击展开后内部是 ModelEditor（参数 Schema 编辑器）。
            selectedModel 是一个「单开」状态：同一时间只允许一个模型展开，
            切换时 setSelectedModel 把旧的置 null，符合手风琴交互。
            空列表时显示虚线占位框，文案指向「添加模型」按钮，引导用户第一步动作。 */}
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

        {/* CONFIG TAB — 服务级配置。
            service 从 useQuery 的 data 里解构，数据未到时这里不渲染
            （{service && <ServiceConfig ... />}），避免把 undefined 传进去。
            ServiceConfig 内部自己维护一份 draft 副本，所以切换 Tab 不会丢未保存的改动。 */}
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
  /**
   * ModelRow — 模型列表里的单行。既是列表项也是折叠容器。
   *
   * 角色：它把一行信息展示 + 展开编辑两件事合在一个按钮上，
   * 点击按钮切换 expanded，展开区才渲染 ModelEditor。之所以做成 button 而不是
   * div + 独立「编辑」按钮：折叠/展开本身就是对这行的操作，按钮内包含全部信息，
   * 减少视觉噪音。
   *
   * 左侧 GripVertical 图标是「可拖拽」的暗示（虽然目前排序暂未实现），
   * 保留是为了给未来的拖拽排序留视觉预期——这是一个 intentionally-ahead 的信号。
   * 中间信息区：displayName（主标题）+ modelId（monospace badge，发送给 provider 的实际 ID，
   * 和显示名分开显示，因为两者经常不同）+ description（一行描述，超出省略）。
   * 未启用的模型额外加一个 danger badge「已禁用」，让用户知道它不会出现在工作台。
   * 右侧 meta strip（仅 sm 以上显示）：参数数量 / 比例数量 / 价格，
   * 全部用 monospace 对齐，一眼可比价。sm 以下隐藏是为了在窄屏上保住中间描述的显示。
   */
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
  /**
   * ModelEditor — 单个模型的完整编辑器（ModelRow 展开后的内容）。
   *
   * 它是「生成器参数」的源头：工作台里用户能调的每一个滑块/输入框，
   * 其 key、label、type、min/max/step、默认值都是在这里定义的。
   * 输出（draft）先存 DB，工作台再从 DB 读——Schema 在这里定义一次，两端共用。
   *
   * 状态设计：draft 是一份可变副本（{ ...model } 深拷贝一级），
   * 所有输入都更新 draft 而不写回 model 原始对象；只有点「保存模型」才发 PATCH。
   * 用户可以放心改、折叠走人也不会污染缓存。
   * queryKey 用 ["admin-service"] 而不是 ["admin-model", model.id]：
   * fetchService 一次返回 service + models，整个详情页数据都挂在这一个键下，
   * 保存后 invalidate 这个键即可让模型行、列表、配置 Tab 一起刷新。
   */
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AiModel>({ ...model });
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * patch — 保存模型。PATCH 到 /api/admin/models/{id}，body 就是 draft 全量。
   * 成功后 invalidate ["admin-service"] 与 ["models"] 两个键：
   * 前者刷新详情页数据（模型行立即反映新值），后者刷新工作台侧的模型列表缓存。
   * try/finally 保证 saving 在网络异常时也能置 false，避免按钮永久禁用。
   * 服务端是 PATCH 部分更新，所以整份 draft 都发过去没问题。
   */
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

  /**
   * delModel — 删除当前模型的 mutation。
   * 用 useMutation 包装而非内联 async：按钮上只需 .mutate()，
   * 错误处理与 settled 回调统一由 mutation 管理。
   * onSettled（无论成功失败都跑）里 invalidate ["admin-service"]——删完列表少一行。
   * 按钮本身包了 confirm：删模型不可逆，删掉后工作台里对应模型也会消失。
   */
  const delModel = useMutation({
    mutationFn: async () => {
      await fetch(`/api/admin/models/${model.id}`, { method: "DELETE" });
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["admin-service"] }),
  });

  /**
   * updateField — 合并模型顶层字段到 draft。纯函数式状态更新：
   * setDraft((d) => ({ ...d, ...patch }))，保证不可变性，React 才能做 bail-out。
   * 所有 basic fields 输入框的 onChange 都经它。
   */
  const updateField = (patch: Partial<AiModel>) =>
    setDraft((d) => ({ ...d, ...patch }));

  /**
   * updateParam — 合并某个参数项的字段到 draft.parameters[i]。
   * map + 三元表达式保证除了目标项外其他参数引用不变，
   * ParamEditor 里未改动的行不会重渲染。
   */
  const updateParam = (i: number, patch: Partial<ModelParameterSchema>) =>
    setDraft((d) => ({
      ...d,
      parameters: d.parameters.map((p, idx) =>
        idx === i ? { ...p, ...patch } : p
      ),
    }));

  /**
   * addParam — 新增一个参数项，默认填一套可直接保存的值：
   * key 用 param_{n+1} 保证唯一，type 首选 slider（最常见），
   * min 0 / max 100 / step 1 / default 50（滑块默认语义），
   * group 归入 basic（与高级参数区分）。建完通过 updateField 写进 draft。
   */
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

  /**
   * removeParam — 删除指定位置的参数项。filter 后新数组长度减一，
   * draft 其他字段不动。没有 confirm：单个参数删错成本低，
   * 用户可以立刻 addParam 补回来。
   */
  const removeParam = (i: number) =>
    setDraft((d) => ({
      ...d,
      parameters: d.parameters.filter((_, idx) => idx !== i),
    }));

  return (
    <div className="space-y-4 p-4">
      {/* basic fields — 模型的基础属性。分两组 grid：
          第一组是「这个模型是什么」（显示名/modelId/描述/价格/批量/耗时），
          第二组是「这个模型支持什么」（比例/尺寸/标签）。
          之所以拆成两个 grid 而不是一个：字段语义不同，分开后视觉上更好扫读。
          modelId 用 font-mono 且 label 明确写了「发送给 provider」——
          它是最终发给上游 API 的字符串，和用户看到的显示名是两回事，必须区分。
          价格/批量/耗时都是 number 输入，Number() 包一层避免空串污染 state。
          比例/尺寸/标签用「逗号分隔」的字符串输入，
          输入即转数组：join(", ") 回显、split(",") 入库，比数组 state 更适合自由文本编辑。 */}
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

      {/* enabled toggle — 是否在工作台里可见。
          单独做成一条带边框的行，而不是并进上面的 grid：
          它是「开关」不是「填空」，需要更明显的视觉权重。
          关掉后模型不会出现在工作台的可选列表里，但配置保留，
          相当于「下架」而非删除——随时可以重新打开。 */}
      <div className="flex items-center justify-between rounded-md border border-line bg-paper-3/30 px-3 py-2">
        <span className="text-xs text-ink-2">启用模型</span>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => updateField({ enabled: v })}
        />
      </div>

      {/* PARAMETER SCHEMA EDITOR — 模型参数的定义区，也是整个详情页最重要的区块。
          它决定了工作台渲染出哪些控件（滑块/下拉/数字/文本/开关），
          以及每个控件的默认值、范围、选项。
          设计决策：提供「表单」与「JSON」两种视图，右上角的 Eye/EyeOff 按钮切换。
          - 表单视图：逐字段编辑，适合第一次配置，字段含义直观。
          - JSON 视图：只读，展示 draft.parameters 序列化后的原文。
            只读而非可编辑的理由：手写 JSON 容易写出后端校验不过的非法组合
            （比如 slider 却没给 min），而且表单已经能表达全部字段，
            JSON 只是「我现在配置长什么样」的审查视图。
          参数数组为空时的提示文案指向前端默认行为，避免用户以为漏配。
          每个参数项用 ParamEditor 子组件渲染，key 用数组下标 i 而不是 param.key：
          参数没有稳定 id，下标是唯一稳定标识；即使用户改了 param.key，
          组件实例也不会错位。 */}
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

      {/* actions — 底部操作栏。border-t + pt-3 把它和上面的编辑区做视觉分割，
          让「保存/删除」这类提交动作固定在编辑器底部，符合用户从上到下
          「填完 → 提交」的阅读顺序。
          左侧删除（danger）、右侧保存（主按钮）：删除是破坏性操作，
          放在远离主按钮的一侧，避免误触；保存按钮带 saving 状态，
          禁用期间文案变「保存中…」，防止重复提交。 */}
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
  /**
   * ParamEditor — 单个参数项的编辑卡片。ModelEditor 的参数列表里一行一个。
   *
   * 它不直接碰 ModelEditor 的 state，而是通过 onChange/onRemove 回调向上提交：
   * 这样 ModelEditor 可以用数组下标做 key 来定位要改哪一项，
   * 即使用户在 Key 输入框里改了 param.key，组件实例也不会错位。
   *
   * 布局：三行。第一行 Key/Label/Type/Group（标识与分类），
   * 第二行 Min/Max/Step/Default（数值范围，slider/number 类型用），
   * 第三行 Options + 高级开关 + 删除（额外配置与收尾）。
   * 之所以把 Options 和删除放在第三行：它们不是每个参数都用得上
   * （Options 只对 select 类型有效），单独一行避免主网格拥挤。
   * Min/Max/Step 允许为空：空表示「不限制」，转成 undefined 走后端默认，
   * 比强制填 0 更符合语义（比如 text 类型根本不需要 min/max）。
   */
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
        {/* Min / Max / Step — 数值范围，主要给 slider 与 number 类型用。
            三个输入都用 type="number"，值为空时转 undefined（表示「无限制」），
            而不是写 0——0 对 min 是合法值（下限就是 0），
            对「无限制」则是错误语义，所以必须区分空与 0。
            Default 字段类型是 string（可为任意值），所以不用 type="number"，
            避免用户想填字符串默认值时被数字输入框拦截。 */}
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

      {/* 底部行：Options 输入框 + 「高级」开关 + 删除按钮。
          Options 只对 select 类型有效（下拉框候选值），用逗号分隔字符串输入，
          和 ModelEditor 里的比例/尺寸/标签同一套路，便于自由编辑。
          「高级」开关把参数标记为 advanced：工作台渲染时可以折叠进「高级参数」分组，
          让新手界面保持简洁。删除按钮用 ghost + danger 图标，不写文字，
          因为每行都有、纵向紧凑——鼠标悬停Trash 即可确认含义。 */}
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
  /**
   * ServiceConfig — 「服务配置」Tab 的内容，编辑服务级字段。
   *
   * 和 ModelEditor 的区别：ModelEditor 管模型（参数 Schema 的源头），
   * 这里管服务（适配器类型、Base URL、状态、Key、是否推荐）。
   * 服务是模型的容器——改 Base URL 会影响其下所有模型的请求地址，
   * 所以这个 Tab 默认不激活（Tabs defaultValue="models"），
   * 用户主动切过去才会改，避免误改影响面大。
   *
   * apiKey 另用独立 state 而不是 draft 的一部分：
   * 密钥是敏感字段，编辑完就清空（setApiKey("")），不在前端多留一份；
   * placeholder 显示 service.apiKeyMasked（后端脱敏后的值，如 sk-****），
   * 让用户知道当前绑了 key、且知道要不要覆盖。
   * 只有输入了新值才随 body 上报（if (apiKey) body.apiKey = apiKey），
   * 不输入就走后端原值， PATCH 部分更新不会覆盖。
   */
  const qc = useQueryClient();
  const [draft, setDraft] = useState<AiService>({ ...service });
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * update — 合并服务字段到 draft，和 ModelEditor.updateField 同一套写法。
   */
  const update = (patch: Partial<AiService>) =>
    setDraft((d) => ({ ...d, ...patch }));

  /**
   * save — 保存服务配置。PATCH /api/admin/services/{id}，body 合并 draft + 新 apiKey（如有）。
   * 成功后 invalidate ["admin-service"]：详情页的标题、Base URL、服务状态 Badge 一起刷新。
   * 清空 apiKey 是为了：密钥一旦提交就留在后端，前端不再持有，
   * 下次进来仍然显示 masked 占位，符合安全习惯。
   * try/finally 保证 saving 复位。
   */
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
      {/* API Key (覆盖) — 密钥输入框。
          type="password" 让输入内容掩码显示；placeholder 用 service.apiKeyMasked
          （后端脱敏值，如 sk-****）占位，用户一眼知道当前已绑定 key。
          value 单独存 apiKey state，不放进 draft：避免密钥长期在前端内存里留存。
          输入为空时 save() 不上报 apiKey，PATCH 部分更新不会动后端原值。
          下方 p 标签始终显示当前脱敏值，作为「现在绑了什么」的只读回显。 */}
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
      {/* 底部操作栏：border-t + pt-3 与上面表单分区，右对齐一个保存按钮。
          左侧不放取消：draft 是本地副本，关掉 Tab 或跳走都不会污染缓存，
          不需要显式取消按钮，节省纵向空间。 */}
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
  /**
   * AddModelDialog — 「添加模型」弹窗，由 MODELS TAB 工具栏的 + 按钮打开。
   *
   * 它只负责创建模型的「壳」——显示名、modelId、描述、价格、批量；
   * 参数 Schema、比例、尺寸等留到创建后的 ModelEditor 里配（底部小字也是这个提示）。
   * 为什么拆两步：参数 Schema 是模型的核心配置，一旦创建就该有，
   * 在弹窗里一次性塞太多字段会很难看；先建壳、再进编辑器，流程更清晰。
   *
   * serviceId 由父组件传入而不是从 URL 取：详情页的 id 是服务 id，
   * 这里语义上是「往哪个服务里加」，显式传参比从路径字符串再解析一次更直白。
   */
  const qc = useQueryClient();
  const [form, setForm] = useState({
    displayName: "",
    modelId: "",
    description: "",
    priceCredits: 2,
    maxBatch: 1,
  });
  const [saving, setSaving] = useState(false);

  /**
   * submit — POST /api/admin/models，body 把 form 展开并附上 serviceId。
   * 成功后：invalidate ["admin-service"]（模型列表立即多一行）、
   * 关闭弹窗、重置 form 到初始值（避免下次打开残留上一次的输入）。
   * 重置放在 onOpenChange(false) 之后：先关窗再清表单，用户看不到清空动画。
   * try/finally 保证 saving 复位，避免网络异常时按钮永久禁用。
   */
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
          {/* 底部提示：明说创建后还要做什么，管理用户对后续步骤的预期，
              避免他以为建完就能直接在工作台调参。 */}
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
          {/* 创建按钮的唯一必填校验是 displayName：
              modelId 后端可以自己生成/推导，描述可空，价格/批量有默认值。
              用 disabled 而不是 submit 后再 reject：用户根本点不动，体验更干净。 */}
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
  /**
   * Field — 表单字段的 label + 输入框容器。纯展示组件，无状态。
   *
   * 把「Label + 间距」抽出来避免每个输入框重复写 className，
   * 同时统一 label 的颜色（text-ink-3 灰）与字号。
   * tiny 参数只在参数编辑器这种紧凑场景用（10px），否则 12px，
   * 一处控制全表字号，比散落在各处写 text-[11px] 好维护。
   */
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
