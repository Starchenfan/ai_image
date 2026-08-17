import type {
  AiModel,
  AiService,
  PromptTemplate,
  HistoryItem,
} from "./types";

/** Built-in prompt starters. Users can select one and continue editing it. */
export const defaultPromptTemplates: PromptTemplate[] = [
  {
    id: "tpl-chinese-garden",
    name: "江南园林",
    emoji: "🏮",
    prompt: "烟雨中的江南古典园林，白墙黛瓦，曲桥流水，庭院深处一位身着宋制汉服的少女撑着油纸伞，水墨画意境，电影级光影，细腻材质，高级构图",
    negativePrompt: "低清晰度，过曝，人物畸形，多余手指，文字，水印，杂乱背景",
    tags: ["国风", "建筑", "氛围"],
  },
  {
    id: "tpl-cinematic-portrait",
    name: "电影人像",
    emoji: "🎬",
    prompt: "一位年轻女性的电影感半身肖像，自然神态，柔和侧光，浅景深，真实皮肤纹理，克制的高级配色，背景干净，摄影棚级布光，85mm 镜头质感",
    negativePrompt: "塑料皮肤，过度磨皮，五官畸形，多余肢体，模糊，噪点，文字，水印",
    tags: ["人像", "摄影", "电影感"],
  },
  {
    id: "tpl-product-studio",
    name: "产品棚拍",
    emoji: "📦",
    prompt: "高端消费电子产品广告摄影，产品置于深色磨砂石材台面，轮廓光勾勒边缘，柔和渐变背景，材质细节清晰，留有品牌文案空间，商业棚拍，极简构图",
    negativePrompt: "文字乱码，错误商标，产品变形，杂乱反光，低清晰度，廉价塑料质感",
    tags: ["产品", "商业", "极简"],
  },
  {
    id: "tpl-future-city",
    name: "未来城市",
    emoji: "🌃",
    prompt: "雨夜中的近未来亚洲城市街道，湿润路面倒映霓虹灯，行人撑伞穿过蒸汽与薄雾，高密度建筑层次，真实电影场景，广角镜头，青紫色调，强烈空间纵深",
    negativePrompt: "卡通感，低细节，透视错误，重复人物，过度饱和，文字，水印",
    tags: ["科幻", "城市", "夜景"],
  },
  {
    id: "tpl-food-editorial",
    name: "美食杂志",
    emoji: "🍜",
    prompt: "一碗精致中式面食的美食杂志摄影，热气自然升腾，食材纹理清晰，木质餐桌，窗边柔和自然光，俯视与四十五度视角结合，温暖克制的色彩，编辑级构图",
    negativePrompt: "食物变形，餐具错乱，油腻高光，过饱和，低清晰度，文字，水印",
    tags: ["美食", "摄影", "杂志"],
  },
  {
    id: "tpl-childrens-illustration",
    name: "童书插画",
    emoji: "🦊",
    prompt: "一只背着小书包的橙色狐狸走在秋日森林小路上，周围有蘑菇和发光萤火虫，温暖治愈的儿童绘本插画，手绘质感，柔和色块，生动表情，清晰叙事画面",
    negativePrompt: "恐怖，阴暗，写实皮毛，复杂背景，角色畸形，文字，水印",
    tags: ["插画", "童书", "治愈"],
  },
  {
    id: "tpl-interior-design",
    name: "室内空间",
    emoji: "🛋️",
    prompt: "现代东方风格客厅室内设计，原木与米色石材，低矮家具，格栅屏风，绿植点缀，午后自然光穿过纱帘，空间通透，建筑摄影，真实材质，杂志级软装",
    negativePrompt: "空间扭曲，家具悬浮，过曝，杂乱陈设，廉价材质，人物，文字，水印",
    tags: ["室内", "设计", "东方"],
  },
  {
    id: "tpl-brand-poster",
    name: "品牌海报",
    emoji: "✨",
    prompt: "先锋时尚品牌视觉海报，单一主体居中，强烈留白，几何光影切割，高对比材质，冷静高级的色彩系统，编辑设计感，适合竖版社交媒体封面，无文字版式",
    negativePrompt: "乱码文字，复杂边框，廉价渐变，元素堆叠，低清晰度，水印，错误标志",
    tags: ["海报", "品牌", "时尚"],
  },
];

/**
 * No seed content. The workbench starts empty — the admin adds real
 * services/models via the adapter registry, so nothing is hard-coded.
 *
 * `placeholderDataUri` stays: it is a runtime image generator used by the
 * adapters when a (mock) generation completes, not seed/sample data.
 */

// Re-exported for type-only consumers that still import from here.
export type { AiService, AiModel, PromptTemplate, HistoryItem };

/** Deterministic-ish placeholder image as a data URI — no network, no real API key needed. */
export function placeholderDataUri(w: number, h: number, hue: number): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <radialGradient id="g" cx="30%" cy="25%" r="80%">
          <stop offset="0%" stop-color="hsl(${hue}, 70%, 45%)"/>
          <stop offset="55%" stop-color="hsl(${(hue + 40) % 360}, 60%, 28%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 200) % 360}, 50%, 12%)"/>
        </radialGradient>
        <filter id="n">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" filter="url(#n)"/>
    </svg>`
  )}`;
}
