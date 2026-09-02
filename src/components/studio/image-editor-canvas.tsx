"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import type {
  Adjustments,
  CanvasSize,
  CropRect,
  FilterPresetKey,
  ImageSize,
  InteractionState,
  ToolMode,
  ViewportTransform,
} from "./image-editor-types";
import {
  displayScale,
  imageOffset,
  imageToScreen,
  screenToImage,
  zoomAroundCursor,
} from "./image-editor-coord";

// ── Props ──

interface ImageEditorCanvasProps {
  image: HTMLImageElement | HTMLCanvasElement;
  viewport: ViewportTransform;
  onViewportChange: (v: ViewportTransform) => void;
  crop: CropRect | null;
  tool: ToolMode;
  brushColor: string;
  brushSize: number;
  textColor: string;
  fontSize: number;
  shapeType: "rect" | "circle" | "line" | "arrow";
  shapeColor: string;
  adjustments: Adjustments;
  filters: FilterPresetKey;
  textValue: string;
  showOverlay: boolean;
  showMask: boolean;
  onMaskChange: (maskDataUrl: string | null) => void;
  onCropChange: (crop: CropRect | null) => void;
  onImageCanvasReady: (canvas: HTMLCanvasElement) => void;
  onShapeCommit?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onTextCommit?: (x: number, y: number, text: string) => void;
  onInteractionStateChange?: (state: InteractionState) => void;
}

// ── 绘图上下文 ──

interface DrawState {
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  mode: "pan" | "crop" | "brush" | "shape" | "select" | null;
}

// ── 组件 ──

export function ImageEditorCanvas({
  image,
  viewport,
  onViewportChange,
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
  onShapeCommit,
  onTextCommit,
  onInteractionStateChange,
}: ImageEditorCanvasProps) {
  // ── Refs（高频交互状态，不触发 React render） ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const maskPreviewRef = useRef<HTMLCanvasElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseDirtyRef = useRef(true);
  const drawRef = useRef<DrawState>({
    active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, mode: null,
  });
  const rafRef = useRef<number | null>(null);
  const maskDirtyRef = useRef(true);
  const propsRef = useRef<ImageEditorCanvasProps | null>(null);
  // pan 用 ref 存储，避免每次移动触发 React re-render
  const panRef = useRef({ x: 0, y: 0 });
  propsRef.current = {
    image, viewport, onViewportChange, crop, tool, brushColor, brushSize,
    textColor, fontSize, shapeType, shapeColor, adjustments, filters,
    textValue, showOverlay, showMask, onMaskChange, onCropChange,
    onImageCanvasReady, onShapeCommit, onTextCommit, onInteractionStateChange,
  };

  // 当前交互状态（ref，不触发 render）
  const interactionStateRef = useRef<InteractionState>("idle");

  // ── 低频 React state ──
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  // ── 辅助函数 ──

  const getCanvasSize = (): CanvasSize => {
    const c = canvasRef.current;
    return c ? { width: c.width, height: c.height } : { width: 0, height: 0 };
  };

  const getImageSize = (): ImageSize => ({
    width: image.width,
    height: image.height,
  });

  /** 当前 viewport（合并 props + pan ref） */
  const getViewport = (): ViewportTransform => ({
    ...viewport,
    x: panRef.current.x,
    y: panRef.current.y,
  });

  /** screen → image（使用统一坐标工具） */
  const toImage = (sx: number, sy: number) => {
    return screenToImage({ x: sx, y: sy }, getViewport(), getCanvasSize(), getImageSize());
  };

  /** image → screen（使用统一坐标工具） */
  const toScreen = (ix: number, iy: number) => {
    return imageToScreen({ x: ix, y: iy }, getViewport(), getCanvasSize(), getImageSize());
  };

  /** 设置交互状态 */
  const setState = (s: InteractionState) => {
    interactionStateRef.current = s;
    onInteractionStateChange?.(s);
  };

  // ── Canvas 尺寸设置 ──
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      baseDirtyRef.current = true;
    }
  }, []);

  // ResizeObserver
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

  // ── 重新生成 Mask 彩色预览 ──
  const regenerateMaskPreview = useCallback(() => {
    const mask = maskRef.current;
    const preview = maskPreviewRef.current;
    if (!mask || !preview) return;
    const mctx = mask.getContext("2d")!;
    const pdata = preview.getContext("2d")!;
    pdata.clearRect(0, 0, preview.width, preview.height);
    pdata.save();
    pdata.globalCompositeOperation = "source-over";
    pdata.fillStyle = "red";
    pdata.fillRect(0, 0, preview.width, preview.height);
    pdata.globalCompositeOperation = "destination-in";
    pdata.drawImage(mask, 0, 0);
    pdata.restore();
    maskDirtyRef.current = false;
  }, []);

  // ── 主渲染函数 ──
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const p = propsRef.current;
    if (!canvas || !p || !imageCanvasRef.current) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    const cs: CanvasSize = { width: w, height: h };
    const img: ImageSize = { width: imageCanvasRef.current.width, height: imageCanvasRef.current.height };
    const v: ViewportTransform = { ...p.viewport, x: panRef.current.x, y: panRef.current.y };
    const s = displayScale(v, cs, img);

    // ── Base canvas 缓存 ──
    // 只在变换/调整变化时重新生成。不含 pan — pan 在 render 时用 ctx.translate 应用。
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

      // 预翻转图像（如果需要翻转，在图像空间先翻转，再旋转/缩放）
      let drawSrc = imageCanvasRef.current;
      if (v.flipX || v.flipY) {
        const fc = document.createElement("canvas");
        fc.width = img.width;
        fc.height = img.height;
        const fctx = fc.getContext("2d")!;
        fctx.translate(v.flipX ? img.width : 0, v.flipY ? img.height : 0);
        fctx.scale(v.flipX ? -1 : 1, v.flipY ? -1 : 1);
        fctx.drawImage(imageCanvasRef.current, 0, 0);
        drawSrc = fc;
      }

      bctx.save();
      // 居中偏移（不含 pan）
      const off = imageOffset({ ...v, x: 0, y: 0 }, cs, img);
      bctx.translate(off.x, off.y);
      // 绕图片中心旋转
      bctx.translate(img.width / 2, img.height / 2);
      bctx.rotate((v.rotation * Math.PI) / 180);
      bctx.translate(-img.width / 2, -img.height / 2);
      // 缩放
      bctx.scale(s, s);
      // 调整滤镜
      const filters: string[] = [];
      if (p.adjustments.brightness !== 100) filters.push(`brightness(${p.adjustments.brightness}%)`);
      if (p.adjustments.contrast !== 100) filters.push(`contrast(${p.adjustments.contrast}%)`);
      if (p.adjustments.saturation !== 100) filters.push(`saturate(${p.adjustments.saturation}%)`);
      if (p.adjustments.hue) filters.push(`hue-rotate(${p.adjustments.hue}deg)`);
      if (p.adjustments.blur) filters.push(`blur(${p.adjustments.blur}px)`);
      if (filters.length) bctx.filter = filters.join(" ");
      else bctx.filter = "none";
      bctx.drawImage(drawSrc, 0, 0);
      bctx.filter = "none";
      bctx.restore();
      baseDirtyRef.current = false;
    }

    // 快速清屏 + blit base canvas（GPU 加速）
    // pan 用 panRef（ref），不触发 React re-render
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.drawImage(baseCanvasRef.current!, 0, 0);

    // ── Crop 预览 ──
    const cropTarget = p.crop ?? (drawRef.current.active && drawRef.current.mode === "crop" ? {
      x: Math.min(drawRef.current.startX, drawRef.current.lastX),
      y: Math.min(drawRef.current.startY, drawRef.current.lastY),
      w: Math.abs(drawRef.current.lastX - drawRef.current.startX),
      h: Math.abs(drawRef.current.lastY - drawRef.current.startY),
    } : null);

    if (cropTarget && cropTarget.w > 0 && cropTarget.h > 0) {
      // Crop rect 在 Image Coordinate → 用 imageToScreen 画到 Screen
      const tl = imageToScreen({ x: cropTarget.x, y: cropTarget.y }, v, cs, img);
      const br = imageToScreen({ x: cropTarget.x + cropTarget.w, y: cropTarget.y + cropTarget.h }, v, cs, img);
      const cx = tl.x;
      const cy = tl.y;
      const cw = br.x - tl.x;
      const ch = br.y - tl.y;
      ctx.save();
      ctx.strokeStyle = "#35c9ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cx, cy, cw, ch);
      // 遮罩暗化
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
      ctx.restore();
    }

    // ── Shape 预览 ──
    if (drawRef.current.active && drawRef.current.mode === "shape") {
      const x = Math.min(drawRef.current.startX, drawRef.current.lastX);
      const y = Math.min(drawRef.current.startY, drawRef.current.lastY);
      const sw = Math.abs(drawRef.current.lastX - drawRef.current.startX);
      const sh = Math.abs(drawRef.current.lastY - drawRef.current.startY);
      if (sw > 0 && sh > 0) {
        const tl = imageToScreen({ x, y }, v, cs, img);
        const br = imageToScreen({ x: x + sw, y: y + sh }, v, cs, img);
        ctx.save();
        ctx.strokeStyle = p.shapeColor;
        ctx.lineWidth = Math.max(2, p.fontSize / 12);
        ctx.fillStyle = p.shapeColor;
        if (p.shapeType === "rect") {
          ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        } else if (p.shapeType === "circle") {
          const cx = tl.x + (br.x - tl.x) / 2;
          const cy = tl.y + (br.y - tl.y) / 2;
          const r = Math.max(br.x - tl.x, br.y - tl.y) / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.shapeType === "line") {
          ctx.beginPath();
          ctx.moveTo(tl.x, tl.y);
          ctx.lineTo(br.x, br.y);
          ctx.stroke();
        } else if (p.shapeType === "arrow") {
          const ax = br.x;
          const ay = tl.y + (br.y - tl.y) / 2;
          ctx.beginPath();
          ctx.moveTo(tl.x, ay);
          ctx.lineTo(ax, ay);
          const ang = Math.atan2(br.y - tl.y, br.x - tl.x);
          const ah = 12;
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - ah * Math.cos(ang - Math.PI / 6), ay - ah * Math.sin(ang - Math.PI / 6));
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - ah * Math.cos(ang + Math.PI / 6), ay - ah * Math.sin(ang + Math.PI / 6));
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Overlay 图层 ──
    if (p.showOverlay && overlayRef.current) {
      ctx.drawImage(overlayRef.current, 0, 0, w, h);
    }

    // ── Mask 预览 ──
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

  // ── viewport 变化时重新生成 base canvas ──
  // 注意：只监听 scale/rotation/flip，不监听 pan（x/y）。
  // pan 在 render 时通过 ctx.translate 应用，不需要重新生成 base canvas。
  useEffect(() => {
    baseDirtyRef.current = true;
    scheduleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.scale, viewport.rotation, viewport.flipX, viewport.flipY]);

  // ── 其他 props 变化 ──
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

  // ── Mask 绘制 ──
  const drawMaskPoint = useCallback((x: number, y: number, erase: boolean) => {
    const mc = maskRef.current;
    if (!mc) return;
    const mctx = mc.getContext("2d")!;
    mctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    mctx.fillStyle = erase ? "rgba(0,0,0,0)" : "rgba(255,255,255,1)";
    mctx.beginPath();
    mctx.arc(x, y, propsRef.current!.brushSize / 2, 0, Math.PI * 2);
    mctx.fill();
  }, []);

  const drawMaskLine = useCallback((x1: number, y1: number, x2: number, y2: number, erase: boolean) => {
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
  }, []);

  // ── Pointer 事件 ──

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const p = propsRef.current!;

    // Space + 左键 → 临时 Pan
    if (e.button === 0 && e.shiftKey) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawRef.current.active = true;
      drawRef.current.mode = "pan";
      drawRef.current.startX = e.clientX;
      drawRef.current.startY = e.clientY;
      drawRef.current.lastX = e.clientX;
      drawRef.current.lastY = e.clientY;
      setState("dragging");
      return;
    }

    // 中键 → Pan
    if (e.button === 1) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawRef.current.active = true;
      drawRef.current.mode = "pan";
      drawRef.current.startX = e.clientX;
      drawRef.current.startY = e.clientY;
      drawRef.current.lastX = e.clientX;
      drawRef.current.lastY = e.clientY;
      setState("dragging");
      return;
    }

    if (e.button !== 0) return;

    const img = toImage(sx, sy);

    switch (p.tool) {
      case "crop":
        canvas.setPointerCapture(e.pointerId);
        drawRef.current.active = true;
        drawRef.current.mode = "crop";
        drawRef.current.startX = img.x;
        drawRef.current.startY = img.y;
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        setState("pressed");
        break;

      case "brush":
      case "eraser":
        canvas.setPointerCapture(e.pointerId);
        drawRef.current.active = true;
        drawRef.current.mode = "brush";
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        drawMaskPoint(img.x, img.y, p.tool === "eraser");
        maskDirtyRef.current = true;
        scheduleRender();
        setState("dragging");
        break;

      case "shape":
        canvas.setPointerCapture(e.pointerId);
        drawRef.current.active = true;
        drawRef.current.mode = "shape";
        drawRef.current.startX = img.x;
        drawRef.current.startY = img.y;
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        setState("pressed");
        break;

      case "text":
        setTextInput({ x: img.x, y: img.y, value: "" });
        setState("editing");
        break;

      case "select":
      case "pan":
      default:
        // select 工具暂时等同于 pan
        canvas.setPointerCapture(e.pointerId);
        drawRef.current.active = true;
        drawRef.current.mode = "pan";
        drawRef.current.startX = e.clientX;
        drawRef.current.startY = e.clientY;
        drawRef.current.lastX = e.clientX;
        drawRef.current.lastY = e.clientY;
        setState("dragging");
        break;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current!;
    if (!drawRef.current.active) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    switch (drawRef.current.mode) {
      case "pan": {
        const dx = e.clientX - drawRef.current.startX;
        const dy = e.clientY - drawRef.current.startY;
        // pan 只更新 ref，不触发 React re-render
        panRef.current.x += dx;
        panRef.current.y += dy;
        drawRef.current.startX = e.clientX;
        drawRef.current.startY = e.clientY;
        scheduleRender();
        break;
      }

      case "crop": {
        const img = toImage(sx, sy);
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        scheduleRender();
        break;
      }

      case "brush": {
        const img = toImage(sx, sy);
        drawMaskLine(drawRef.current.lastX, drawRef.current.lastY, img.x, img.y, p.tool === "eraser");
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        maskDirtyRef.current = true;
        scheduleRender();
        break;
      }

      case "shape": {
        const img = toImage(sx, sy);
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        scheduleRender();
        break;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current!;
    if (!drawRef.current.active) return;

    const canvas = canvasRef.current!;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }

    switch (drawRef.current.mode) {
      case "crop": {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const img = toImage(sx, sy);
        const x = Math.min(drawRef.current.startX, img.x);
        const y = Math.min(drawRef.current.startY, img.y);
        const w = Math.abs(img.x - drawRef.current.startX);
        const h = Math.abs(img.y - drawRef.current.startY);
        if (w > 0 && h > 0) {
          onCropChange({ x, y, w, h });
        }
        drawRef.current.active = false;
        drawRef.current.mode = null;
        setState("committing");
        scheduleRender();
        break;
      }

      case "shape": {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const img = toImage(sx, sy);
        const x = Math.min(drawRef.current.startX, img.x);
        const y = Math.min(drawRef.current.startY, img.y);
        const w = Math.abs(img.x - drawRef.current.startX);
        const h = Math.abs(img.y - drawRef.current.startY);
        if (w > 0 && h > 0) {
          p.onShapeCommit?.({ x, y, w, h });
        }
        drawRef.current.active = false;
        drawRef.current.mode = null;
        setState("committing");
        scheduleRender();
        break;
      }

      case "brush": {
        drawRef.current.active = false;
        drawRef.current.mode = null;
        if (maskDirtyRef.current) {
          regenerateMaskPreview();
          if (maskRef.current) {
            onMaskChange(maskRef.current.toDataURL());
          }
          maskDirtyRef.current = false;
        }
        setState("committing");
        break;
      }

      case "pan":
      default:
        drawRef.current.active = false;
        drawRef.current.mode = null;
        // pan 结束时同步到 React state
        onViewportChange({ ...p.viewport, x: panRef.current.x, y: panRef.current.y });
        setState("idle");
        break;
    }
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
    const newViewport = zoomAroundCursor(
      { x: sx, y: sy },
      { ...p.viewport, x: panRef.current.x, y: panRef.current.y },
      { width: canvas.width, height: canvas.height },
      { width: image.width, height: image.height },
      factor
    );
    panRef.current = { x: newViewport.x, y: newViewport.y };
    onViewportChange({ ...newViewport, x: 0, y: 0 });
  };

  // ── 双击适应 ──
  const handleDoubleClick = () => {
    panRef.current = { x: 0, y: 0 };
    onViewportChange({ x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false });
    scheduleRender();
  };

  // ── 鼠标悬停光标 ──
  const getCursor = (): string => {
    switch (tool) {
      case "pan": return "grab";
      case "brush": case "eraser": return "crosshair";
      case "crop": return "crosshair";
      case "text": return "text";
      case "shape": return "crosshair";
      case "select": return "default";
      default: return "default";
    }
  };

  // ── 文字提交 ──
  useEffect(() => {
    if (textInput && textInput.value.trim()) {
      propsRef.current?.onTextCommit?.(textInput.x, textInput.y, textInput.value);
      setTextInput(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textInput]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg"
      style={{
        backgroundColor: "#1a1a1a",
        cursor: getCursor(),
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