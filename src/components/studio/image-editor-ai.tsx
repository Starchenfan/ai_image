"use client";

import { useState } from "react";
import { Sparkles, Loader2, ChevronDown, ImagePlus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ImageEditOperation, AiModel, AiService } from "@/lib/types";

export type { ImageEditOperation };

const OPERATIONS: Array<{
  id: ImageEditOperation;
  label: string;
  description: string;
  needsMask: boolean;
}> = [
  { id: "inpaint", label: "局部重绘", description: "涂抹区域后重新生成", needsMask: true },
  { id: "remove", label: "删除对象", description: "擦除画面中的物体", needsMask: true },
  { id: "add", label: "添加物体", description: "在指定区域添加新内容", needsMask: true },
  { id: "replace", label: "替换对象", description: "替换选中区域的内容", needsMask: true },
  { id: "background", label: "换背景", description: "更换背景，无需 mask", needsMask: false },
  { id: "outpaint", label: "扩图", description: "向四周扩展画面", needsMask: false },
  { id: "restore", label: "修复", description: "修复瑕疵或划痕", needsMask: true },
  { id: "upscale", label: "超分", description: "提升分辨率（2x/4x）", needsMask: false },
];

interface ImageEditorAIPanelProps {
  models: AiModel[];
  services: AiService[];
  selectedServiceId: string;
  selectedModelId: string;
  onServiceChange: (id: string) => void;
  onModelChange: (id: string) => void;
  onGenerate: (params: {
    operation: ImageEditOperation;
    prompt: string;
    negativePrompt: string;
    modelId: string;
    serviceId: string;
    strength: number;
    outpaintDirection: string;
    upscaleFactor: 2 | 4;
  }) => void;
  generating: boolean;
}

export function ImageEditorAIPanel({
  models,
  services,
  selectedServiceId,
  selectedModelId,
  onServiceChange,
  onModelChange,
  onGenerate,
  generating,
}: ImageEditorAIPanelProps) {
  const [operation, setOperation] = useState<ImageEditOperation>("inpaint");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [strength, setStrength] = useState(0.75);
  const [outpaintDirection, setOutpaintDirection] = useState("all");
  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const availableModels = models.filter((m) => m.serviceId === selectedServiceId && m.enabled);

  const needsMask = OPERATIONS.find((o) => o.id === operation)?.needsMask ?? false;

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    onGenerate({
      operation,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      modelId: selectedModelId,
      serviceId: selectedServiceId,
      strength,
      outpaintDirection,
      upscaleFactor,
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* 操作类型 */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-2">编辑操作</label>
        <div className="grid grid-cols-2 gap-1.5">
          {OPERATIONS.map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => setOperation(op.id)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-left transition-all",
                operation === op.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-paper-2 text-ink-2 hover:border-paper-4"
              )}
            >
              <div className="text-xs font-medium">{op.label}</div>
              <div className="text-[10px] text-ink-3">{op.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 模型选择 */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-2">模型</label>
        <div className="flex gap-2">
          <select
            value={selectedServiceId}
            onChange={(e) => {
              onServiceChange(e.target.value);
              const firstModel = models.find((m) => m.serviceId === e.target.value && m.enabled);
              if (firstModel) onModelChange(firstModel.id);
            }}
            className="flex-1 rounded-md border border-line bg-paper-2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          >
            {services
              .filter((s) => s.status === "online")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <select
            value={selectedModelId}
            onChange={(e) => onModelChange(e.target.value)}
            className="flex-1 rounded-md border border-line bg-paper-2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-2">
          {needsMask ? "编辑指令" : "描述"}
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            needsMask
              ? "描述想要在选中区域生成的内容..."
              : "描述想要生成的画面..."
          }
          rows={2}
          className="w-full resize-none rounded-md border border-line bg-paper-2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
        />
      </div>

      {/* 负面提示词 */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-2">负面提示词（可选）</label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="不希望出现的内容..."
          rows={1}
          className="w-full resize-none rounded-md border border-line bg-paper-2 px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
        />
      </div>

      {/* 高级参数 */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", showAdvanced && "rotate-180")} />
          高级参数
        </button>
        {showAdvanced && (
          <div className="mt-2 space-y-2">
            <div>
              <label className="mb-1 block text-[10px] text-ink-3">
                编辑强度: {strength.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
            {operation === "outpaint" && (
              <div>
                <label className="mb-1 block text-[10px] text-ink-3">扩图方向</label>
                <select
                  value={outpaintDirection}
                  onChange={(e) => setOutpaintDirection(e.target.value)}
                  className="w-full rounded-md border border-line bg-paper-2 px-2 py-1 text-xs text-ink"
                >
                  <option value="all">四周</option>
                  <option value="up">上方</option>
                  <option value="down">下方</option>
                  <option value="left">左侧</option>
                  <option value="right">右侧</option>
                </select>
              </div>
            )}
            {operation === "upscale" && (
              <div>
                <label className="mb-1 block text-[10px] text-ink-3">超分倍数</label>
                <div className="flex gap-1.5">
                  {([2, 4] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setUpscaleFactor(f)}
                      className={cn(
                        "flex-1 rounded-md border px-2 py-1 text-xs",
                        upscaleFactor === f
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-line bg-paper-2 text-ink-2"
                      )}
                    >
                      {f}x
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !prompt.trim()}
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-all",
          generating || !prompt.trim()
            ? "cursor-not-allowed bg-ink-3 text-paper-3"
            : "bg-accent text-accent-ink hover:opacity-90"
        )}
      >
        {generating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            生成中...
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            生成
          </>
        )}
      </button>

      {needsMask && (
        <p className="text-[10px] text-ink-3">
          💡 选择「画笔」工具在画布上涂抹编辑区域，然后点击生成
        </p>
      )}
    </div>
  );
}