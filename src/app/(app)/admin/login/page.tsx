"use client";

import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || pending) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error || `登录失败 (${response.status})`);
      }

      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/admin") ? next : "/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100dvh-7rem)] items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-line bg-paper-2 p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-paper-3 text-accent-2">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">
              管理员验证
            </h1>
            <p className="mt-0.5 text-xs text-ink-3">登录后进入服务管理</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">管理员密码</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>

          <p className="min-h-5 text-xs text-danger" role="alert">
            {error}
          </p>

          <Button type="submit" className="w-full" disabled={!password || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            登录
          </Button>
        </form>
      </section>
    </main>
  );
}
