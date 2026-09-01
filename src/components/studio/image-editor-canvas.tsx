"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ── 类型 ──

export type DrawTool =
  | "select" // 选择/移动
  | "crop" // 裁剪
  | "brush" // 画笔（mask）
  | "eraser" // 橡皮擦
  | "text" // 文字
  | "shape" // 形状
  | "ai"; // AI 编辑

export interface CanvasTransform {
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Adjustments {
  brightness: number; // 0-200, 100 = 原图
  contrast: number; // 0-200, 100 = 原图
  saturation: number; // 0-200, 100 = 原图
  hue: number; // 0-360
  blur: number; // 0-10
  sharpen: number; // 0-100
}

export interface FilterPreset {
  grayscale?: number; // 0-100
  sepia?: number; // 0-100
  vintage?: number; // 0-100
  film?: number; // 0-100
  cool?: number; // 0-100
  warm?: number; // 0-100
}

interface ImageEditorCanvasProps {
  image: HTMLImageElement | HTMLCanvasElement;
  transform: CanvasTransform;
  onTransformChange: (t: CanvasTransform) => void;
  crop: CropRect | null;
  tool: DrawTool;
  brushColor: string;
  brushSize: number;
  textColor: string;
  fontSize: number;
  shapeType: "rect" | "circle" | "line" | "arrow";
  shapeColor: string;
  adjustments: Adjustments;
  filters: FilterPreset;
  textValue: string;
  showOverlay: boolean;
  showMask: boolean;
  onMaskChange: (maskDataUrl: string | null) => void;
  onCropChange: (crop: CropRect | null) => void;
  onImageCanvasReady: (canvas: HTMLCanvasElement) => void;
}

// ── 绘图上下文 ──

interface DrawState {
  drawing: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  // 临时预览坐标（屏幕坐标，用于 crop/shape 预览）
  previewX: number;
  previewY: number;
  // 临时形状预览
  previewShape: { type: string; x: number; y: number; w: number; h: number } | null;
}

// ── 组件 ──

export function ImageEditorCanvas({
  image,
  transform,
  onTransformChange,
  crop,
  tool,
  brushColor,
  brushSize,
  textColor,
  fontSize,
  shapeType,
  shapeColor,
  adjustments,
  filters,
  textValue,
  showOverlay,
  showMask,
  onMaskChange,
  onCropChange,
  onImageCanvasReady,
}: ImageEditorCanvasProps) {
  // ── Refs（高频交互状态，不触发 React render） ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const maskPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  // baseCanvas 缓存当前变换下的图像 — 避免每次 render 都重做 transform + drawImage
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseDirtyRef = useRef(true);
  const drawRef = useRef<DrawState>({
    drawing: false,
    startX: 0, startY: 0, lastX: 0, lastY: 0,
    previewX: 0, previewY: 0,
    previewShape: null,
  });
  // pan 用 ref，不触发 React render
  const panRef = useRef({ x: 0, y: 0 });
  // rAF 节流
  const rafRef = useRef<number | null>(null);
  // mask 脏标记 — 只在 mask 真正变化时才重新生成彩色预览
  const maskDirtyRef = useRef(true);
  // props 快照 — render 函数读此 ref，避免 callback identity 变化
  const propsRef = useRef<ImageEditorCanvasProps | null>(null);
  propsRef.current = {
    image, transform, onTransformChange, crop, tool, brushColor, brushSize,
    textColor, fontSize, shapeType, shapeColor, adjustments, filters,
    textValue, showOverlay, showMask, onMaskChange, onCropChange,
    onImageCanvasReady,
  };

  // ── 低频 React state ──
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  // ── Canvas 尺寸设置（只在初始化 / 容器尺寸变化时执行） ──
  // 注意：不用 dpr 放大。用 dpr 会导致 backing store 坐标系与 CSS 像素不一致，
  // clearRect(0,0,w,h) 只清掉左上角一小块，其余区域残留上一帧 → 拖动残影。
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  // ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvas();
    const observer = new ResizeObserver(() => {
      setupCanvas();
      scheduleRender();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [setupCanvas]);

  // ── rAF 节流渲染 ──
  const scheduleRender = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  };

  // ── 重新生成 Mask 彩色预览（只在 mask 真正变化时调用） ──
  const regenerateMaskPreview = useCallback(() => {
    const mask = maskRef.current;
    const preview = maskPreviewRef.current;
    if (!mask || !preview) return;
    const mctx = mask.getContext("2d")!;
    const pdata = preview.getContext("2d")!;
    pdata.clearRect(0, 0, preview.width, preview.height);
    // 用 globalCompositeOperation 快速上色：先铺红色，再用 destination-in 挖出 mask 形状
    pdata.save();
    pdata.globalCompositeOperation = "source-over";
    pdata.fillStyle = "red";
    pdata.fillRect(0, 0, preview.width, preview.height);
    pdata.globalCompositeOperation = "destination-in";
    pdata.drawImage(mask, 0, 0);
    pdata.restore();
    maskDirtyRef.current = false;
  }, []);

  // ── 主渲染函数（从 refs 读数据，不设 canvas.width/height） ──
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const p = propsRef.current;
    if (!canvas || !p || !imageCanvasRef.current) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;

    // 显示缩放 = 适应容器 × transform.scale
    const baseScale = Math.min(w / imageCanvasRef.current.width, h / imageCanvasRef.current.height);
    const scale = baseScale * p.transform.scale;

    // ── Base canvas 缓存：变换/图像变化时才重新生成 ──
    // 注意：base canvas 不含 pan 偏移 — pan 在 render 时用 ctx.translate 应用，
    // 否则 pan 每帧变化都会导致 base canvas 重新生成，缓存就失去意义。
    if (baseDirtyRef.current || !baseCanvasRef.current) {
      if (!baseCanvasRef.current) {
        const bc = document.createElement("canvas");
        bc.width = w;
        bc.height = h;
        baseCanvasRef.current = bc;
      }
      const bc = baseCanvasRef.current;
      const bctx = bc.getContext("2d")!;
      bctx.clearRect(0, 0, w, h);
      bctx.save();
      const offsetX = (w - imageCanvasRef.current.width * scale) / 2;
      const offsetY = (h - imageCanvasRef.current.height * scale) / 2;
      bctx.translate(offsetX, offsetY);
      bctx.scale(p.transform.flipX ? -scale : scale, p.transform.flipY ? -scale : scale);
      if (p.transform.flipX) bctx.translate(imageCanvasRef.current.width, 0);
      if (p.transform.flipY) bctx.translate(0, imageCanvasRef.current.height);
      bctx.rotate((p.transform.rotation * Math.PI) / 180);
      bctx.translate(-imageCanvasRef.current.width / 2, -imageCanvasRef.current.height / 2);
      bctx.translate(imageCanvasRef.current.width / 2, imageCanvasRef.current.height / 2);
      // 调整滤镜
      const filters: string[] = [];
      if (p.adjustments.brightness !== 100) filters.push(`brightness(${p.adjustments.brightness}%)`);
      if (p.adjustments.contrast !== 100) filters.push(`contrast(${p.adjustments.contrast}%)`);
      if (p.adjustments.saturation !== 100) filters.push(`saturate(${p.adjustments.saturation}%)`);
      if (p.adjustments.hue) filters.push(`hue-rotate(${p.adjustments.hue}deg)`);
      if (p.adjustments.blur) filters.push(`blur(${p.adjustments.blur}px)`);
      if (filters.length) bctx.filter = filters.join(" ");
      else bctx.filter = "none";
      bctx.drawImage(imageCanvasRef.current, 0, 0);
      bctx.filter = "none";
      bctx.restore();
      baseDirtyRef.current = false;
    }

    // 快速清屏 + blit base canvas（canvas-to-canvas，GPU 加速）
    // pan 偏移在这里应用 — 不烤进 base canvas
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.drawImage(baseCanvasRef.current!, 0, 0);

    const offsetX = (w - imageCanvasRef.current.width * scale) / 2;
    const offsetY = (h - imageCanvasRef.current.height * scale) / 2;

    // 裁剪框 + 预览
    const cropTarget = p.crop ?? (drawRef.current.drawing && (p.tool === "crop" || p.tool === "shape") ? {
      x: Math.min(drawRef.current.startX, drawRef.current.lastX),
      y: Math.min(drawRef.current.startY, drawRef.current.lastY),
      w: Math.abs(drawRef.current.lastX - drawRef.current.startX),
      h: Math.abs(drawRef.current.lastY - drawRef.current.startY),
    } : null);

    if (cropTarget && cropTarget.w > 0 && cropTarget.h > 0) {
      const cx = cropTarget.x * scale + offsetX;
      const cy = cropTarget.y * scale + offsetY;
      const cw = cropTarget.w * scale;
      const ch = cropTarget.h * scale;
      ctx.save();
      ctx.strokeStyle = p.tool === "shape" ? p.shapeColor : "#35c9ff";
      ctx.lineWidth = p.tool === "shape" ? Math.max(2, p.fontSize / 12) : 2;
      if (p.tool === "crop") ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);
      ctx.strokeRect(cx, cy, cw, ch);
      if (p.tool === "crop") {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(0, 0, cx, h);
        ctx.fillRect(cx + cw, 0, w - cx - cw, h);
        ctx.fillRect(cx, 0, cw, cy);
        ctx.fillRect(cx, cy + ch, cw, h - cy - ch);
        // 手柄
        ctx.fillStyle = "#35c9ff";
        const hs = 8;
        const handles = [
          [cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch],
          [cx + cw / 2, cy], [cx + cw / 2, cy + ch],
          [cx, cy + ch / 2], [cx + cw, cy + ch / 2],
        ];
        for (const [hx, hy] of handles) {
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
      ctx.restore();
    }

    // Overlay 图层（在 pan translate 内，与图像对齐）
    if (p.showOverlay && overlayRef.current) {
      ctx.drawImage(overlayRef.current, 0, 0, w, h);
    }

    // Mask 预览（使用预生成的彩色预览 canvas，不重复做像素循环）
    if (p.showMask && maskPreviewRef.current && maskPreviewRef.current.width > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(maskPreviewRef.current, 0, 0, w, h);
      ctx.restore();
    }

    ctx.restore(); // 对应 render 开头的 ctx.save()
  }, []);

  // ── 初始化内部 canvas ──
  useEffect(() => {
    if (!imageCanvasRef.current) {
      const ic = document.createElement("canvas");
      ic.width = image.width;
      ic.height = image.height;
      const ctx = ic.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      imageCanvasRef.current = ic;
      onImageCanvasReady(ic);
    }
    if (!maskRef.current) {
      const mc = document.createElement("canvas");
      mc.width = image.width;
      mc.height = image.height;
      maskRef.current = mc;
    }
    if (!maskPreviewRef.current) {
      const pc = document.createElement("canvas");
      pc.width = image.width;
      pc.height = image.height;
      maskPreviewRef.current = pc;
      maskDirtyRef.current = true;
    }
    if (!overlayRef.current) {
      const oc = document.createElement("canvas");
      oc.width = image.width;
      oc.height = image.height;
      overlayRef.current = oc;
    }
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, onImageCanvasReady]);

  // ── 低频 props 变化时触发渲染 ──
  // transform / adjustments 影响 base canvas，需要重新生成
  useEffect(() => {
    baseDirtyRef.current = true;
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform, adjustments]);

  // crop / tool / overlay / mask 等只影响上层绘制，不重新生成 base
  useEffect(() => {
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, tool, showOverlay, showMask, textValue]);

  // ── Mask 脏了就重新生成预览 ──
  useEffect(() => {
    if (maskDirtyRef.current) {
      regenerateMaskPreview();
      scheduleRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenerateMaskPreview]);

  // ── 坐标转换：屏幕 → 图像 ──
  const screenToImage = useCallback(
    (sx: number, sy: number) => {
      const p = propsRef.current;
      if (!p) return { x: 0, y: 0 };
      const canvas = canvasRef.current!;
      const w = canvas.width;
      const h = canvas.height;
      const baseScale = Math.min(w / p.image.width, h / p.image.height);
      const scale = baseScale * p.transform.scale;
      const offsetX = (w - p.image.width * scale) / 2 + panRef.current.x;
      const offsetY = (h - p.image.height * scale) / 2 + panRef.current.y;
      let ix = (sx - offsetX) / scale;
      let iy = (sy - offsetY) / scale;
      if (p.transform.flipX) ix = p.image.width - ix;
      if (p.transform.flipY) iy = p.image.height - iy;
      if (p.transform.rotation === 90) {
        [ix, iy] = [p.image.height - iy, ix];
      } else if (p.transform.rotation === 180) {
        ix = p.image.width - ix;
        iy = p.image.height - iy;
      } else if (p.transform.rotation === 270) {
        [ix, iy] = [iy, p.image.width - ix];
      }
      return { x: ix, y: iy };
    },
    []
  );

  // ── Mask 绘制（直接写 maskCanvas，不触发 React） ──
  const drawMaskPoint = useCallback(
    (x: number, y: number, erase: boolean) => {
      const mc = maskRef.current;
      if (!mc) return;
      const mctx = mc.getContext("2d")!;
      mctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
      mctx.fillStyle = erase ? "rgba(0,0,0,0)" : "rgba(255,255,255,1)";
      mctx.beginPath();
      mctx.arc(x, y, propsRef.current!.brushSize / 2, 0, Math.PI * 2);
      mctx.fill();
    },
    []
  );

  const drawMaskLine = useCallback(
    (x1: number, y1: number, x2: number, y2: number, erase: boolean) => {
      const mc = maskRef.current;
      if (!mc) return;
      const mctx = mc.getContext("2d")!;
      mctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
      mctx.strokeStyle = erase ? "rgba(0,0,0,0)" : "rgba(255,255,255,1)";
      mctx.lineWidth = propsRef.current!.brushSize;
      mctx.lineCap = "round";
      mctx.lineJoin = "round";
      mctx.beginPath();
      mctx.moveTo(x1, y1);
      mctx.lineTo(x2, y2);
      mctx.stroke();
    },
    []
  );

  // ── 提交形状到 overlay ──
  const commitShape = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      const oc = overlayRef.current;
      if (!oc) return;
      const octx = oc.getContext("2d")!;
      const p = propsRef.current!;
      octx.strokeStyle = p.shapeColor;
      octx.lineWidth = Math.max(2, p.fontSize / 12);
      octx.fillStyle = p.shapeColor;
      octx.beginPath();
      if (p.shapeType === "rect") {
        octx.rect(rect.x, rect.y, rect.w, rect.h);
      } else if (p.shapeType === "circle") {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const r = Math.max(rect.w, rect.h) / 2;
        octx.arc(cx, cy, r, 0, Math.PI * 2);
      } else if (p.shapeType === "line") {
        octx.moveTo(rect.x, rect.y);
        octx.lineTo(rect.x + rect.w, rect.y + rect.h);
      } else if (p.shapeType === "arrow") {
        const ax = rect.x + rect.w;
        const ay = rect.y + rect.h / 2;
        octx.moveTo(rect.x, rect.y + rect.h / 2);
        octx.lineTo(ax, ay);
        const ang = Math.atan2(rect.h, rect.w);
        const ah = 12;
        octx.moveTo(ax, ay);
        octx.lineTo(ax - ah * Math.cos(ang - Math.PI / 6), ay - ah * Math.sin(ang - Math.PI / 6));
        octx.moveTo(ax, ay);
        octx.lineTo(ax - ah * Math.cos(ang + Math.PI / 6), ay - ah * Math.sin(ang + Math.PI / 6));
      }
      octx.stroke();
    },
    []
  );

  // ── 文字提交 ──
  useEffect(() => {
    if (textInput && textInput.value.trim()) {
      const oc = overlayRef.current;
      if (!oc) return;
      const octx = oc.getContext("2d")!;
      const p = propsRef.current!;
      octx.fillStyle = p.textColor;
      octx.font = `${p.fontSize}px sans-serif`;
      octx.fillText(textInput.value, textInput.x, textInput.y);
      setTextInput(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput]);

  // ── Pointer 事件（完全脱离 React 高频更新） ──

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const img = screenToImage(sx, sy);
    const p = propsRef.current!;

    if (p.tool === "crop") {
      drawRef.current.drawing = true;
      drawRef.current.startX = img.x;
      drawRef.current.startY = img.y;
      drawRef.current.lastX = img.x;
      drawRef.current.lastY = img.y;
      return;
    }

    if (p.tool === "brush" || p.tool === "eraser") {
      drawRef.current.drawing = true;
      drawRef.current.lastX = img.x;
      drawRef.current.lastY = img.y;
      drawMaskPoint(img.x, img.y, p.tool === "eraser");
      maskDirtyRef.current = true;
      scheduleRender();
      return;
    }

    if (p.tool === "shape") {
      drawRef.current.drawing = true;
      drawRef.current.startX = img.x;
      drawRef.current.startY = img.y;
      drawRef.current.lastX = img.x;
      drawRef.current.lastY = img.y;
      return;
    }

    if (p.tool === "text") {
      setTextInput({ x: img.x, y: img.y, value: "" });
      return;
    }

    // select → pan（记录屏幕坐标用于计算 dx/dy）
    drawRef.current.drawing = true;
    drawRef.current.startX = e.clientX;
    drawRef.current.startY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const p = propsRef.current!;

    if (p.tool === "crop" && drawRef.current.drawing) {
      const img = screenToImage(sx, sy);
      drawRef.current.lastX = img.x;
      drawRef.current.lastY = img.y;
      scheduleRender();
      return;
    }

    if ((p.tool === "brush" || p.tool === "eraser") && drawRef.current.drawing) {
      const img = screenToImage(sx, sy);
      drawMaskLine(drawRef.current.lastX, drawRef.current.lastY, img.x, img.y, p.tool === "eraser");
      drawRef.current.lastX = img.x;
      drawRef.current.lastY = img.y;
      maskDirtyRef.current = true;
      scheduleRender();
      return;
    }

    if (p.tool === "shape" && drawRef.current.drawing) {
      const img = screenToImage(sx, sy);
      drawRef.current.lastX = img.x;
      drawRef.current.lastY = img.y;
      scheduleRender();
      return;
    }

    // Pan：用 dx/dy 累加，不依赖 rect.left
    if (drawRef.current.drawing && p.tool === "select") {
      const dx = e.clientX - drawRef.current.startX;
      const dy = e.clientY - drawRef.current.startY;
      panRef.current.x += dx;
      panRef.current.y += dy;
      drawRef.current.startX = e.clientX;
      drawRef.current.startY = e.clientY;
      scheduleRender();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current!;

    if (p.tool === "crop" && drawRef.current.drawing) {
      drawRef.current.drawing = false;
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const img = screenToImage(sx, sy);
      const x = Math.min(drawRef.current.startX, img.x);
      const y = Math.min(drawRef.current.startY, img.y);
      const w = Math.abs(img.x - drawRef.current.startX);
      const h = Math.abs(img.y - drawRef.current.startY);
      if (w > 0 && h > 0) {
        onCropChange({ x, y, w, h });
      }
      scheduleRender();
      return;
    }

    if (p.tool === "shape" && drawRef.current.drawing) {
      drawRef.current.drawing = false;
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const img = screenToImage(sx, sy);
      const x = Math.min(drawRef.current.startX, img.x);
      const y = Math.min(drawRef.current.startY, img.y);
      const w = Math.abs(img.x - drawRef.current.startX);
      const h = Math.abs(img.y - drawRef.current.startY);
      if (w > 0 && h > 0) {
        commitShape({ x, y, w, h });
      }
      scheduleRender();
      return;
    }

    if (p.tool === "brush" || p.tool === "eraser") {
      drawRef.current.drawing = false;
      if (maskDirtyRef.current) {
        regenerateMaskPreview();
        if (maskRef.current) {
          onMaskChange(maskRef.current.toDataURL());
        }
        maskDirtyRef.current = false;
      }
      return;
    }

    drawRef.current.drawing = false;
  };

  // ── 滚轮缩放（以鼠标位置为中心） ──
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const p = propsRef.current!;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const oldScale = p.transform.scale;
    const newScale = Math.max(0.25, Math.min(4, oldScale * factor));

    // 以鼠标位置为中心缩放
    // 必须用实际显示缩放 baseScale × transform.scale，不能只用 baseScale
    const w = canvas.width;
    const h = canvas.height;
    const baseScale = Math.min(w / p.image.width, h / p.image.height);
    const oldDisplayScale = baseScale * oldScale;
    const offsetX = (w - p.image.width * oldDisplayScale) / 2 + panRef.current.x;
    const offsetY = (h - p.image.height * oldDisplayScale) / 2 + panRef.current.y;
    const imgX = (sx - offsetX) / oldDisplayScale;
    const imgY = (sy - offsetY) / oldDisplayScale;

    const newDisplayScale = baseScale * newScale;
    const newOffsetX = sx - imgX * newDisplayScale;
    const newOffsetY = sy - imgY * newDisplayScale;
    panRef.current.x = newOffsetX - (w - p.image.width * newDisplayScale) / 2;
    panRef.current.y = newOffsetY - (h - p.image.height * newDisplayScale) / 2;

    onTransformChange({ ...p.transform, scale: newScale });
  };

  // ── 双击适应 ──
  const handleDoubleClick = () => {
    onTransformChange({ scale: 1, rotation: 0, flipX: false, flipY: false });
    panRef.current = { x: 0, y: 0 };
    scheduleRender();
  };

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-crosshair rounded-lg"
      style={{
        backgroundColor: "#1a1a1a",
        backgroundImage:
          "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    />
  );
}