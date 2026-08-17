# AI Image Studio

AI Image Studio 是一个基于 Next.js 的多服务 AI 图像生成工作台。它支持接入多个图像生成服务和模型，并提供提示词编辑、动态参数配置、任务状态跟踪、结果预览、历史记录及后台管理功能。

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

- 当前数据层是服务端进程内存中的模拟数据库。
- 服务、模型、任务、历史记录和 API Key 会在服务重启后重置。
- 配置 MySQL 后，生成图片会保存到 `public/generated-images/`，图片元数据会写入 `generated_images` 表。
- 当前任务执行器是进程内实现，不适合多实例部署。
- 部分非 OpenAI 适配器目前使用模拟图片结果。
- 正式部署时应将数据层替换为持久化数据库，并使用独立任务队列。

## 安全注意事项

- 不要把真实 API Key 提交到 Git 仓库。
- 正式环境应通过环境变量或密钥管理服务注入凭据。
- 发布项目前应检查服务端种子数据，移除任何硬编码凭据。
- 管理接口目前没有身份认证，部署到公网前必须增加访问控制。

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

配置完成后重启开发服务器。新生成的图片文件保存在 `public/generated-images/`，数据库记录保存在 `ai.generated_images`。该目录已加入 `.gitignore`，不会提交生成图片。

## Git 忽略规则

项目根目录的 `.gitignore` 已排除依赖、Next.js 构建产物、测试报告、环境变量、本地日志及开发工具目录。可以提交 `.env.example` 作为环境变量模板，但不要提交包含真实凭据的 `.env` 文件。
