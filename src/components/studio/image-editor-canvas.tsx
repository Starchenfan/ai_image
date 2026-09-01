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
  onExportCanvas: (canvas: HTMLCanvasElement) => void;
  onImageCanvasReady: (canvas: HTMLCanvasElement) => void;
}

// ── 绘图上下文 ──

interface DrawState {
  drawing: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  // 临时形状预览（不提交到图层）
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
  onExportCanvas,
  onImageCanvasReady,
}: ImageEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<DrawState>({
    drawing: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    previewShape: null,
  });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [hoverCrop, setHoverCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  // 初始化内部 canvas
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
    if (!overlayRef.current) {
      const oc = document.createElement("canvas");
      oc.width = image.width;
      oc.height = image.height;
      overlayRef.current = oc;
    }
  }, [image, onImageCanvasReady]);

  // 计算显示尺寸
  const getDisplaySize = useCallback(() => {
    const maxW = 1200;
    const maxH = 800;
    const aspect = image.width / image.height;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { w, h };
  }, [image]);

  // 主渲染
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageCanvasRef.current) return;
    const ctx = canvas.getContext("2d")!;
    const { w, h } = getDisplaySize();
    canvas.width = w;
    canvas.height = h;

    // 清空
    ctx.clearRect(0, 0, w, h);

    // 画布坐标 → 图像坐标 的变换
    const scaleX = w / imageCanvasRef.current.width;
    const scaleY = h / imageCanvasRef.current.height;
    const scale = Math.min(scaleX, scaleY);

    ctx.save();
    // 居中
    const offsetX = (w - imageCanvasRef.current.width * scale) / 2 + pan.x;
    const offsetY = (h - imageCanvasRef.current.height * scale) / 2 + pan.y;

    ctx.translate(offsetX, offsetY);
    ctx.scale(transform.flipX ? -scale : scale, transform.flipY ? -scale : scale);
    if (transform.flipX) ctx.translate(imageCanvasRef.current.width, 0);
    if (transform.flipY) ctx.translate(0, imageCanvasRef.current.height);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.translate(-imageCanvasRef.current.width / 2, -imageCanvasRef.current.height / 2);
    ctx.translate(imageCanvasRef.current.width / 2, imageCanvasRef.current.height / 2);

    // 应用调整和滤镜
    const filters: string[] = [];
    if (adjustments.brightness !== 100) filters.push(`brightness(${adjustments.brightness}%)`);
    if (adjustments.contrast !== 100) filters.push(`contrast(${adjustments.contrast}%)`);
    if (adjustments.saturation !== 100) filters.push(`saturate(${adjustments.saturation}%)`);
    if (adjustments.hue) filters.push(`hue-rotate(${adjustments.hue}deg)`);
    if (adjustments.blur) filters.push(`blur(${adjustments.blur}px)`);
    if (filters.length) ctx.filter = filters.join(" ");
    else ctx.filter = "none";

    ctx.drawImage(imageCanvasRef.current, 0, 0);

    // 滤镜通过 CSS 滤镜无法在 drawImage 后叠加 —— 改用 filter 在 drawImage 前设置
    // 实际上 filter 会影响 drawImage，所以上面的设置是对的

    ctx.filter = "none";

    // 绘制裁剪框
    if (crop) {
      const cx = crop.x * scale + offsetX;
      const cy = crop.y * scale + offsetY;
      const cw = crop.w * scale;
      const ch = crop.h * scale;
      ctx.save();
      ctx.strokeStyle = "#35c9ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cx, cy, cw, ch);
      // 半透明遮罩
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

    // 绘制 overlay 图层（文字、形状、画笔预览）
    if (showOverlay && overlayRef.current) {
      ctx.drawImage(overlayRef.current, 0, 0, w, h);
    }

    // 绘制 mask 预览（半透明叠加）
    if (showMask && maskRef.current && maskRef.current.width > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      // 将 mask 用彩色显示（红色 = 编辑区域）
      const mc = document.createElement("canvas");
      mc.width = maskRef.current.width;
      mc.height = maskRef.current.height;
      const mctx = mc.getContext("2d")!;
      const maskData = maskRef.current.getContext("2d")!.getImageData(0, 0, maskRef.current.width, maskRef.current.height);
      const out = mctx.createImageData(maskRef.current.width, maskRef.current.height);
      for (let i = 0; i < maskData.data.length; i += 4) {
        const v = maskData.data[i]; // mask 用 R 通道
        out.data[i] = 255; // R
        out.data[i + 1] = 0;
        out.data[i + 2] = 0;
        out.data[i + 3] = v; // 用 alpha 表示 mask 强度
      }
      mctx.putImageData(out, 0, 0);
      ctx.drawImage(mc, 0, 0, w, h);
      ctx.restore();
    }

    ctx.restore();
  }, [
    image,
    transform,
    crop,
    pan,
    adjustments,
    brushColor,
    brushSize,
    textColor,
    fontSize,
    shapeType,
    shapeColor,
    textValue,
    showOverlay,
    showMask,
    getDisplaySize,
  ]);

  // 重渲染
  useEffect(() => {
    render();
  }, [render]);

  // 导出用 canvas
  useEffect(() => {
    if (!imageCanvasRef.current) return;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = imageCanvasRef.current.width;
    exportCanvas.height = imageCanvasRef.current.height;
    const ctx = exportCanvas.getContext("2d")!;

    // 应用调整
    const filters: string[] = [];
    if (adjustments.brightness !== 100) filters.push(`brightness(${adjustments.brightness}%)`);
    if (adjustments.contrast !== 100) filters.push(`contrast(${adjustments.contrast}%)`);
    if (adjustments.saturation !== 100) filters.push(`saturate(${adjustments.saturation}%)`);
    if (adjustments.hue) filters.push(`hue-rotate(${adjustments.hue}deg)`);
    if (adjustments.blur) filters.push(`blur(${adjustments.blur}px)`);
    if (filters.length) ctx.filter = filters.join(" ");

    ctx.drawImage(imageCanvasRef.current, 0, 0);
    ctx.filter = "none";

    // 裁剪
    if (crop) {
      const cropped = document.createElement("canvas");
      cropped.width = crop.w;
      cropped.height = crop.h;
      const cctx = cropped.getContext("2d")!;
      cctx.drawImage(exportCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      onExportCanvas(cropped);
    } else {
      onExportCanvas(exportCanvas);
    }
  }, [imageCanvasRef, adjustments, crop, onExportCanvas]);

  // 坐标转换：屏幕 → 图像
  const screenToImage = useCallback(
    (sx: number, sy: number) => {
      const { w, h } = getDisplaySize();
      const scale = Math.min(w / image.width, h / image.height);
      const offsetX = (w - image.width * scale) / 2 + pan.x;
      const offsetY = (h - image.height * scale) / 2 + pan.y;
      let ix = (sx - offsetX) / scale;
      let iy = (sy - offsetY) / scale;
      // 翻转
      if (transform.flipX) ix = image.width - ix;
      if (transform.flipY) iy = image.height - iy;
      // 旋转（简化：仅支持 0/90/180/270）
      if (transform.rotation === 90) {
        [ix, iy] = [image.height - iy, ix];
      } else if (transform.rotation === 180) {
        ix = image.width - ix;
        iy = image.height - iy;
      } else if (transform.rotation === 270) {
        [ix, iy] = [iy, image.width - ix];
      }
      return { x: ix, y: iy };
    },
    [image, getDisplaySize, pan, transform]
  );

  // 鼠标事件
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const img = screenToImage(sx, sy);

      if (tool === "crop") {
        drawRef.current.drawing = true;
        drawRef.current.startX = img.x;
        drawRef.current.startY = img.y;
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        return;
      }

      if (tool === "brush" || tool === "eraser") {
        drawRef.current.drawing = true;
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        drawMaskPoint(img.x, img.y, tool === "eraser");
        return;
      }

      if (tool === "shape") {
        drawRef.current.drawing = true;
        drawRef.current.startX = img.x;
        drawRef.current.startY = img.y;
        return;
      }

      if (tool === "text") {
        setTextInput({ x: img.x, y: img.y, value: "" });
        return;
      }

      // select → pan
      setPanning(true);
    },
    [tool, screenToImage]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const img = screenToImage(sx, sy);

      if (tool === "crop" && drawRef.current.drawing) {
        const x = Math.min(drawRef.current.startX, img.x);
        const y = Math.min(drawRef.current.startY, img.y);
        const w = Math.abs(img.x - drawRef.current.startX);
        const h = Math.abs(img.y - drawRef.current.startY);
        setHoverCrop({ x, y, w, h });
        return;
      }

      if ((tool === "brush" || tool === "eraser") && drawRef.current.drawing) {
        drawMaskLine(drawRef.current.lastX, drawRef.current.lastY, img.x, img.y, tool === "eraser");
        drawRef.current.lastX = img.x;
        drawRef.current.lastY = img.y;
        return;
      }

      if (tool === "shape" && drawRef.current.drawing) {
        // 预览在 render 中通过 hoverCrop 临时显示
        setHoverCrop({ x: Math.min(drawRef.current.startX, img.x), y: Math.min(drawRef.current.startY, img.y), w: Math.abs(img.x - drawRef.current.startX), h: Math.abs(img.y - drawRef.current.startY) });
        return;
      }

      if (panning) {
        setPan((p) => ({ x: p.x + (e.clientX - (rect.left + sx)), y: p.y + (e.clientY - (rect.top + sy)) }));
      }
    },
    [tool, screenToImage, panning]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const img = screenToImage(sx, sy);

      if (tool === "crop" && drawRef.current.drawing) {
        drawRef.current.drawing = false;
        if (hoverCrop) {
          onCropChange({ x: hoverCrop.x, y: hoverCrop.y, w: hoverCrop.w, h: hoverCrop.h });
        }
        setHoverCrop(null);
        return;
      }

      if (tool === "shape" && drawRef.current.drawing) {
        drawRef.current.drawing = false;
        if (hoverCrop) {
          commitShape(hoverCrop);
        }
        setHoverCrop(null);
        return;
      }

      if (tool === "brush" || tool === "eraser") {
        drawRef.current.drawing = false;
        if (maskRef.current) {
          onMaskChange(maskRef.current.toDataURL());
        }
        return;
      }

      setPanning(false);
    },
    [tool, hoverCrop, onCropChange, onMaskChange, screenToImage]
  );

  // mask 绘制
  const drawMaskPoint = useCallback(
    (x: number, y: number, erase: boolean) => {
      const mc = maskRef.current;
      if (!mc) return;
      const mctx = mc.getContext("2d")!;
      mctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
      mctx.fillStyle = erase ? "rgba(0,0,0,0)" : "rgba(255,255,255,1)";
      mctx.beginPath();
      mctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      mctx.fill();
    },
    [brushSize]
  );

  const drawMaskLine = useCallback(
    (x1: number, y1: number, x2: number, y2: number, erase: boolean) => {
      const mc = maskRef.current;
      if (!mc) return;
      const mctx = mc.getContext("2d")!;
      mctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
      mctx.strokeStyle = erase ? "rgba(0,0,0,0)" : "rgba(255,255,255,1)";
      mctx.lineWidth = brushSize;
      mctx.lineCap = "round";
      mctx.lineJoin = "round";
      mctx.beginPath();
      mctx.moveTo(x1, y1);
      mctx.lineTo(x2, y2);
      mctx.stroke();
    },
    [brushSize]
  );

  // 提交形状到 overlay
  const commitShape = useCallback(
    (rect: { x: number; y: number; w: number; h: number }) => {
      const oc = overlayRef.current;
      if (!oc) return;
      const octx = oc.getContext("2d")!;
      octx.strokeStyle = shapeColor;
      octx.lineWidth = Math.max(2, fontSize / 12);
      octx.fillStyle = shapeColor;
      octx.beginPath();
      if (shapeType === "rect") {
        octx.rect(rect.x, rect.y, rect.w, rect.h);
      } else if (shapeType === "circle") {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const r = Math.max(rect.w, rect.h) / 2;
        octx.arc(cx, cy, r, 0, Math.PI * 2);
      } else if (shapeType === "line") {
        octx.moveTo(rect.x, rect.y);
        octx.lineTo(rect.x + rect.w, rect.y + rect.h);
      } else if (shapeType === "arrow") {
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
    [shapeType, shapeColor, fontSize]
  );

  // 文字提交
  useEffect(() => {
    if (textInput && textInput.value.trim()) {
      const oc = overlayRef.current;
      if (!oc) return;
      const octx = oc.getContext("2d")!;
      octx.fillStyle = textColor;
      octx.font = `${fontSize}px sans-serif`;
      octx.fillText(textInput.value, textInput.x, textInput.y);
      setTextInput(null);
    }
  }, [textInput, textColor, fontSize]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTextInput(null);
        setHoverCrop(null);
      }
      if (e.key === "Enter" && textInput) {
        // 由上面的 useEffect 处理
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [textInput]);

  // 滤镜预览叠加
  useEffect(() => {
    if (!imageCanvasRef.current) return;
    // 滤镜（grayscale/sepia/vintage 等）通过在 render 中叠加半透明层实现
    // 这里不修改 imageCanvas，只在 render 中叠加
  }, [filters]);

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    onTransformChange({
      ...transform,
      scale: Math.max(0.3, Math.min(3, transform.scale * factor)),
    });
  };

  // 双击适应
  const handleDoubleClick = () => {
    onTransformChange({ scale: 1, rotation: 0, flipX: false, flipY: false });
    setPan({ x: 0, y: 0 });
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
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setPanning(false)}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    />
  );
}