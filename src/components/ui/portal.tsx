"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Portal — 把子节点渲染到 document.body 下。
 *
 * 全屏覆盖层（图片查看器等）必须挂到 body 上，否则会被所在区块的
 * stacking context 压住（例如 sticky header），导致点击被拦截。
 * 先服务端渲染 null，挂载后再渲染 portal，避免 SSR 水合 mismatch。
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}