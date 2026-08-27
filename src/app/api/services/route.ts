import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/services — 列出所有已接入的 AI 服务。
 *
 * 供工作台服务选择器拉取服务列表。返回的 apiKey 字段已被 maskKey 脱敏
 * （如 sk-****-abcd），真实密钥只存在于服务端 db.apiKeys vault，
 * 不会泄露到客户端。
 */
// GET /api/services
export async function GET() {
  // 返回给客户端的 apiKey 字段已被 maskKey 脱敏（如 sk-****-abcd），
  // 真实密钥只存在服务端 db.apiKeys vault 中，此处直接透传即可。
  return NextResponse.json({ services: db.services });
}
