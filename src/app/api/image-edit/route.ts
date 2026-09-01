import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/adapters";
import type { ImageEditRequest, ImageEditResult } from "@/lib/types";

/**
 * POST /api/image-edit — AI 图片编辑。
 *
 * 接收编辑请求（源图 + 操作类型 + prompt + 可选 mask），
 * 从服务端 vault 注入真实 API Key，调用对应适配器的 editImage()。
 *
 * 关键设计：API Key 从服务端 vault 注入，绝不读取客户端。
 *
 * 失败路径：
 *   - 404 服务或模型不存在
 *   - 503 服务不在线
 *   - 400 prompt 为空
 *   - 500 适配器执行失败
 */
// POST /api/image-edit
export async function POST(req: Request) {
  const body = (await req.json()) as ImageEditRequest;
  const service = db.services.find((s) => s.id === body.serviceId);
  const model = db.models.find((m) => m.id === body.modelId);

  if (!service) return NextResponse.json({ error: "service not found" }, { status: 404 });
  if (!model) return NextResponse.json({ error: "model not found" }, { status: 404 });
  if (service.status !== "online")
    return NextResponse.json(
      { error: `服务 ${service.name} 当前不可用 (${service.status})` },
      { status: 503 }
    );
  if (!body.prompt?.trim())
    return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });

  const adapter = getAdapter(service.adapterType);

  if (!adapter.editImage) {
    return NextResponse.json(
      { error: `服务 ${service.name} 的适配器不支持图片编辑` },
      { status: 400 }
    );
  }

  // 从服务端 vault 注入真实 Key —— 绝不读取客户端
  const params: ImageEditRequest = {
    ...body,
    service,
    model,
    apiKey: db.apiKeys.get(service.id),
  };

  try {
    const results: ImageEditResult[] = await adapter.editImage(params);
    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}