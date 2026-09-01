"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Download, Eye, EyeOff, ChevronLeft, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ImageEditorCanvas, type CanvasTransform, type CropRect, type Adjustments } from "./image-editor-canvas";
import { Toolbar, type DrawTool, type FilterPresetKey } from "./image-editor-toolbar";
import { ImageEditorPropsPanel } from "./image-editor-props";
import { ImageEditorLayers, type Layer } from "./image-editor-layers";
import type { AiModel, AiService } from "@/lib/types";
import type { ImageEditOperation } from "./image-editor-ai";

// ── 类型 ──

interface HistoryState {
  imageCanvas: HTMLCanvasElement | null;
  overlayCanvas: HTMLCanvasElement | null;
  maskCanvas: HTMLCanvasElement | null;
}

// ── 组件 ──

interface ImageEditorProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  models: AiModel[];
  services: AiService[];
  onClose: () => void;
  onApply: (resultUrl: string) => void;
  onExport: (url: string, format: string) => void;
}

export function ImageEditor({
  imageSrc,
  imageWidth,
  imageHeight,
  models,
  services,
  onClose,
  onApply,
  onExport,
}: ImageEditorProps) {
  // ── 状态 ──
  const [htmlImage, setHtmlImage] = useState<HTMLImageElement | null>(null);
  const [transform, setTransform] = useState<CanvasTransform>({
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [tool, setTool] = useState<DrawTool>("select");
  const [brushColor, setBrushColor] = useState("#ff0000");
  const [brushSize, setBrushSize] = useState(20);
  const [textColor, setTextColor] = useState("#ffffff");
  const [fontSize, setFontSize] = useState(24);
  const [shapeType, setShapeType] = useState<"rect" | "circle" | "line" | "arrow">("rect");
  const [shapeColor, setShapeColor] = useState("#35c9ff");
  const [lineWidth, setLineWidth] = useState(3);
  const [cropAspectRatio, setCropAspectRatio] = useState("free");
  const [adjustments, setAdjustments] = useState<Adjustments>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    sharpen: 0,
  });
  const [filter, setFilter] = useState<FilterPresetKey>("none");
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiResults, setAiResults] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState(
    services.find((s) => s.status === "online")?.id ?? services[0]?.id ?? ""
  );
  const [selectedModelId, setSelectedModelId] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [comparePos, setComparePos] = useState(50);
  const [compareResult, setCompareResult] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [layers, setLayers] = useState<Layer[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 加载图片 ──
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setHtmlImage(img);
    };
    img.onerror = () => {
      console.error("[editor] 图片加载失败:", imageSrc);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // ── 初始化内部 canvas + 图层 ──
  useEffect(() => {
    if (!htmlImage) return;
    if (!originalImageCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = htmlImage.width;
      c.height = htmlImage.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(htmlImage, 0, 0);
      originalImageCanvasRef.current = c;
      imageCanvasRef.current = c;
    }
    if (!maskCanvasRef.current) {
      const mc = document.createElement("canvas");
      mc.width = htmlImage.width;
      mc.height = htmlImage.height;
      maskCanvasRef.current = mc;
    }
    if (!overlayCanvasRef.current) {
      const oc = document.createElement("canvas");
      oc.width = htmlImage.width;
      oc.height = htmlImage.height;
      overlayCanvasRef.current = oc;
    }
    // 初始化图层
    setLayers([
      { id: "bg", name: "背景", type: "image", visible: true, locked: true, order: 0 },
      { id: "drawing", name: "绘图", type: "brush", visible: true, locked: false, order: 1 },
      { id: "mask", name: "蒙版", type: "mask", visible: false, locked: false, order: 2 },
    ]);
    saveHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlImage]);

  // ── 图层可见性派生 ──
  const showOverlay = layers.find((l) => l.id === "drawing")?.visible ?? true;
  const showMask = layers.find((l) => l.id === "mask")?.visible ?? false;

  // ── 历史 ──
  const saveHistory = useCallback(() => {
    setHistory((h) => {
      const newH = h.slice(0, historyIdx + 1);
      newH.push({
        imageCanvas: imageCanvasRef.current,
        overlayCanvas: overlayCanvasRef.current,
        maskCanvas: maskCanvasRef.current,
      });
      setHistoryIdx(newH.length - 1);
      setCanUndo(newH.length > 1);
      setCanRedo(false);
      return newH;
    });
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const state = history[historyIdx - 1];
    if (state.imageCanvas && imageCanvasRef.current) {
      imageCanvasRef.current.getContext("2d")!.drawImage(state.imageCanvas, 0, 0);
    }
    if (state.overlayCanvas && overlayCanvasRef.current) {
      overlayCanvasRef.current.getContext("2d")!.drawImage(state.overlayCanvas, 0, 0);
    }
    if (state.maskCanvas && maskCanvasRef.current) {
      maskCanvasRef.current.getContext("2d")!.drawImage(state.maskCanvas, 0, 0);
      setMaskDataUrl(maskCanvasRef.current.toDataURL());
    }
    setHistoryIdx(historyIdx - 1);
    setCanUndo(historyIdx - 1 > 0);
    setCanRedo(true);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const state = history[historyIdx + 1];
    if (state.imageCanvas && imageCanvasRef.current) {
      imageCanvasRef.current.getContext("2d")!.drawImage(state.imageCanvas, 0, 0);
    }
    if (state.overlayCanvas && overlayCanvasRef.current) {
      overlayCanvasRef.current.getContext("2d")!.drawImage(state.overlayCanvas, 0, 0);
    }
    if (state.maskCanvas && maskCanvasRef.current) {
      maskCanvasRef.current.getContext("2d")!.drawImage(state.maskCanvas, 0, 0);
      setMaskDataUrl(maskCanvasRef.current.toDataURL());
    }
    setHistoryIdx(historyIdx + 1);
    setCanUndo(true);
    setCanRedo(historyIdx + 1 < history.length - 1);
  }, [history, historyIdx]);

  // ── 应用滤镜到 imageCanvas ──
  const applyFilterToCanvas = useCallback(() => {
    if (!originalImageCanvasRef.current || !imageCanvasRef.current) return;
    const src = originalImageCanvasRef.current;
    const dst = imageCanvasRef.current;
    const ctx = dst.getContext("2d")!;
    ctx.clearRect(0, 0, dst.width, dst.height);

    const parts: string[] = [];
    switch (filter) {
      case "grayscale":
        parts.push("grayscale(100%)");
        break;
      case "sepia":
        parts.push("sepia(50%)");
        break;
      case "vintage":
        parts.push("sepia(40%) saturate(1.3) brightness(1.1) contrast(1.1)");
        break;
      case "film":
        parts.push("contrast(1.2) saturate(0.8) brightness(0.95) hue-rotate(-10deg)");
        break;
      case "cool":
        parts.push("hue-rotate(20deg) saturate(1.1)");
        break;
      case "warm":
        parts.push("hue-rotate(-15deg) saturate(1.2) brightness(1.05)");
        break;
    }
    if (parts.length) ctx.filter = parts.join(" ");
    else ctx.filter = "none";

    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
  }, [filter]);

  useEffect(() => {
    applyFilterToCanvas();
  }, [applyFilterToCanvas]);

  // ── AI 编辑 ──
  const handleAIGenerate = useCallback(
    async (params: {
      operation: ImageEditOperation;
      prompt: string;
      negativePrompt: string;
      modelId: string;
      serviceId: string;
      strength: number;
      outpaintDirection: string;
      upscaleFactor: 2 | 4;
    }) => {
      setGenerating(true);
      setAiError(null);
      setAiResults([]);
      try {
        const body: Record<string, unknown> = {
          image: imageSrc,
          operation: params.operation,
          prompt: params.prompt,
          modelId: params.modelId,
          serviceId: params.serviceId,
          strength: params.strength,
        };
        if (params.negativePrompt) body.negativePrompt = params.negativePrompt;
        if (params.operation === "outpaint") body.outpaintDirection = params.outpaintDirection;
        if (params.operation === "upscale") body.upscaleFactor = params.upscaleFactor;
        if (maskDataUrl) body.mask = maskDataUrl;

        const res = await fetch("/api/image-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setAiError(data.error || "编辑失败");
          return;
        }
        const urls = data.results?.map((r: { url: string }) => r.url) ?? [];
        if (urls.length > 0) {
          setAiResults(urls);
          setCompareResult(urls[0]);
        } else {
          setAiError("未返回图片");
        }
      } catch (e) {
        setAiError(e instanceof Error ? e.message : "网络错误");
      } finally {
        setGenerating(false);
      }
    },
    [imageSrc, maskDataUrl]
  );

  // ── 应用 AI 结果 ──
  const handleApplyAI = useCallback((url?: string) => {
    const target = url ?? compareResult;
    if (!target) return;
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.getContext("2d")!.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    if (maskCanvasRef.current) {
      maskCanvasRef.current.getContext("2d")!.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setMaskDataUrl(null);
    }
    setAiResults([]);
    setCompareResult(null);
    onApply(target);
  }, [compareResult, onApply]);

  const handleClearAI = useCallback(() => {
    setAiResults([]);
    setCompareResult(null);
    setCompareMode(false);
  }, []);

  // ── 导出 ──
  const handleExport = useCallback(
    (format: "png" | "jpeg" | "webp") => {
      const canvas = exportCanvasRef.current;
      if (!canvas) return;
      const mime = format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          onExport(url, format);
        },
        mime,
        format === "webp" ? 0.9 : 0.95
      );
    },
    [onExport]
  );

  // ── 视图操作 ──
  const zoomIn = () => setTransform((t) => ({ ...t, scale: Math.min(t.scale * 1.2, 3) }));
  const zoomOut = () => setTransform((t) => ({ ...t, scale: Math.max(t.scale / 1.2, 0.3) }));
  const resetView = () => setTransform({ scale: 1, rotation: 0, flipX: false, flipY: false });
  const flipX = () => setTransform((t) => ({ ...t, flipX: !t.flipX }));
  const flipY = () => setTransform((t) => ({ ...t, flipY: !t.flipY }));
  const rotLeft = () => setTransform((t) => ({ ...t, rotation: (t.rotation + 90) % 360 }));
  const rotRight = () => setTransform((t) => ({ ...t, rotation: (t.rotation - 90 + 360) % 360 }));

  // ── 图层操作 ──
  const handleLayersChange = (newLayers: Layer[]) => {
    const removedDrawing = layers.find((l) => l.id === "drawing") && !newLayers.find((l) => l.id === "drawing");
    const removedMask = layers.find((l) => l.id === "mask") && !newLayers.find((l) => l.id === "mask");
    if (removedDrawing && overlayCanvasRef.current) {
      overlayCanvasRef.current.getContext("2d")!.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      saveHistory();
    }
    if (removedMask && maskCanvasRef.current) {
      maskCanvasRef.current.getContext("2d")!.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setMaskDataUrl(null);
      saveHistory();
    }
    setLayers(newLayers);
  };

  // ── Before/After 对比拖拽 ──
  const handleCompareDrag = (e: React.MouseEvent) => {
    if (!compareRef.current) return;
    const rect = compareRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setComparePos(Math.max(0, Math.min(100, (x / rect.width) * 100)));
  };

  // ── 键盘快捷键 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCompareMode(false);
        setAiResults([]);
        setCompareResult(null);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "0") {
          e.preventDefault();
          resetView();
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          zoomOut();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resetView, zoomIn, zoomOut]);

  if (!htmlImage) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper-2">
      {/* 顶栏 */}
      <div className="flex items-center justify-between border-b border-line bg-paper-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-paper-4 hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-ink">图片编辑</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="撤销 (Ctrl+Z)"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-all",
              canUndo ? "text-ink-2 hover:bg-paper-4 hover:text-ink" : "cursor-not-allowed text-ink-3/50"
            )}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-all",
              canRedo ? "text-ink-2 hover:bg-paper-4 hover:text-ink" : "cursor-not-allowed text-ink-3/50"
            )}
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (compareResult) {
                setCompareMode(!compareMode);
              }
            }}
            disabled={!compareResult}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all",
              compareMode
                ? "bg-accent text-accent-ink"
                : "text-ink-2 hover:bg-paper-4"
            )}
          >
            {compareMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Before/After
          </button>
          <button
            type="button"
            onClick={() => {
              const url = exportCanvasRef.current?.toDataURL("image/png");
              if (url) onExport(url, "png");
            }}
            className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs text-accent-ink hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧窄工具栏 */}
        <div className="flex flex-col items-center border-r border-line bg-paper-2/50 p-2">
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetView={resetView}
            onFlipX={flipX}
            onFlipY={flipY}
            onRotateLeft={rotLeft}
            onRotateRight={rotRight}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />
        </div>

        {/* 中间画布区域 */}
        <div className="relative flex-1 overflow-auto" style={{ backgroundColor: "#111111" }}>
          <div className="flex min-h-full items-center justify-center p-4">
            <div ref={compareRef} className="relative inline-block" style={{ maxWidth: "100%" }}>
              {compareMode && compareResult ? (
                // Before/After 对比
                <div className="relative">
                  <img
                    src={imageSrc}
                    alt="before"
                    className="block max-w-full rounded-lg"
                    style={{ height: "auto" }}
                  />
                  <div
                    className="absolute inset-0 overflow-hidden rounded-lg"
                    style={{ width: `${comparePos}%` }}
                  >
                    <img
                      src={compareResult}
                      alt="after"
                      className="block h-full w-full object-cover"
                    />
                  </div>
                  <div
                    className="absolute top-0 h-full w-0.5 bg-accent"
                    style={{ left: `${comparePos}%`, transform: "translateX(-50%)" }}
                  >
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
                        <ChevronLeft className="h-4 w-4 rotate-180" />
                      </div>
                    </div>
                  </div>
                  <div
                    className="absolute inset-0 cursor-col-resize"
                    onMouseDown={handleCompareDrag}
                    onMouseMove={(e) => {
                      if (e.buttons === 1) handleCompareDrag(e);
                    }}
                  />
                </div>
              ) : (
                <ImageEditorCanvas
                  image={htmlImage}
                  transform={transform}
                  onTransformChange={setTransform}
                  crop={crop}
                  tool={tool}
                  brushColor={brushColor}
                  brushSize={brushSize}
                  textColor={textColor}
                  fontSize={fontSize}
                  shapeType={shapeType}
                  shapeColor={shapeColor}
                  adjustments={adjustments}
                  filters={{}}
                  textValue={textValue}
                  showOverlay={showOverlay}
                  showMask={showMask}
                  onMaskChange={setMaskDataUrl}
                  onCropChange={setCrop}
                  onExportCanvas={(c) => {
                    exportCanvasRef.current = c;
                  }}
                  onImageCanvasReady={(c) => {
                    imageCanvasRef.current = c;
                  }}
                />
              )}
            </div>
          </div>

          {/* 缩放指示器 */}
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-line bg-paper-2/90 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] text-ink-3">缩放</span>
            <span className="text-xs font-medium text-ink">{Math.round(transform.scale * 100)}%</span>
          </div>

          {/* 蒙版工具栏 — 画笔/橡皮擦时显示 */}
          {(tool === "brush" || tool === "eraser") && maskDataUrl && (
            <div className="absolute left-3 bottom-3 flex items-center gap-1 rounded-md border border-line bg-paper-2/90 p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => {
                  if (maskCanvasRef.current) {
                    maskCanvasRef.current.getContext("2d")!.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                    setMaskDataUrl(null);
                    saveHistory();
                  }
                }}
                title="清除蒙版"
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-paper-4 hover:text-ink"
              >
                清除
              </button>
              <button
                type="button"
                onClick={() => {
                  if (maskCanvasRef.current) {
                    const ctx = maskCanvasRef.current.getContext("2d")!;
                    const data = ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
                    for (let i = 0; i < data.data.length; i += 4) {
                      const v = 255 - data.data[i];
                      data.data[i] = v;
                      data.data[i + 1] = v;
                      data.data[i + 2] = v;
                    }
                    ctx.putImageData(data, 0, 0);
                    setMaskDataUrl(maskCanvasRef.current.toDataURL());
                    saveHistory();
                  }
                }}
                title="反选蒙版"
                className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-paper-4 hover:text-ink"
              >
                反选
              </button>
            </div>
          )}

          {/* AI 结果候选预览 */}
          {aiResults.length > 0 && !compareMode && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <div className="flex gap-2 rounded-lg border border-line bg-paper-2/95 p-2 backdrop-blur-sm">
                {aiResults.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setCompareResult(url);
                      setCompareMode(true);
                    }}
                    className="group relative h-16 w-16 overflow-hidden rounded-md border border-line transition-all hover:border-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`candidate-${i}`} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧标签页属性面板 */}
        <div className="w-80 border-l border-line bg-paper-2">
          <ImageEditorPropsPanel
            models={models}
            services={services}
            selectedServiceId={selectedServiceId}
            selectedModelId={selectedModelId}
            onServiceChange={setSelectedServiceId}
            onModelChange={setSelectedModelId}
            onGenerate={handleAIGenerate}
            generating={generating}
            aiResult={compareResult}
            aiError={aiError}
            onApplyAI={handleApplyAI}
            onClearAI={handleClearAI}
            adjustments={adjustments}
            onAdjustmentsChange={(a) => setAdjustments((prev) => ({ ...prev, ...a }))}
            filter={filter}
            onFilterChange={setFilter}
            layers={layers}
            onLayersChange={handleLayersChange}
            onExport={handleExport}
            tool={tool}
            brushColor={brushColor}
            brushSize={brushSize}
            onBrushColorChange={setBrushColor}
            onBrushSizeChange={setBrushSize}
            textColor={textColor}
            onTextColorChange={setTextColor}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            shapeType={shapeType}
            onShapeTypeChange={setShapeType}
            shapeColor={shapeColor}
            onShapeColorChange={setShapeColor}
            lineWidth={lineWidth}
            onLineWidthChange={setLineWidth}
            cropAspectRatio={cropAspectRatio}
            onCropAspectRatioChange={setCropAspectRatio}
          />
        </div>
      </div>
    </div>
  );
}