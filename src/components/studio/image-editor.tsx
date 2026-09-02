"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Download, Eye, EyeOff, ChevronLeft, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ImageEditorCanvas } from "./image-editor-canvas";
import { Toolbar, type DrawTool } from "./image-editor-toolbar";
import { ImageEditorPropsPanel } from "./image-editor-props";
import { ImageEditorLayers, type Layer } from "./image-editor-layers";
import type { AiModel, AiService } from "@/lib/types";
import type { ImageEditOperation } from "./image-editor-ai";
import type {
  Adjustments,
  CropRect,
  EditorObject,
  FilterPresetKey,
  InteractionState,
  ShapeObject,
  TextObject,
  ViewportTransform,
} from "./image-editor-types";

// ── History ──
// 记录 Document State（可序列化），不记录 Canvas Reference。
// Viewport（zoom/pan/rotation/flip）不属于 Document History。

interface HistoryState {
  crop: CropRect | null;
  maskDataUrl: string | null;
  objects: EditorObject[];
  layers: Layer[];
  adjustments: Adjustments;
  filter: FilterPresetKey;
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
  const [viewport, setViewport] = useState<ViewportTransform>({
    x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false,
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
    brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sharpen: 0,
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
  const [objects, setObjects] = useState<EditorObject[]>([]);

  // 历史记录上限
  const MAX_HISTORY = 20;

  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const comparePosRef = useRef(50);
  const rafCompareRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 加载图片 ──
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setHtmlImage(img);
    img.onerror = () => console.error("[editor] 图片加载失败:", imageSrc);
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

  // ── History ──
  const saveHistory = useCallback(() => {
    setHistory((h) => {
      const newH = h.slice(0, historyIdx + 1);
      newH.push({
        crop: crop ?? null,
        maskDataUrl: maskCanvasRef.current?.toDataURL() ?? null,
        objects: objects.map((o) => ({ ...o } as EditorObject)),
        layers: layers.map((l) => ({ ...l })),
        adjustments: { ...adjustments },
        filter,
      });
      let newIdx = newH.length - 1;
      if (newH.length > MAX_HISTORY) {
        newH.shift();
        newIdx = newH.length - 1;
      }
      setHistoryIdx(newIdx);
      setCanUndo(newH.length > 1);
      setCanRedo(false);
      return newH;
    });
  }, [historyIdx, crop, objects, layers, adjustments, filter]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const state = history[historyIdx - 1];

    // 恢复 crop
    setCrop(state.crop);

    // 恢复 mask
    if (state.maskDataUrl && maskCanvasRef.current) {
      const mc = maskCanvasRef.current;
      const img = new Image();
      img.onload = () => {
        const ctx = mc.getContext("2d")!;
        ctx.clearRect(0, 0, mc.width, mc.height);
        ctx.drawImage(img, 0, 0);
        setMaskDataUrl(state.maskDataUrl);
      };
      img.src = state.maskDataUrl;
    } else if (!state.maskDataUrl && maskCanvasRef.current) {
      const mc = maskCanvasRef.current;
      mc.getContext("2d")!.clearRect(0, 0, mc.width, mc.height);
      setMaskDataUrl(null);
    }

    // 恢复 objects
    setObjects(state.objects.map((o) => ({ ...o } as EditorObject)));

    // 恢复 layers
    setLayers(state.layers.map((l) => ({ ...l })));

    // 恢复 adjustments + filter
    setAdjustments({ ...state.adjustments });
    setFilter(state.filter);

    setHistoryIdx(historyIdx - 1);
    setCanUndo(historyIdx - 1 > 0);
    setCanRedo(true);
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const state = history[historyIdx + 1];

    setCrop(state.crop);

    if (state.maskDataUrl && maskCanvasRef.current) {
      const mc = maskCanvasRef.current;
      const img = new Image();
      img.onload = () => {
        const ctx = mc.getContext("2d")!;
        ctx.clearRect(0, 0, mc.width, mc.height);
        ctx.drawImage(img, 0, 0);
        setMaskDataUrl(state.maskDataUrl);
      };
      img.src = state.maskDataUrl;
    } else if (!state.maskDataUrl && maskCanvasRef.current) {
      const mc = maskCanvasRef.current;
      mc.getContext("2d")!.clearRect(0, 0, mc.width, mc.height);
      setMaskDataUrl(null);
    }

    setObjects(state.objects.map((o) => ({ ...o } as EditorObject)));
    setLayers(state.layers.map((l) => ({ ...l })));
    setAdjustments({ ...state.adjustments });
    setFilter(state.filter);

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
      case "grayscale": parts.push("grayscale(100%)"); break;
      case "sepia": parts.push("sepia(50%)"); break;
      case "vintage": parts.push("sepia(40%) saturate(1.3) brightness(1.1) contrast(1.1)"); break;
      case "film": parts.push("contrast(1.2) saturate(0.8) brightness(0.95) hue-rotate(-10deg)"); break;
      case "cool": parts.push("hue-rotate(20deg) saturate(1.1)"); break;
      case "warm": parts.push("hue-rotate(-15deg) saturate(1.2) brightness(1.05)"); break;
    }
    if (parts.length) ctx.filter = parts.join(" ");
    else ctx.filter = "none";
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
  }, [filter]);

  useEffect(() => {
    applyFilterToCanvas();
  }, [applyFilterToCanvas]);

  // ── 稳定的回调 ──
  const handleImageCanvasReady = useCallback((c: HTMLCanvasElement) => {
    imageCanvasRef.current = c;
  }, []);

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
    setObjects([]);
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
      const canvas = document.createElement("canvas");
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const ctx = canvas.getContext("2d")!;

      if (imageCanvasRef.current) {
        ctx.drawImage(imageCanvasRef.current, 0, 0);
      }
      if (overlayCanvasRef.current) {
        ctx.drawImage(overlayCanvasRef.current, 0, 0);
      }
      // 绘制 objects（shapes + text）到导出画布
      for (const obj of objects) {
        ctx.save();
        ctx.fillStyle = obj.color;
        ctx.strokeStyle = obj.color;
        if (obj.type === "text") {
          ctx.font = `${obj.fontWeight} ${obj.fontSize}px ${obj.fontFamily}`;
          ctx.fillText(obj.text, obj.x, obj.y);
        } else {
          ctx.lineWidth = obj.lineWidth;
          if (obj.type === "rect") {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
          } else if (obj.type === "circle") {
            const cx = obj.x + obj.width / 2;
            const cy = obj.y + obj.height / 2;
            const r = Math.max(obj.width, obj.height) / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (obj.type === "line") {
            ctx.beginPath();
            ctx.moveTo(obj.x, obj.y);
            ctx.lineTo(obj.x + obj.width, obj.y + obj.height);
            ctx.stroke();
          } else if (obj.type === "arrow") {
            const ax = obj.x + obj.width;
            const ay = obj.y + obj.height / 2;
            ctx.beginPath();
            ctx.moveTo(obj.x, obj.y + obj.height / 2);
            ctx.lineTo(ax, ay);
            const ang = Math.atan2(obj.height, obj.width);
            const ah = 12;
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - ah * Math.cos(ang - Math.PI / 6), ay - ah * Math.sin(ang - Math.PI / 6));
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - ah * Math.cos(ang + Math.PI / 6), ay - ah * Math.sin(ang + Math.PI / 6));
            ctx.stroke();
          }
        }
        ctx.restore();
      }

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
    [imageWidth, imageHeight, onExport, objects]
  );

  // ── 视图操作 ──
  const zoomIn = () => setViewport((v) => ({ ...v, scale: Math.min(v.scale * 1.2, 4) }));
  const zoomOut = () => setViewport((v) => ({ ...v, scale: Math.max(v.scale / 1.2, 0.25) }));
  const resetView = () => setViewport({ x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false });
  const flipX = () => setViewport((v) => ({ ...v, flipX: !v.flipX }));
  const flipY = () => setViewport((v) => ({ ...v, flipY: !v.flipY }));
  const rotLeft = () => setViewport((v) => ({ ...v, rotation: (v.rotation + 90) % 360 }));
  const rotRight = () => setViewport((v) => ({ ...v, rotation: (v.rotation - 90 + 360) % 360 }));

  // ── Shape / Text commit ──
  const handleShapeCommit = useCallback((rect: { x: number; y: number; w: number; h: number }) => {
    const obj: ShapeObject = {
      id: `shape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: shapeType,
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      rotation: 0,
      color: shapeColor,
      opacity: 1,
      lineWidth,
    };
    setObjects((prev) => [...prev, obj]);
    // 同步画到 overlay canvas（用于显示）
    if (overlayCanvasRef.current) {
      const octx = overlayCanvasRef.current.getContext("2d")!;
      octx.strokeStyle = shapeColor;
      octx.lineWidth = Math.max(2, fontSize / 12);
      octx.fillStyle = shapeColor;
      if (shapeType === "rect") octx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      else if (shapeType === "circle") {
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        const r = Math.max(rect.w, rect.h) / 2;
        octx.beginPath(); octx.arc(cx, cy, r, 0, Math.PI * 2); octx.stroke();
      } else if (shapeType === "line") {
        octx.beginPath(); octx.moveTo(rect.x, rect.y); octx.lineTo(rect.x + rect.w, rect.y + rect.h); octx.stroke();
      } else if (shapeType === "arrow") {
        const ax = rect.x + rect.w, ay = rect.y + rect.h / 2;
        octx.beginPath(); octx.moveTo(rect.x, rect.y + rect.h / 2); octx.lineTo(ax, ay);
        const ang = Math.atan2(rect.h, rect.w); const ah = 12;
        octx.moveTo(ax, ay); octx.lineTo(ax - ah * Math.cos(ang - Math.PI / 6), ay - ah * Math.sin(ang - Math.PI / 6));
        octx.moveTo(ax, ay); octx.lineTo(ax - ah * Math.cos(ang + Math.PI / 6), ay - ah * Math.sin(ang + Math.PI / 6));
        octx.stroke();
      }
    }
    saveHistory();
  }, [shapeType, shapeColor, lineWidth, fontSize]);

  const handleTextCommit = useCallback((x: number, y: number, text: string) => {
    const obj: TextObject = {
      id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "text",
      text,
      x,
      y,
      fontSize,
      fontFamily: "sans-serif",
      fontWeight: 400,
      color: textColor,
      opacity: 1,
      rotation: 0,
    };
    setObjects((prev) => [...prev, obj]);
    if (overlayCanvasRef.current) {
      const octx = overlayCanvasRef.current.getContext("2d")!;
      octx.fillStyle = textColor;
      octx.font = `${fontSize}px sans-serif`;
      octx.fillText(text, x, y);
    }
    saveHistory();
  }, [fontSize, textColor]);

  // ── 图层操作 ──
  const handleLayersChange = (newLayers: Layer[]) => {
    const removedDrawing = layers.find((l) => l.id === "drawing") && !newLayers.find((l) => l.id === "drawing");
    const removedMask = layers.find((l) => l.id === "mask") && !newLayers.find((l) => l.id === "mask");
    if (removedDrawing && overlayCanvasRef.current) {
      overlayCanvasRef.current.getContext("2d")!.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    if (removedMask && maskCanvasRef.current) {
      maskCanvasRef.current.getContext("2d")!.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setMaskDataUrl(null);
    }
    setLayers(newLayers);
    saveHistory();
  };

  // ── Before/After 对比拖拽 ──
  const handleCompareDrag = (e: React.MouseEvent) => {
    if (!compareRef.current) return;
    const rect = compareRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pos = Math.max(0, Math.min(100, (x / rect.width) * 100));
    comparePosRef.current = pos;
    if (rafCompareRef.current) return;
    rafCompareRef.current = requestAnimationFrame(() => {
      rafCompareRef.current = null;
      setComparePos(comparePosRef.current);
    });
  };

  // ── 键盘快捷键 ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Meta 组合键
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "0") { e.preventDefault(); resetView(); }
        else if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); }
        else if (e.key === "-") { e.preventDefault(); zoomOut(); }
        else if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        }
        else if (e.key === "y") { e.preventDefault(); redo(); }
        return;
      }

      // 工具快捷键（仅在画布区域聚焦时触发，避免在输入框中误触发）
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case "v": setTool("select"); break;
        case "h": setTool("pan"); break;
        case "c": setTool("crop"); break;
        case "b": setTool("brush"); break;
        case "e": setTool("eraser"); break;
        case "t": setTool("text"); break;
        case "r": setTool("shape"); break;
        case "a": setTool("ai"); break;
        case "Delete":
        case "Backspace":
          // 删除当前选中的对象（简化：删除最后一个对象）
          if (objects.length > 0) {
            setObjects((prev) => prev.slice(0, -1));
            saveHistory();
          }
          break;
        case "Escape":
          setCompareMode(false);
          setAiResults([]);
          setCompareResult(null);
          break;
        default: break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resetView, zoomIn, zoomOut, undo, redo, objects, saveHistory]);

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
              if (compareResult) setCompareMode(!compareMode);
            }}
            disabled={!compareResult}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-all",
              compareMode ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-paper-4"
            )}
          >
            {compareMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Before/After
          </button>
          <button
            type="button"
            onClick={() => handleExport("png")}
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
          <div ref={compareRef} className="relative h-full w-full">
            {compareMode && compareResult ? (
              <div className="flex h-full items-center justify-center p-4">
                <div className="relative" style={{ maxWidth: "100%" }}>
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
              </div>
            ) : (
              <ImageEditorCanvas
                image={htmlImage}
                viewport={viewport}
                onViewportChange={setViewport}
                crop={crop}
                tool={tool}
                brushColor={brushColor}
                brushSize={brushSize}
                textColor={textColor}
                fontSize={fontSize}
                shapeType={shapeType}
                shapeColor={shapeColor}
                adjustments={adjustments}
                filters={filter}
                textValue={textValue}
                showOverlay={showOverlay}
                showMask={showMask}
                onMaskChange={setMaskDataUrl}
                onCropChange={setCrop}
                onImageCanvasReady={handleImageCanvasReady}
                onShapeCommit={handleShapeCommit}
                onTextCommit={handleTextCommit}
                onInteractionStateChange={() => {}}
              />
            )}
          </div>

          {/* 缩放指示器 */}
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md border border-line bg-paper-2/90 px-2 py-1 backdrop-blur-sm">
            <span className="text-[10px] text-ink-3">缩放</span>
            <span className="text-xs font-medium text-ink">{Math.round(viewport.scale * 100)}%</span>
          </div>

          {/* 蒙版工具栏 */}
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
                    const mc = maskCanvasRef.current;
                    const ctx = mc.getContext("2d")!;
                    const temp = document.createElement("canvas");
                    temp.width = mc.width;
                    temp.height = mc.height;
                    temp.getContext("2d")!.drawImage(mc, 0, 0);
                    ctx.clearRect(0, 0, mc.width, mc.height);
                    ctx.globalCompositeOperation = "source-over";
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, mc.width, mc.height);
                    ctx.globalCompositeOperation = "destination-out";
                    ctx.drawImage(temp, 0, 0);
                    ctx.globalCompositeOperation = "source-over";
                    setMaskDataUrl(mc.toDataURL());
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