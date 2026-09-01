# 绘界

绘界是一个基于 Next.js 的多服务 AI 图像生成工作台。它支持接入多个图像生成服务和模型，并提供提示词编辑、动态参数配置、任务状态跟踪、结果预览、历史记录及后台管理功能。

> 完整架构文档见 **[ARCHITECTURE.md](ARCHITECTURE.md)** —— 请求生命周期、适配器系统、数据层、schema 驱动参数都在里面。

## 功能特性

- 多 AI 服务与多模型切换
- 文生图参数配置与批量生成
- 基于模型 Schema 的动态参数表单
- 提示词模板与 AI 提示词润色
- 生成任务状态跟踪和失败重试
- 图片预览与下载
- 生成历史和作品探索页面
- 服务、模型及 API Key 后台管理
- NewAPI、One-API 等 OpenAI 兼容中转站导入
- API Key 仅在服务端处理，客户端只显示脱敏结果
- **版本树（二次创作）**：在任一已生成图片基础上改 prompt / 取变体 / 图生图，产生带父任务链路的子任务，历史记录可还原整棵分支树

## 技术栈

- Next.js 14（App Router）
- React 18
- TypeScript
- Tailwind CSS
- Radix UI
- TanStack Query
- Zustand
- Playwright

## 环境要求

- Node.js 18.17 或更高版本，推荐使用 Node.js 20 LTS
- npm 9 或更高版本

## 安装与运行

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

浏览器访问：

```text
http://localhost:3001
```

生产构建与启动：

```bash
npm run build
npm run start
```

## 页面入口

| 路径 | 用途 |
| --- | --- |
| `/` | 图像生成工作台 |
| `/explore` | 作品探索 |
| `/history` | 生成历史 |
| `/admin` | 服务与模型管理 |
| `/admin/services/[id]` | 单个服务及其模型配置 |

## 接入图像服务

1. 启动项目并打开 `/admin`。
2. 手动添加服务，或使用“导入 NewAPI”读取兼容服务的模型列表。
3. 填写服务名称、Base URL 和 API Key。
4. 添加或选择图像模型，并配置支持的尺寸、比例、批量数量和动态参数。
5. 返回工作台选择服务与模型，然后提交生成任务。

OpenAI 兼容服务默认调用以下接口：

```text
POST {baseUrl}/images/generations
```

请求包含 `model`、`prompt`、`n`、`size` 以及模型 Schema 中声明的扩展参数。

## 项目结构

```text
studio/
├─ scripts/                  # 辅助脚本
├─ src/
│  ├─ app/                  # 页面、布局和 API Routes
│  │  ├─ (app)/             # 工作台、探索、历史和管理页面
│  │  └─ api/               # 服务端接口
│  ├─ components/           # 业务组件和基础 UI 组件
│  └─ lib/                  # 类型、状态、适配器、任务及数据层
├─ next.config.js
├─ tailwind.config.ts
├─ tsconfig.json
└─ package.json
```

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 在 `3001` 端口启动开发服务器 |
| `npm run build` | 创建生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 执行 Next.js 代码检查 |

## 当前实现说明

- **图片 / 历史 / 预设**: 配了 MySQL 就写 `generated_images` 表 (LONGBLOB), 重启不丢;
  没配则走 `public/generated-images/` + `.studio/generated/*.json` 本地 fallback。
  当前本机 MySQL 已配置并生效 (见「MySQL 图片持久化」)。
- **服务 / 模型 / API Key / 额度 / 模板**: 仍在进程内存, 服务重启后回到 seed 状态
  (4 个种子服务由 `db.ts` 幂等合并恢复; admin 后加的会丢失)。
- 当前任务执行器是进程内实现, 不适合多实例部署。
- 部分非 OpenAI 适配器 (`flux` / `stable_diffusion` / `custom` / `proxy`) 目前使用模拟图片结果。
- 正式部署时应将数据层替换为持久化数据库, 并使用独立任务队列。

## 安全注意事项

- 不要把真实 API Key 提交到 Git 仓库。种子服务的 Key 通过
  `STEP_API_KEY`、`AIXORAS_API_KEY`、`DEFAULT_API_KEY` 和
  `SENSENOVA_API_KEY` 环境变量注入。
- `/admin`、`/api/admin/*` 和 Credits 修改接口受管理员登录保护。
  首次部署时必须配置 `ADMIN_PASSWORD` 和随机的
  `ADMIN_SESSION_SECRET`；浏览器登录会话默认保持 30 天。
- 正式环境应通过环境变量或密钥管理服务注入凭据。
- 发布项目前应检查服务端种子数据，移除任何硬编码凭据。
- 管理员密码和会话密钥不能使用 `.env.example` 中的占位值。

## MySQL 图片持久化

复制环境变量模板：

```bash
copy .env.example .env.local
```

编辑 `.env.local`，填写本机 MySQL 用户名和密码：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=ai
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
```

配置完成后重启开发服务器。应用会自动兼容并补齐现有 `generated_images` 表的字段。图片二进制保存在 `image_data` 字段，历史页面通过 `/api/images/[id]` 从数据库读取图片。新图片不再额外写入本地目录，避免重复占用空间；已有的 `public/generated-images/` 文件不会自动删除。

新生成的静态图片会在写入前尝试转换为高质量 WebP。默认质量为 `90`，可以通过 `IMAGE_STORAGE_WEBP_QUALITY=1-100` 调整；压缩后节省不足 5% 时保留原格式，GIF 和 SVG 不转换。

大尺寸图片写入失败时，请确认 MySQL 的 `max_allowed_packet` 足够大，例如设置为 `64M` 或更高。

## Git 忽略规则

项目根目录的 `.gitignore` 已排除依赖、Next.js 构建产物、测试报告、环境变量、本地日志及开发工具目录。可以提交 `.env.example` 作为环境变量模板，但不要提交包含真实凭据的 `.env` 文件。
