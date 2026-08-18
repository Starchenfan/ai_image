import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  deletePersistedHistory,
  getPersistedHistoryItem,
  setPersistedFavorite,
} from "@/lib/image-storage";

// DELETE /api/history/:id
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const persisted = await deletePersistedHistory(params.id);
  const idx = db.history.findIndex((h) => h.id === params.id);
  if (idx !== -1) db.history.splice(idx, 1);
  if (!persisted && idx === -1)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// PATCH /api/history/:id  (toggle favorite)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const item = db.history.find((h) => h.id === params.id);
  const body = (await req.json()) as { favorite?: boolean };
  if (typeof body.favorite !== "boolean")
    return NextResponse.json({ error: "favorite must be boolean" }, { status: 400 });
  const persisted = await setPersistedFavorite(params.id, body.favorite);
  if (item) item.favorite = body.favorite;
  const persistedItem = await getPersistedHistoryItem(params.id);
  if (!item && !persisted && !persistedItem)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ item: persistedItem || item });
}
