"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLogoutButton() {
  const [pending, setPending] = useState(false);

  const logout = async () => {
    setPending(true);
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } finally {
      window.location.assign("/admin/login");
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={logout}
      disabled={pending}
      title="退出管理后台"
    >
      <LogOut className="h-4 w-4" />
      退出
    </Button>
  );
}
