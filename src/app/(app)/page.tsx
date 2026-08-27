"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Layers } from "lucide-react";
import { useStudio } from "@/lib/store";
import { ServiceSelect } from "@/components/studio/service-select";
import { ModelSelect } from "@/components/studio/model-select";
import { PromptInput } from "@/components/studio/prompt-input";
import { ParamPanel } from "@/components/studio/param-panel";
import { AdvancedParams } from "@/components/studio/dynamic-field";
import { PresetBar } from "@/components/studio/preset-bar";
import { ReferenceImageUpload } from "@/components/studio/reference-image";
import { GenerateButton } from "@/components/studio/generate-button";
import { TaskStatus } from "@/components/studio/task-status";
import { ResultGrid } from "@/components/studio/result-grid";
import { CompareBoard, type CompareEntry } from "@/components/studio/compare-board";
import type { AiModel, GenerateTask } from "@/lib/types";

// fetchModel — 按 modelId 拉取单个模型的完整定义（含参数 Schema）。
// 之所以单独抽出来而不是复用 /api/models 列表接口，是因为工作台需要的是
// 「这个模型有哪些参数、默认值多少」，列表接口通常不含这些细节。
async function fetchModel(id: string) {
  const r = await fetch(`/api/models/${id}`);
  return (await r.json()).model as AiModel;
}

/**
 * StudioPage — 工作台主页，绘界的核心页面（/）。
 *
 * 布局：左侧 360px 固定参数轨 + 右侧自适应画布，lg 以上屏 grid 布局，
 * 高度锁定为视口减去顶栏（100dvh - 5.75rem），避免参数轨与画布在长页里被各自撑开。
 *
 * 用户怎么用：从左到下读一遍参数轨（服务 → 模型 → Prompt → 参考图 → 参数 → 预设 → 高级参数），
 * 点底部「生成」，右侧画布切换到 TaskStatus 轮询状态，完成后展示 ResultGrid。
 * 右上角的 A/B 对比模式会一次性 fan-out 多个模型，走 CompareBoard 并排对比。
 *
 * 和其他页面的关系：它是所有「生成动作」的终点站——/history 的「复用」、
 * /explore 的「复用 Prompt」、/stats 的空状态入口都跳回这里；
 * 它自身不持久化结果，结果存在 zustand store 里，刷新页面就丢，
 * 想找回就去 /history。
 */
export default function StudioPage() {
  const modelId = useStudio((s) => s.modelId);
  const activeTaskId = useStudio((s) => s.activeTaskId);
  const results = useStudio((s) => s.results);
  const set = useStudio((s) => s.set);
  const buildRequest = useStudio((s) => s.buildRequest);
  const compareMode = useStudio((s) => s.compareMode);
  const compareIds = useStudio((s) => s.compareIds);
  const prompt = useStudio((s) => s.prompt);
  const [genError, setGenError] = useState<string | null>(null);
  const [compareEntries, setCompareEntries] = useState<CompareEntry[] | null>(null);

  // model：当前选中模型的完整定义。enabled 跟踪 modelId，切模型时自动重取；
  // 参数轨里的「动态参数」区块（AdvancedParams）依赖这个 data 才能渲染。
  const { data: model } = useQuery({
    queryKey: ["model", modelId],
    queryFn: () => fetchModel(modelId!),
    enabled: !!modelId,
  });

  /**
   * handleGenerate — 生成按钮的唯一入口，整个工作台的「动作枢纽」。
   *
   * 它在流程里的角色：把 store 里的表单状态（prompt/参数/参考图）组装成请求体，
   * 分两条路径发出，然后把结果「交回给画布」——要么记下 activeTaskId 让
   * TaskStatus 去轮询，要么直接把多任务结果交给 CompareBoard。
   *
   * 副作用：会清空 genError、清空 results、可能设置 activeTaskId / compareEntries。
   * 两条路径互斥（compareMode 且选了 >=2 模型走 fan-out，否则走单模型），
   * 走完一条就 return，不会重复提交。
   */
  const handleGenerate = async () => {
    const req = buildRequest();
    if (!req) return;
    setGenError(null);
    set("results", null);

    // Compare mode — 对比模式：一次性 fan-out 多个模型，共用同一份 prompt + 参数。
    // 之所以先取一次 /api/models 拿 displayName 映射，是因为 /api/generate 只回 taskId，
    // 不带模型名；错误提示里需要展示「哪个模型失败了」，所以要提前建 id→名称表。
    // 逐个串行提交（而非 Promise.all）：单个失败时能精确定位到具体模型并抛出可读错误，
    // 而不是让多个请求同时挂掉、用户分不清是哪个。
    if (compareMode && compareIds.length >= 2) {
      setCompareEntries(null);
      set("activeTaskId", null);
      try {
        const modelsRes = await fetch(`/api/models?serviceId=${req.serviceId}`);
        const modelsData = (await modelsRes.json()) as { models: AiModel[] };
        const nameOf = new Map(modelsData.models.map((m) => [m.id, m.displayName]));
        const entries: CompareEntry[] = [];
        for (const id of compareIds) {
          const r = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...req, modelId: id }),
          });
          if (!r.ok) {
            const err = (await r.json()) as { error?: string };
            throw new Error(`${nameOf.get(id) ?? id}: ${err.error || r.status}`);
          }
          const d = (await r.json()) as { task: GenerateTask };
          entries.push({ modelName: nameOf.get(id) ?? id, taskId: d.task.id });
        }
        setCompareEntries(entries);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    // Single model — 单模型路径：提交一次生成，拿到 taskId 后存进 store，
    // 剩下的轮询与状态展示全部交给右侧的 TaskStatus 组件。
    // 错误信息直接取后端的 error 字段，后端没有时退回 HTTP 状态码，保证用户看得见「为什么失败」。
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!r.ok) {
        const err = (await r.json()) as { error?: string };
        throw new Error(err.error || `请求失败 (${r.status})`);
      }
      const data = (await r.json()) as { task: GenerateTask };
      set("activeTaskId", data.task.id);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * handleDone — TaskStatus 轮询到终态时的回调，画布侧的「状态收敛器」。
   *
   * 角色：它不发起请求，只负责把 task 的终态翻译成 store 里的画布内容。
   * 成功 → results 存下完整 task（含图片 URL），画布切到 ResultGrid；
   * 失败 → genError 记录错误信息，画布顶部横幅展示，用户可点「重试」；
   * 无论成败都先把 activeTaskId 清空，否则 TaskStatus 会一直转圈。
   */
  const handleDone = (task: GenerateTask) => {
    set("activeTaskId", null);
    if (task.status === "completed") {
      set("results", task);
    } else if (task.status === "failed") {
      // Surface the failure on the canvas so the user sees why + can retry.
      setGenError(task.errorMessage || "生成失败,请重试");
    }
  };

  /**
   * handleSwitchService — TaskStatus 失败时「换服务」按钮的回调。
   *
   * 生成失败后用户常想「换个服务再试一次」，但任务已经结束、画布还停在失败态，
   * 直接让用户回左侧参数轨找服务下拉框体验割裂。所以这里做三件事：
   * 清掉 activeTaskId（退出轮询态）、清掉 genError（清掉错误横幅），
   * 再把左侧参数轨的服务区块平滑滚入视野——用户看到的就是「参数轨已就位，直接换服务」。
   */
  const handleSwitchService = () => {
    // open service dropdown by re-selecting — simplest: nudge user to left panel
    set("activeTaskId", null);
    setGenError(null);
    document.getElementById("service-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-5.75rem)] lg:min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* 左侧 — 参数轨。用「实心抬升卡片」而非 backdrop-filter 模糊来做视觉分割：
          模糊表面会在滚动/动画的每一帧重绘，是「卡顿感」的主要来源；
          paper-2 叠在 paper 底色上，仅靠边框 + 阴影就能把参数轨和画布分开，
          视觉层次一样强，但零运行时开销。
          卡片内部纵向分为两段：上面是可滚动的参数区（服务→模型→Prompt→参考图→
          参数→预设→高级参数，按依赖顺序排列），下面是固定的「生成」按钮，
          所以用户无论如何滚参数轨，按钮永远在手指能碰到的位置。 */}
      <aside className="min-h-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-paper-2">
          <div className="space-y-5 overflow-y-auto p-4 pb-6">
            <div id="service-section">
              <ServiceSelect />
            </div>
            <Divider />
            <ModelSelect />
            <Divider />
            <PromptInput />
            <Divider />
            <ReferenceImageUpload />
            <Divider />
            <ParamPanel />
            <Divider />
            <PresetBar />
            {model && model.parameters.length > 0 && (
              <>
                <Divider />
                <AdvancedParams fields={model.parameters} />
              </>
            )}
          </div>
          <div className="shrink-0 border-t border-line bg-paper-2 p-3 shadow-[0_-12px_28px_var(--color-paper-2)]">
            <GenerateButton onGenerate={handleGenerate} />
          </div>
        </div>
      </aside>

      {/* 右侧 — 画布 / 结果区。它是一个「四态状态机」，靠 store + 本地 state 驱动，
          优先级从上往下判定，命中即止：
            1. genError         → 顶部红色横幅（同步错误，打断后续所有分支）
            2. compareEntries   → A/B 对比面板（对比模式 fan-out 成功的结果）
            3. activeTaskId     → TaskStatus 轮询中（生成已提交，等待后端完成）
            4. results          → 已完成的结果，展示 ResultGrid
            5. 否则              → EmptyState 空画布，引导用户开始第一张生成
          这个顺序是刻意的：进行中的任务优先级高于已完成的结果，
          避免用户刚点完生成就看到上一次的旧图。 */}
      <section className="min-h-[60vh] rounded-lg border border-line bg-paper-2/60 p-4 md:p-6 lg:min-h-0 lg:overflow-y-auto">
        {genError && (
          <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger animate-fade-in">
            {genError}
          </div>
        )}

        {compareEntries ? (
          <CompareBoard entries={compareEntries} prompt={prompt} />
        ) : activeTaskId ? (
          <TaskStatus
            taskId={activeTaskId}
            onDone={handleDone}
            onRetry={handleGenerate}
            onSwitchService={handleSwitchService}
          />
        ) : results ? (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-ink">生成结果</h2>
                <p className="text-xs text-ink-3">
                  {results.images.length} 张 · {results.model?.displayName} ·{" "}
                  {results.request.size}
                </p>
              </div>
            </div>
            <ResultGrid task={results} />
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  );
}

// Divider — 参数轨内各区块间的细线分隔。纯视觉元素，无逻辑，抽成组件避免重复 JSX。
function Divider() {
  return <div className="h-px bg-line" />;
}

/**
 * EmptyState — 工作台的「零状态」画布。用户首次进入 / 或清掉所有结果后看到的就是它。
 *
 * 设计分三层：图标（占位符号）→ 引导文案（告诉用户下一步做什么）→
 * 胶囊 badge（点明产品能力：多服务 + 多模型 + 动态参数 Schema）。
 * 整体居中、min-h-[50vh]，保证在短屏上也不会贴顶，留出呼吸感。
 */
function EmptyState() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-md border border-line bg-paper-2">
        <ImagePlus className="h-7 w-7 text-ink-3" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-2">画布等待你的想法</p>
        <p className="max-w-xs text-xs text-ink-3">
          选择模型，写下 Prompt，点击生成。复杂 API 配置全部隐藏在后台。
        </p>
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper-3/40 px-3 py-1 text-xs text-ink-3">
        <Layers className="h-3 w-3 text-accent" />
        支持 多服务 + 多模型 + 动态参数 Schema
      </div>
    </div>
  );
}
