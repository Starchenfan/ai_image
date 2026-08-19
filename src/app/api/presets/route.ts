import { NextResponse } from "next/server";
import { listPresets, createPreset } from "@/lib/presets";
import type { Preset } from "@/lib/types";

// GET /api/presets
export async function GET() {
  const presets = await listPresets();
  return NextResponse.json({ presets });
}

// POST /api/presets
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | (Omit<Preset, "id" | "createdAt"> & { name?: string })
    | null;
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name 必填" }, { status: 400 });
  }
  if (!body.serviceId || !body.modelId) {
    return NextResponse.json(
      { error: "serviceId / modelId 必填" },
      { status: 400 }
    );
  }
  const preset = await createPreset({
    name: body.name.trim(),
    serviceId: body.serviceId,
    modelId: body.modelId,
    prompt: body.prompt,
    negativePrompt: body.negativePrompt,
    count: body.count ?? 1,
    aspectRatio: body.aspectRatio ?? "1:1",
    size: body.size ?? "1024x1024",
    seed: body.seed ?? -1,
    parameters: body.parameters ?? {},
  });
  return NextResponse.json({ preset });
}
