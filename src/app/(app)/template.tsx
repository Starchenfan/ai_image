"use client";

import { Suspense } from "react";

/**
 * AppTemplate — (app) 路由组的模板文件。
 *
 * 和 layout 的关键区别：模板在每次导航时都会重新挂载（layout 保持挂载、不重渲染），
 * 所以它适合放「随路由切换而触发」的动效，而不是放共享状态。
 *
 * 它承担两件事：
 *   1. View Transitions API 跨 fade——浏览器支持时，路由切换走 View Transitions，
 *      呈现为平滑的渐隐渐现，而不是加载骨架的硬闪。这让 / ↔ /explore ↔ /history
 *      之间的切换有连续感，尤其在结果页之间跳转时。
 *  2. 兜底渐入——不支持 View Transitions 的浏览器，至少让页面内容淡入，
 *      避免导航后内容「啪」一下突然出现。
 *
 * 减速运动用户会自动跳过这些动画：tokens.css 里有 prefers-reduced-motion 媒体查询，
 * 会把全局 transition-duration 清零，所以模板的 animate-fade-in 在他们眼里是瞬时的。
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-fade-in"
      style={{ viewTransitionName: "app-page" }}
    >
      <Suspense>{children}</Suspense>
    </div>
  );
}
