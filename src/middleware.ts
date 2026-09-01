import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  isAdminAuthConfigured,
  verifyAdminSession,
} from "@/lib/admin-auth";

function isAdminPage(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isAdminApi(pathname: string) {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isLoginRoute =
    pathname === "/admin/login" || pathname === "/api/admin/login";
  if (isLoginRoute) return NextResponse.next();

  const protectsPage = isAdminPage(pathname);
  const protectsApi = isAdminApi(pathname);
  const protectsCreditsMutation =
    pathname === "/api/credits" && req.method !== "GET";
  if (!protectsPage && !protectsApi && !protectsCreditsMutation) {
    return NextResponse.next();
  }

  const configured = isAdminAuthConfigured();
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = configured && (await verifyAdminSession(token));
  if (authenticated) return NextResponse.next();

  if (protectsPage) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    if (!configured) loginUrl.searchParams.set("reason", "not-configured");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.json(
    { error: configured ? "需要管理员登录" : "管理员认证尚未配置" },
    { status: configured ? 401 : 503 }
  );
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/credits"],
};
