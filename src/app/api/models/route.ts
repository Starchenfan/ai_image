import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/models — 列出模型（可按服务筛选）。
 *
 * 只返回 enabled 的模型；若传 serviceId 则限定到该服务，
 * 结果按 sort 字段升序排列。供工作台模型选择器使用。
 */
// GET /api/models?serviceId=xxx
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  let models = db.models.filter((m) => m.enabled);
  if (serviceId) models = models.filter((m) => m.serviceId === serviceId);
  models = [...models].sort((a, b) => a.sort - b.sort);
  return NextResponse.json({ models });
}
