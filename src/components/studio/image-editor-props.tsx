"use client";

import { useState } from "react";
import { memo } from "react";
import {
  Download,
  Image as ImageIcon,
  Sliders,
  Film,
  Layers,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { AiModel, AiService } from "@/lib/types";
import type { ImageEditOperation } from "./image-editor-ai";
import { ImageEditorAIPanel } from "./image-editor-ai";
import { ImageEditorLayers, type Layer } from "./image-editor-layers";

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sharpen: number;
}

export type FilterPresetKey =
  | "none"
  | "grayscale"
  | "sepia"
  | "vintage"
  | "film"
  | "cool"
  | "warm";

const FILTERS: Array<{ id: FilterPresetKey; label: string }> = [
  { id: "none", label: "无" },
  { id: "grayscale", label: "黑白" },
  { id: "sepia", label: "复古" },
  { id: "vintage", label: "胶片" },
  { id: "film", label: "电影" },
  { id: "cool", label: "冷色" },
  { id: "warm", label: "暖色" },
];

const TABS: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: "ai", label: "AI编辑", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "adjust", label: "调整", icon: <Sliders className="h-3.5 w-3.5" /> },
  { id: "filter", label: "滤镜", icon: <Film className="h-3.5 w-3.5" /> },
  { id: "layers", label: "图层", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "export", label: "导出", icon: <Download className="h-3.5 w-3.5" /> },
];

interface Props {
  // AI 编辑
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
  aiResult: string | null;
  aiError: string | null;
  onApplyAI: () => void;
  onClearAI: () => void;

  // 调整
  adjustments: Adjustments;
  onAdjustmentsChange: (a: Partial<Adjustments>) => void;

  // 滤镜
  filter: FilterPresetKey;
  onFilterChange: (f: FilterPresetKey) => void;

  // 图层
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;

  // 导出
  onExport: (format: "png" | "jpeg" | "webp") => void;

  // 上下文感知工具参数
  tool: string;
  brushColor: string;
  brushSize: number;
  onBrushColorChange: (c: string) => void;
  onBrushSizeChange: (s: number) => void;
  textColor: string;
  onTextColorChange: (c: string) => void;
  fontSize: number;
  onFontSizeChange: (s: number) => void;
  shapeType: "rect" | "circle" | "line" | "arrow";
  onShapeTypeChange: (t: "rect" | "circle" | "line" | "arrow") => void;
  shapeColor: string;
  onShapeColorChange: (c: string) => void;
  lineWidth: number;
  onLineWidthChange: (w: number) => void;
  cropAspectRatio: string;
  onCropAspectRatioChange: (r: string) => void;
  onShapeCommit?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onTextCommit?: (x: number, y: number, text: string) => void;
}

export const ImageEditorPropsPanel = memo(function ImageEditorPropsPanel({
  models,
  services,
  selectedServiceId,
  selectedModelId,
  onServiceChange,
  onModelChange,
  onGenerate,
  generating,
  aiResult,
  aiError,
  onApplyAI,
  onClearAI,
  adjustments,
  onAdjustmentsChange,
  filter,
  onFilterChange,
  layers,
  onLayersChange,
  onExport,
  tool,
  brushColor,
  brushSize,
  onBrushColorChange,
  onBrushSizeChange,
  textColor,
  onTextColorChange,
  fontSize,
  onFontSizeChange,
  shapeType,
  onShapeTypeChange,
  shapeColor,
  onShapeColorChange,
  lineWidth,
  onLineWidthChange,
  cropAspectRatio,
  onCropAspectRatioChange,
  onShapeCommit,
  onTextCommit,
}: Props) {
  const [activeTab, setActiveTab] = useState("ai");

  return (
    <div className="flex h-full flex-col">
      {/* 标签栏 */}
      <div className="flex items-center border-b border-line px-2 py-1">
        <div className="flex gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-all",
                activeTab === tab.id
                  ? "bg-accent/10 text-accent"
                  : "text-ink-3 hover:bg-paper-4 hover:text-ink"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 标签内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "ai" && (
          <div className="space-y-2 p-2">
            <ImageEditorAIPanel
              models={models}
              services={services}
              selectedServiceId={selectedServiceId}
              selectedModelId={selectedModelId}
              onServiceChange={onServiceChange}
              onModelChange={onModelChange}
              onGenerate={onGenerate}
              generating={generating}
            />
            {aiError && (
              <div className="rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5 text-xs text-danger">
                {aiError}
              </div>
            )}
            {aiResult && (
              <div className="space-y-1.5 rounded-md border border-line p-2">
                <div className="text-xs font-medium text-ink">编辑结果</div>
                <img
                  src={aiResult}
                  alt="result"
                  className="w-full rounded-md border border-line"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={onApplyAI}
                    className="flex-1 rounded-md bg-accent px-2 py-1.5 text-xs text-accent-ink hover:opacity-90"
                  >
                    应用
                  </button>
                  <button
                    type="button"
                    onClick={onClearAI}
                    className="rounded-md border border-line px-2 py-1.5 text-xs text-ink-2 hover:bg-paper-4"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "adjust" && (
          <div className="space-y-2 p-2">
            {/* 上下文感知工具参数 */}
            {tool === "brush" && (
              <ToolSection title="画笔">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-ink-3">颜色</label>
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => onBrushColorChange(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-ink-3">大小</label>
                      <span className="text-[10px] text-ink-3">{brushSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={60}
                      value={brushSize}
                      onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>
                </div>
              </ToolSection>
            )}

            {tool === "eraser" && (
              <ToolSection title="橡皮擦">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-ink-3">大小</label>
                    <span className="text-[10px] text-ink-3">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={brushSize}
                    onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
              </ToolSection>
            )}

            {tool === "shape" && (
              <ToolSection title="形状">
                <div className="space-y-1.5">
                  <div>
                    <label className="mb-1 block text-[10px] text-ink-3">类型</label>
                    <div className="grid grid-cols-4 gap-1">
                      {(["rect", "circle", "line", "arrow"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => onShapeTypeChange(t)}
                          className={cn(
                            "rounded-md border px-1.5 py-1 text-[10px] transition-all",
                            shapeType === t
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-line bg-paper-2 text-ink-2 hover:border-paper-4"
                          )}
                        >
                          {t === "rect" ? "矩形" : t === "circle" ? "圆形" : t === "line" ? "直线" : "箭头"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-ink-3">颜色</label>
                    <input
                      type="color"
                      value={shapeColor}
                      onChange={(e) => onShapeColorChange(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-ink-3">线宽</label>
                      <span className="text-[10px] text-ink-3">{lineWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={lineWidth}
                      onChange={(e) => onLineWidthChange(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>
                </div>
              </ToolSection>
            )}

            {tool === "text" && (
              <ToolSection title="文字">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-ink-3">颜色</label>
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => onTextColorChange(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-ink-3">字号</label>
                      <span className="text-[10px] text-ink-3">{fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={72}
                      value={fontSize}
                      onChange={(e) => onFontSizeChange(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>
                </div>
              </ToolSection>
            )}

            {tool === "crop" && (
              <ToolSection title="裁剪比例">
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { id: "free", label: "自由" },
                    { id: "1:1", label: "1:1" },
                    { id: "4:3", label: "4:3" },
                    { id: "16:9", label: "16:9" },
                    { id: "3:2", label: "3:2" },
                    { id: "9:16", label: "9:16" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onCropAspectRatioChange(r.id)}
                      className={cn(
                        "rounded-md border px-1.5 py-1 text-[10px] transition-all",
                        cropAspectRatio === r.id
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-line bg-paper-2 text-ink-2 hover:border-paper-4"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </ToolSection>
            )}

            {/* 调整滑块 — 始终显示 */}
            <ToolSection title="图像调整">
              <div className="space-y-1.5">
                <Slider label="亮度" value={adjustments.brightness} min={0} max={200} step={1}
                  onChange={(v) => onAdjustmentsChange({ brightness: v })} />
                <Slider label="对比度" value={adjustments.contrast} min={0} max={200} step={1}
                  onChange={(v) => onAdjustmentsChange({ contrast: v })} />
                <Slider label="饱和度" value={adjustments.saturation} min={0} max={200} step={1}
                  onChange={(v) => onAdjustmentsChange({ saturation: v })} />
                <Slider label="色相" value={adjustments.hue} min={0} max={360} step={1}
                  onChange={(v) => onAdjustmentsChange({ hue: v })} />
                <Slider label="模糊" value={adjustments.blur} min={0} max={10} step={0.1}
                  onChange={(v) => onAdjustmentsChange({ blur: v })} />
                <Slider label="锐化" value={adjustments.sharpen} min={0} max={100} step={1}
                  onChange={(v) => onAdjustmentsChange({ sharpen: v })} />
              </div>
            </ToolSection>
          </div>
        )}

        {activeTab === "filter" && (
          <div className="space-y-2 p-2">
            <div className="text-xs font-medium text-ink-2">滤镜预设</div>
            <div className="grid grid-cols-4 gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilterChange(f.id)}
                  className={cn(
                    "rounded-md border px-1.5 py-1.5 text-[10px] transition-all",
                    filter === f.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line bg-paper-2 text-ink-2 hover:border-paper-4"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "layers" && (
          <div className="p-2">
            <ImageEditorLayers
              layers={layers}
              onChange={onLayersChange}
            />
          </div>
        )}

        {activeTab === "export" && (
          <div className="space-y-3 p-2">
            <div className="text-xs font-medium text-ink-2">导出设置</div>

            {/* 格式 */}
            <div>
              <label className="mb-1 block text-[10px] text-ink-3">格式</label>
              <div className="grid grid-cols-3 gap-1">
                {(["png", "jpeg", "webp"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => onExport(fmt)}
                    className="flex flex-col items-center gap-0.5 rounded-md border border-line bg-paper-2 px-1.5 py-2 text-[10px] text-ink-2 transition-all hover:border-accent hover:text-accent"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* 尺寸 */}
            <div>
              <label className="mb-1 block text-[10px] text-ink-3">尺寸</label>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { id: "original", label: "原始" },
                  { id: "1x", label: "1x" },
                  { id: "2x", label: "2x" },
                  { id: "4x", label: "4x" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="rounded-md border border-line bg-paper-2 px-1.5 py-1 text-[10px] text-ink-2 transition-all hover:border-paper-4"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 质量 */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-ink-3">质量</label>
                <span className="text-[10px] text-ink-3">90%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                defaultValue={90}
                className="w-full accent-accent"
              />
            </div>

            <div className="text-[10px] text-ink-3">
              PNG 支持透明通道，JPEG 不支持透明（需白色背景）。WebP 兼顾体积与画质。
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// ── 子组件 ──

function ToolSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line">
      <div className="border-b border-line px-2 py-1 text-[10px] font-medium text-ink-3">
        {title}
      </div>
      <div className="space-y-1.5 p-2">{children}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-ink-3">{label}</label>
        <span className="text-[10px] text-ink-3">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}