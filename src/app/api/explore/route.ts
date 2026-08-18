import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPersistedHistory } from "@/lib/image-storage";

const CATEGORIES = ["全部", "热门", "最新", "人像", "风景", "二次元", "写实", "产品", "建筑", "艺术"];

function categoryFor(prompt: string) {
  const text = prompt.toLowerCase();
  const groups: Array<[string, string[]]> = [
    ["人像", ["人像", "人物", "肖像", "portrait", "女孩", "少女", "男孩"]],
    ["风景", ["风景", "山水", "森林", "海边", "天空", "landscape"]],
    ["二次元", ["二次元", "动漫", "动画", "anime", "漫画"]],
    ["写实", ["写实", "摄影", "真实", "photo", "realistic"]],
    ["产品", ["产品", "商品", "广告", "product"]],
    ["建筑", ["建筑", "室内", "城市", "庭院", "building", "interior"]],
  ];
  return groups.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || "艺术";
}

// GET /api/explore?category=人像
// Community gallery. Starts empty — items come from real generated + shared
// results, never hard-coded sample content.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const cat = url.searchParams.get("category") ?? "全部";
  const history = (await getPersistedHistory()) ?? db.history;
  const items = history.flatMap((history) =>
    history.images.map((image) => ({
      id: image.id,
      taskId: history.id,
      prompt: history.prompt,
      imageUrl: image.url,
      model: history.modelName,
      category: categoryFor(history.prompt),
      author: "本地创作",
      likes: history.favorite ? 1 : 0,
      aspect: history.aspectRatio,
      width: image.width,
      height: image.height,
      createdAt: history.createdAt,
    }))
  );
  let filtered = [...items];
  if (cat === "热门") filtered = [...items].sort((a, b) => b.likes - a.likes);
  else if (cat === "最新") filtered = [...items].sort((a, b) => b.createdAt - a.createdAt);
  else if (cat !== "全部") filtered = items.filter((i) => i.category === cat);
  return NextResponse.json({ items: filtered, categories: CATEGORIES });
}
