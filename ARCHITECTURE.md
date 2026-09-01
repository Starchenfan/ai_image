# 绘界 · 架构文档

多服务 AI 图像生成工作台。一个 Next.js 前端 + 内嵌 API 层，把多个第三方图像
中转/网关统一成一套 OpenAI-compat 接口 —— 用户只管选模型、写 prompt、出图。

读这份文档的预期：想知道「请求从点下按钮到出图走了哪些代码」看第 3 节；
想知道「怎么加一个新中转」看第 4 节；想知道「数据存哪儿」看第 5 节。

---

## 1. 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 14 App Router, React 18 |
| 语言 | TypeScript 5.7 (strict) |
| 样式 | Tailwind CSS 3.4 + 自建 `tokens.css` |
| UI | Radix UI (dialog/dropdown/select/slider/tabs/tooltip/popover) |
| 状态 | Zustand (studio 表单态) + TanStack Query (服务端缓存) |
| 图像 | sharp (WebP 优化) |
| 网络 | undici (全局代理分发) |
| 数据 | mysql2 (可选), 本地 fs (fallback) |
| 字体 | Geist Sans/Mono (变量字体) |

## 2. 目录结构

```
studio/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx           全局壳 (TopNav + max-w 1600 容器)
│  │  ├─ template.tsx         路由级模板: View Transitions + fade-in
│  │  ├─ globals.css          设计 token (OKLCH 变量)
│  │  ├─ tokens.css           同上, 单一事实源
│  │  ├─ (app)/               5 个页面 + template.tsx
│  │  │  ├─ page.tsx          工作台 (左参数轨 + 右画布)
│  │  │  ├─ explore/page.tsx  社区探索 (瀑布流)
│  │  │  ├─ history/page.tsx  生成历史
│  │  │  ├─ stats/page.tsx    统计仪表盘
│  │  │  ├─ admin/page.tsx    服务/模型 CRUD
│  │  │  └─ template.tsx      路由过渡
│  │  └─ api/                 17 个 REST/SSE 路由
│  │     ├─ generate/route.ts         POST 提交生成任务
│  │     ├─ generate/[id]/retry/route.ts  从历史复用重跑
│  │     ├─ tasks/[id]/route.ts       轮询任务状态
│  │     ├─ tasks/[id]/stream/route.ts SSE 推任务状态
│  │     ├─ services/route.ts         服务列表
│  │     ├─ models/route.ts           模型列表 (按服务过滤)
│  │     ├─ models/[id]/route.ts      单模型
│  │     ├─ credits/route.ts          额度 + 自动故障切换
│  │     ├─ history/route.ts          历史列表 (支持 today/favorite)
│  │     ├─ history/[id]/route.ts     删除 / 收藏
│  │     ├─ images/[id]/route.ts      读图片二进制
│  │     ├─ explore/route.ts          社区作品 (按分类)
│  │     ├─ stats/route.ts            统计聚合
│  │     ├─ presets/route.ts          预设 CRUD
│  │     ├─ templates/route.ts        prompt 模板
│  │     ├─ polish/route.ts           AI 润色 prompt
│  │     └─ admin/
│  │        ├─ services/route.ts      服务 CRUD
│  │        ├─ models/route.ts        模型 CRUD
│  │        ├─ models/[id]/route.ts   单模型 CRUD
│  │        └─ import/newapi/route.ts NewAPI/One-API 中转导入
│  ├─ components/
│  │  ├─ top-nav.tsx           全局顶栏 (服务状态 + 额度 + 用户)
│  │  ├─ providers.tsx         TanStack Query + React Query 提供者
│  │  ├─ studio/               工作台表单组件 (10 个)
│  │  └─ ui/                   15 个 Radix 封装的基础件
│  └─ lib/
│     ├─ types.ts              21 个领域接口, 无硬编码供应商
│     ├─ db.ts                 内存 DB + seed + 服务端 key vault
│     ├─ adapters.ts           5 个适配器, OpenAICompatAdapter 是主路径
│     ├─ task-runner.ts        进程内任务队列
│     ├─ image-storage.ts      MySQL 持久化 + 本地 fallback
│     ├─ image-utils.ts        sharp 解码/优化
│     ├─ store.ts              Zustand studio 表单态
│     ├─ seed.ts               prompt 模板 + placeholder 图
│     ├─ proxy.ts              undici 全局代理
│     ├─ presets.ts            预设 MySQL 存储
│     ├─ style-library.md      prompt 润色风格库
│     ├─ mask.ts               key 脱敏
│     ├─ cn.ts                 className 合并 + 时间/时长格式化 + uid
│     └─ use-models.ts         react-query 模型钩子
├─ scripts/                    一次性诊断脚本 (probe-*)
├─ design.md                   设计系统单一事实源
├─ README.md                   用户文档
└─ ARCHITECTURE.md             本文
```

## 3. 请求生命周期

```
用户点「生成」
  │
  ├─ studio/page.tsx handleGenerate()
  │   └─ useStudio.buildRequest() → GenerateRequest
  │       (serviceId / modelId / prompt / count / aspectRatio / size / seed / parameters)
  │
  ├─ POST /api/generate
  │   ├─ 校验 service + model 存在, 服务状态 online
  │   ├─ 校验额度: priceCredits × count ≤ db.credits
  │   ├─ enqueueTask(params)          ← task-runner.ts
  │   │   ├─ 建 task (status=queued), 进 db.tasks
  │   │   └─ void runTask(id, params)  ← 后台异步, 不阻塞响应
  │   └─ 注入 apiKey: db.apiKeys.get(service.id)  ← 真实 key 只在此处
  │
  ├─ runTask() 后台流程
  │   ├─ wait(400) → processing, progress 12
  │   ├─ 8 次 tick 动画 → generating, progress 28→88
  │   ├─ getAdapter(service.adapterType).generate(params)
  │   │   └─ OpenAICompatAdapter.generate()
  │   │       ├─ 无 key → mockGenerate (占位图)
  │   │       ├─ referenceImage → edit() → POST /images/edits
  │   │       └─ 否则 → POST /images/generations
  │   │           ├─ body = { model, prompt, n, size } + schema 声明的参数
  │   │           ├─ seed 夹紧/取整, -1 时 delete body.seed
  │   │           ├─ fetch 失败 → 重试 3 次 (429/500/502/503/504/524, 90s 超时)
  │   │           └─ 400 未知字段 → 去掉 extras, 用 core 重试一次
  │   ├─ persistGeneratedImages(task, images)   ← MySQL 或本地
  │   ├─ status=completed, credits 扣减, pushHistory
  │   └─ 失败 → status=failed, 记 errorMessage
  │
  └─ 前端 SSE /api/tasks/[id]/stream (700ms 推) 或轮询
      └─ 收到 completed → ResultGrid 渲染
```

## 4. 适配器系统

`ImageProvider` 接口 (`types.ts:176`)：

```ts
interface ImageProvider {
  readonly adapterType: AdapterType;
  generate(params: GenerateParams): Promise<GenerateProviderResult>;
  getTaskStatus?(taskId: string): Promise<ProviderTaskStatus>;
  cancelTask?(taskId: string): Promise<void>;
}
```

`AdapterType = "openai" | "flux" | "stable_diffusion" | "custom" | "proxy"`。

`getAdapter(type)` 从 `adapters.ts:289` 的 `adapters` Map 取实例。
**只有 `openai` 是真实实现** (`OpenAICompatAdapter`), 其余四个
(`FluxAdapter` / `StableDiffusionAdapter` / `CustomAdapter` / `ProxyAdapter`)
目前都是 `mockGenerate` —— 生成占位 SVG, 不调用任何上游。

**加一个新中转 = 三步, 不动前端:**
1. 在 `db.ts` 加服务常量 + `seedServices` 条目 (adapterType 一般选 `openai`)
2. 加 `seedModels` 条目: `modelId` (上游真名) + `capabilities` + `parameters` schema
3. 在 `.env.local` 配置对应的服务端环境变量，并把它加入 `seedApiKeys`
   映射 (真实 key 只进服务端 vault), `NO_PROXY` 补域名

`OpenAICompatAdapter` 关键行为:
- **schema 驱动发参**: 只发 `model.parameters` 里声明过的 key。严格中转
  (基元律动) 对任何未知 key 直接 400, 所以 schema 要精确。
- **strict relay 兼容**: 400 且消息含「未知字段」→ 丢掉 extras, 只用
  `{model, prompt, n, size}` 重试一次。
- **seed 处理**: 从顶层 `seed` 和 `parameters.seed` 两处解析, 夹紧到
  `[min, max]`, 取整。`-1` / 缺失 → `delete body.seed` 让上游随机。
  (坑: schema 循环可能先复制了 `seed: -1`, 必须删掉否则上游 400。)
- ** transient 重试**: `429/500/502/503/504/524` 重试 3 次, 指数退避
  (800ms × attempt), 客户端 90s 超时 (比 Cloudflare 524 的 ~100s 早 10s)。

## 5. 数据层

### 5.1 内存 DB (`db.ts`)

进程内 singleton, 挂在 `globalThis.__studioStore`。**重启即重置**, 但
`db.ts` 底部有幂等 seed: 缺失的种子服务/模型/key 会合并回去, 不覆盖运行时
admin 的修改。热重载 (HMR) 重跑模块时不会丢状态。

存什么: `services[]` / `models[]` / `tasks` Map / `history[]` /
`templates[]` / `credits` (number) / `autoFailover` / `apiKeys` Map。

### 5.2 服务端 key vault

`db.apiKeys: Map<serviceId, string>` —— 真实 key 从服务端环境变量加载后，
**只进入这个进程内存 Map**。
`AiService.apiKeyMasked` 是 `前3-后4` 脱敏值 (`mask.ts`), 序列化到客户端。
`/api/generate` 和 `/api/generate/[id]/retry` 从 vault 注入 key,
请求体里的 key 从不来自客户端。

### 5.3 图片持久化 (`image-storage.ts`)

`isImageDatabaseConfigured()` 判 `MYSQL_USER && MYSQL_DATABASE` 是否都配了。

- **MySQL 配了** → `generated_images` 表, `image_data LONGBLOB` 存 WebP 二进制,
  `ensureSchema()` 自动 `CREATE TABLE` + `ALTER TABLE` 补字段 (兼容老表)。
- **没配** → `public/generated-images/<id>.webp` + `.studio/generated/<task>.json`。

API `/api/images/[id]` 屏蔽差异, 历史查询 `getPersistedHistory()` 同样双路。
MySQL 失败时静默降级 (打印 error, 返回原始 image 对象), 不阻塞出图。

### 5.4 预设 (`presets.ts`)

同样 MySQL / 本地双路。本地预设存哪? 看 `presets.ts` 的 fallback 实现。

## 6. 动态参数 Schema

`ModelParameterSchema` (`types.ts:27`) 是前端渲染的唯一事实源:

```ts
{ key, type, label, description?, min?, max?, step?, default?,
  options?, group?, advanced?, hidden? }
```

`type` 决定控件: `slider` / `select` / `boolean` / `number` / `text`。
`group` 分 basic / advanced / sampler / quality。`advanced` 挡在「高级」折叠后。
`hidden` = 声明了字段让 adapter 转发, 但 UI 不显示 (如 `seed`)。

工作台 `param-panel.tsx` + `dynamic-field.tsx` 完全由 schema 渲染,
不硬编码任何参数。模型换了, 表单自动跟着变。

## 7. 任务状态机

`TaskStatus = queued | processing | generating | completed | failed | canceled`

`task-runner.ts` 的 `runTask` 是**进程内 async**, 不抗多实例、不抗重启。
进度条是 8 次 `setTimeout` tick 动画 (不是真进度), 真实耗时在完成后算。
生产替换: BullMQ + Redis + SSE/WebSocket fan-out, `enqueueTask` 接口不用动。

SSE (`tasks/[id]/stream`) 是主通道, 700ms 推一次, 60s 安全关;
`tasks/[id]` 轮询是兜底。

## 8. 设计系统

`design.md` 是锁定的单一事实源, 不按页重生。cosmic/technical 风格:
品牌渐变 navy→blue→cyan (`#0A194F→#2D6BFF→#23D1FF`), 青色印章强调。
`tokens.css` 是 CSS 变量唯一入口, Tailwind 用 `color-mix` 包装以支持
opacity 修饰符 (裸 `var()` 加 opacity 会变透明)。

## 9. 环境配置

`.env.local` (本地, gitignored) vs `.env.example` (提交)。

| 变量 | 作用 |
|---|---|
| `MYSQL_*` | 图片/历史/预设持久化。没配则走本地 fs |
| `IMAGE_STORAGE_WEBP_QUALITY` | 存储 WebP 质量 (默认 90), GIF/SVG 不转 |
| `HTTP_PROXY` / `HTTPS_PROXY` | 服务器端出站代理 (undici) |
| `NO_PROXY` | 直连 hosts 白名单, 逗号分隔 |
| `*_API_KEY` | 四个种子图像服务的服务端凭据 |
| `ADMIN_PASSWORD` | 管理后台登录密码 |
| `ADMIN_SESSION_SECRET` | 管理会话 HMAC 签名密钥 |

`.env.local` 当前 `NO_PROXY` 已含 `localhost,127.0.0.1,tokenrhythm.studio,
api.stepfun.com,stepfun.com,token.sensenova.cn,sensenova.cn,api.aixoras.com,
aixoras.com` —— 这些直连不走代理。

## 10. 当前 seed 的服务/模型

| 服务 | adapter | 模型 |
|---|---|---|
| 基元律动 tokenrhythm.studio | openai | Qwen Image 2.0, Wan 2.7 Image |
| 商汤日日新 token.sensenova.cn | openai | 日日新 U1.5 Lite |
| 阶跃星辰 api.stepfun.com | openai | step-image-edit-2, step-2x-large |
| Aixoras api.aixoras.com | openai | GPT Image 2 |

共 4 服务 7 模型, 全部 `online`, key 全部 vaulted。

## 11. 已知边界

- **数据**: 图片/历史/预设配了 MySQL 则持久化; 服务/模型/key/额度/模板仍在进程内存,
  重启回到 seed (admin 后加的会丢)。
- **任务队列**: 进程内 async, 不适合多实例。注释写明生产换 BullMQ。
- **非 openai 适配器**: flux/sd/custom/proxy 仍生成占位图, 无真实实现。
- **管理认证**: `/admin`、`/api/admin/*` 和 Credits 写操作使用 30 天签名
  Cookie 会话；生产环境必须设置独立的强密码与随机签名密钥。
- **Aixoras 是中转**: 结果与 OpenAI 官网不一致 (后端/默认参数/seed 策略不同),
  不能当官方替代品。
- **`/api/polish` 硬编码 `POLISH_MODEL = "glm-5.2"`**: 换中转会坏, 应从服务/模型动态取。
