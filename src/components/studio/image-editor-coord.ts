"use client";

// ── 统一坐标转换 ──
// 所有工具必须使用 imageToScreen() / screenToImage()。
// 禁止在各工具中直接写 x * scale + offsetX 等重复公式。
//
// 坐标系约定：
//   Image Coordinate  — 原图像素，永远不变
//   Screen Coordinate — Canvas CSS 像素（不含 dpr）
//   Viewport Transform — 只负责 Image → Screen 的显示映射

import type {
  CanvasSize,
  ImageSize,
  ViewportTransform,
} from "./image-editor-types";

/** Base scale: 把原图缩放到适应 Canvas（不含 zoom） */
function baseScale(canvas: CanvasSize, image: ImageSize): number {
  return Math.min(canvas.width / image.width, canvas.height / image.height);
}

/** 显示缩放 = baseScale × viewport.scale */
export function displayScale(
  v: ViewportTransform,
  canvas: CanvasSize,
  image: ImageSize
): number {
  return baseScale(canvas, image) * v.scale;
}

/** 居中偏移（不含 pan） */
function centerOffset(
  canvas: CanvasSize,
  image: ImageSize,
  s: number
): { x: number; y: number } {
  return {
    x: (canvas.width - image.width * s) / 2,
    y: (canvas.height - image.height * s) / 2,
  };
}

/** 完整偏移 = 居中 + pan */
export function imageOffset(
  v: ViewportTransform,
  canvas: CanvasSize,
  image: ImageSize
): { x: number; y: number } {
  const s = displayScale(v, canvas, image);
  const c = centerOffset(canvas, image, s);
  return { x: c.x + v.x, y: c.y + v.y };
}

/** 绕图片中心旋转 */
function rotateAroundCenter(
  p: { x: number; y: number },
  image: ImageSize,
  angleDeg: number
): { x: number; y: number } {
  const dx = p.x - image.width / 2;
  const dy = p.y - image.height / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: dx * cos - dy * sin + image.width / 2,
    y: dx * sin + dy * cos + image.height / 2,
  };
}

/**
 * Image Coordinate → Screen Coordinate
 *
 * 变换顺序：翻转 → 绕中心旋转 → 缩放 → 偏移
 */
export function imageToScreen(
  p: { x: number; y: number },
  v: ViewportTransform,
  canvas: CanvasSize,
  image: ImageSize
): { x: number; y: number } {
  const s = displayScale(v, canvas, image);
  const off = imageOffset(v, canvas, image);

  let ix = p.x;
  let iy = p.y;

  // 翻转（在图像空间，先于旋转）
  if (v.flipX) ix = image.width - ix;
  if (v.flipY) iy = image.height - iy;

  // 绕中心旋转
  if (v.rotation !== 0) {
    const r = rotateAroundCenter({ x: ix, y: iy }, image, v.rotation);
    ix = r.x;
    iy = r.y;
  }

  return { x: ix * s + off.x, y: iy * s + off.y };
}

/**
 * Screen Coordinate → Image Coordinate
 * imageToScreen 的逆变换
 */
export function screenToImage(
  p: { x: number; y: number },
  v: ViewportTransform,
  canvas: CanvasSize,
  image: ImageSize
): { x: number; y: number } {
  const s = displayScale(v, canvas, image);
  const off = imageOffset(v, canvas, image);

  let ix = (p.x - off.x) / s;
  let iy = (p.y - off.y) / s;

  // 逆旋转
  if (v.rotation !== 0) {
    const r = rotateAroundCenter({ x: ix, y: iy }, image, -v.rotation);
    ix = r.x;
    iy = r.y;
  }

  // 逆翻转
  if (v.flipX) ix = image.width - ix;
  if (v.flipY) iy = image.height - iy;

  return { x: ix, y: iy };
}

/**
 * 以鼠标位置为中心缩放
 * 缩放后，鼠标下的图片点保持在原屏幕位置。
 */
export function zoomAroundCursor(
  cursor: { x: number; y: number },
  v: ViewportTransform,
  canvas: CanvasSize,
  image: ImageSize,
  factor: number
): ViewportTransform {
  const oldScale = v.scale;
  const newScale = Math.max(0.25, Math.min(4, oldScale * factor));

  // 鼠标下的图片坐标（当前 viewport）
  const img = screenToImage(cursor, v, canvas, image);

  // 新 viewport
  const newV: ViewportTransform = { ...v, scale: newScale };
  const s = displayScale(newV, canvas, image);
  const c = centerOffset(canvas, image, s);

  // 把 img 经过翻转+旋转（与 imageToScreen 相同的前两步）
  let ix = img.x;
  let iy = img.y;
  if (newV.flipX) ix = image.width - ix;
  if (newV.flipY) iy = image.height - iy;
  if (newV.rotation !== 0) {
    const r = rotateAroundCenter({ x: ix, y: iy }, image, newV.rotation);
    ix = r.x;
    iy = r.y;
  }

  // imageToScreen(img, newV) = ix * s + c.x + newV.x = cursor.x
  // → newV.x = cursor.x - ix * s - c.x
  return {
    ...newV,
    x: cursor.x - ix * s - c.x,
    y: cursor.y - iy * s - c.y,
  };
}

/** 适应画布（fit-to-canvas） */
export function fitCanvas(
  canvas: CanvasSize,
  image: ImageSize
): ViewportTransform {
  return { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false };
}