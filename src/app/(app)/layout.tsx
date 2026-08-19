import { TopNav } from "@/components/top-nav";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-[1600px] px-4 py-4">{children}</main>
      <footer className="mx-auto max-w-[1600px] px-4 py-8 lg:hidden">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row">
          <span>绘界 · 多服务 + 多模型 + Adapter 架构</span>
          <span className="font-mono">动态参数 Schema · SSE 任务流</span>
        </div>
      </footer>
    </div>
  );
}
