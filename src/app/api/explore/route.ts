import { NextResponse } from "next/server";

const CATEGORIES = ["全部", "热门", "最新", "人像", "风景", "二次元", "写实", "产品", "建筑", "艺术"];

// GET /api/explore?category=人像
// Community gallery. Starts empty — items come from real generated + shared
// results, never hard-coded sample content.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = url.searchParams.get("category") ?? "全部";
  const items: {
    id: string;
    prompt: string;
    model: string;
    category: string;
    author: string;
    likes: number;
    aspect: string;
    hue: number;
  }[] = [];
  let filtered = [...items];
  if (cat === "热门") filtered = [...items].sort((a, b) => b.likes - a.likes);
  else if (cat === "最新") filtered = [...items].reverse();
  else if (cat !== "全部") filtered = items.filter((i) => i.category === cat);
  return NextResponse.json({ items: filtered, categories: CATEGORIES });
}
