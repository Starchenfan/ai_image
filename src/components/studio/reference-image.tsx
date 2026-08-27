"use client";

import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { useStudio } from "@/lib/store";

/**
 * 参考图上传 — 工作台表单组件。
 *
 * 可选的「图生图」参考图：上传一张图片存为 data URL 写入 store，
 * 生成时随请求一起发给 adapter 做图像到图像的生成。支持移除，
 * 未上传时显示虚线上传框。
 *
 * 交互对象：
 *   - useStudio store（referenceImage / set）
 */
export function ReferenceImageUpload() {
  const referenceImage = useStudio((s) => s.referenceImage);
  const set = useStudio((s) => s.set);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => set("referenceImage", reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-medium uppercase tracking-wider text-ink-3">参考图</h3>
      {referenceImage ? (
        <div className="relative overflow-hidden rounded-md border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={referenceImage} alt="参考图" className="h-24 w-full object-cover" />
          <button
            onClick={() => set("referenceImage", null)}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-black/60 text-ink transition-colors hover:bg-black/80"
            aria-label="移除参考图"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-ink">
            图生图
          </span>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line bg-paper-3/30 py-4 text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink-2"
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-xs">上传参考图做图生图（可选）</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}
