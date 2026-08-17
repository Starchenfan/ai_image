import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/polish
// Runs the user's prompt through a chat model on the 基元律动 relay to enrich
// it into a vivid, AI-painting-ready prompt. The real API key lives ONLY in
// the server-side vault (db.apiKeys) — never serialized to client.
//
// Hard-coding nothing about the provider here beyond the default service id:
// the model id + baseUrl + key all come from the seeded service/relay. If a
// future admin re-points the service or swaps the polish model, this still
// works as long as the relay speaks OpenAI-compat chat completions.

const POLISH_MODEL = "glm-5.2";
const POLISH_SYSTEM =
  "你是 prompt 润色助手。把用户给的图像描述润色成更生动、细节丰富、适合 AI 绘画的 prompt。" +
  "保持中文，只输出润色后的 prompt 一段话，不要分点、不要解释、不要加引号。";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { prompt?: string } | null;
  const prompt = body?.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });

  // Find the 基元律动 relay — prefer the seeded default, else any online
  // OpenAI-compat service with a vaulted key.
  const service =
    db.services.find((s) => s.id === "svc-tokenrhythm" && s.status === "online") ??
    db.services.find((s) => s.adapterType === "openai" && s.status === "online");
  if (!service) return NextResponse.json({ error: "没有可用的润色服务" }, { status: 503 });

  const apiKey = db.apiKeys.get(service.id);
  if (!apiKey) return NextResponse.json({ error: "服务未配置 API Key" }, { status: 503 });

  const url = `${service.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: POLISH_MODEL,
        messages: [
          { role: "system", content: POLISH_SYSTEM },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `润色服务返回 ${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const polished = data.choices?.[0]?.message?.content?.trim();
    if (!polished) return NextResponse.json({ error: "润色服务未返回内容" }, { status: 502 });

    return NextResponse.json({ polished, model: POLISH_MODEL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg.includes("abort") ? "润色超时" : `润色失败: ${msg}` },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
