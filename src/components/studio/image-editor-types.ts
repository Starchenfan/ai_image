"use client";

// ── 统一坐标系统类型 ──
// 所有编辑对象（Crop / Mask / Shape / Text）的数据永远存储在 Image Coordinate。
// ViewportTransform 只负责 Image Coordinate → Screen Coordinate 的显示映射。

/** Canvas 尺寸（CSS 像素，不含 dpr） */
export interface CanvasSize {
  width: number;
  height: number;
}

/** 原图尺寸 */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Viewport Transform — 纯显示状态。
 * x/y: Canvas viewport 中的平移（pan）
 * scale: 缩放（1 = fit-to-canvas）
* rotation: 画布旋转（度）
 * flipX/flipY: 翻转
 *
 * 此结构不属于 Document History。
 */
export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

/** 裁剪矩形 — Image Coordinate */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sharpen: number;
}

export type FilterPresetKey =
  | "none" | "grayscale" | "sepia" | "vintage" | "film" | "cool" | "warm";

/** 工具模式 */
export type ToolMode =
  | "select" | "pan" | "crop" | "brush" | "eraser" | "text" | "shape" | "ai";

/** 交互状态 */
export type InteractionState =
  | "idle" | "hover" | "pressed" | "dragging" | "editing" | "transforming" | "committing" | "cancelling";

/** Shape 对象 — Image Coordinate */
export interface ShapeObject {
  id: string;
  type: "rect" | "circle" | "line" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  opacity: number;
  lineWidth: number;
}

/** Text 对象 — Image Coordinate */
export interface TextObject {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  opacity: number;
  rotation: number;
}

export type EditorObject = ShapeObject | TextObject;

export interface Layer {
  id: string;
  name: string;
  type: "image" | "brush" | "shape" | "text" | "mask";
  visible: boolean;
  locked: boolean;
  order: number;
}