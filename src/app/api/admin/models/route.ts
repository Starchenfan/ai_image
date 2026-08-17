import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { AiModel } from "@/lib/types";
import { uid } from "@/lib/cn";

// GET /api/admin/models?serviceId=xxx
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sid = url.searchParams.get("serviceId");
  let models = db.models;
  if (sid) models = models.filter((m) => m.serviceId === sid);
  return NextResponse.json({ models });
}

// POST /api/admin/models  (add)
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<AiModel>;
  const model: AiModel = {
    id: uid("mdl"),
    serviceId: body.serviceId || "",
    displayName: body.displayName || "New Model",
    modelId: body.modelId || "new-model",
    description: body.description || "",
    type: "image",
    capabilities: body.capabilities || {
      textToImage: true,
      imageToImage: false,
      inpainting: false,
      negativePrompt: true,
      variations: false,
    },
    parameters: body.parameters || [],
    supportedAspectRatios: body.supportedAspectRatios || ["1:1"],
    supportedSizes: body.supportedSizes || ["1024x1024"],
    maxBatch: body.maxBatch ?? 1,
    priceCredits: body.priceCredits ?? 2,
    avgDurationSec: body.avgDurationSec ?? 10,
    rating: body.rating,
    tags: body.tags,
    enabled: body.enabled ?? true,
    sort: body.sort ?? db.models.length,
  };
  db.models.push(model);
  return NextResponse.json({ model });
}
