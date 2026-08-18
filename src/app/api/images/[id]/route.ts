import { NextResponse } from "next/server";
import { getPersistedImage } from "@/lib/image-storage";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const image = await getPersistedImage(params.id);
  if (!image) return NextResponse.json({ error: "image not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
