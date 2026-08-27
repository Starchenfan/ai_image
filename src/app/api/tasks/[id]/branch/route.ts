import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readImage, imageFileExtension } from "@/lib/image-utils";
import { enqueueTask } from "@/lib/task-runner";
import { uid } from "@/lib/cn";
import type { BranchRequest, GenerateParams } from "@/lib/types";

/**
 * POST /api/tasks/:id/branch — 在某张已生成图片的基础上「继续修改」。
 *
 * 这是「版本树」功能的写入口。客户端不需要重新描述整套参数——服务端从父任务
 * 继承 model / service / count / aspectRatio / size / parameters，只额外接收
 * 「改哪张图（parentImageId）+ 怎么改（editMode + promptDelta）」。
 *
 * 三种模式的 prompt / 参考图处理：
 *   - reprompt  改 prompt：父 prompt 与用户写的 delta 拼接，不传参考图
 *   - variant   变体：prompt 不变，seed 重新随机（-1），不传参考图
 *   - edit      图生图：把父图转成 base64 data URL 当 referenceImage，
 *               由 adapter 走 /images/edits 真正以图生图
 *
 * 链路字段（parentTaskId / branchId / rootImageId）一并写进新任务，
 * 供二期画布视图还原整棵分支树。
 *
 * 失败路径：
 *   - 404 父任务不存在
 *   - 400 指定的父图不在该任务的 images[] 中，或 editMode 非法
 *   - 503 父任务对应的服务当前不在线
 *   - 402 Credits 不足
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = (await req.json()) as BranchRequest;
  const parent = db.tasks.get(params.id);
  if (!parent) {
    return NextResponse.json({ error: "父任务不存在" }, { status: 404 });
  }
  if (!parent.model || !parent.service) {
    return NextResponse.json(
      { error: "父任务缺少模型/服务信息，无法继承参数" },
      { status: 400 }
    );
  }

  const img = parent.images.find((i) => i.id === body.parentImageId);
  if (!img) {
    return NextResponse.json(
      { error: `指定的图片 ${body.parentImageId} 不在父任务结果中` },
      { status: 400 }
    );
  }

  const modes: BranchRequest["editMode"][] = ["reprompt", "variant", "edit"];
  if (!modes.includes(body.editMode)) {
    return NextResponse.json({ error: "editMode 非法" }, { status: 400 });
  }

  if (parent.service.status !== "online") {
    return NextResponse.json(
      { error: `服务 ${parent.service.name} 当前不可用 (${parent.service.status})` },
      { status: 503 }
    );
  }

  // 继承父任务的生成参数，overrides 只覆盖客户端显式指定的字段。
  const ov = body.overrides ?? {};
  const count = ov.count ?? parent.request.count;
  const aspectRatio = ov.aspectRatio ?? parent.request.aspectRatio;
  const size = ov.size ?? parent.request.size;
  const seed = ov.seed ?? (body.editMode === "variant" ? -1 : parent.request.seed);
  const parameters = ov.parameters ?? parent.request.parameters;

  // 按模式组装最终 prompt 与参考图。
  let prompt = parent.request.prompt;
  let referenceImage: string | undefined;
  if (body.promptDelta?.trim()) {
    prompt = `${parent.request.prompt} ${body.promptDelta.trim()}`;
  }
  if (body.editMode === "edit") {
    referenceImage = await fetchImageAsDataUrl(img.url, req);
  }

  const cost = parent.model.priceCredits * count;
  if (db.credits < cost) {
    return NextResponse.json(
      { error: "Credits 不足", cost, balance: db.credits },
      { status: 402 }
    );
  }

  const genParams: GenerateParams = {
    model: parent.model,
    service: parent.service,
    prompt,
    negativePrompt: parent.request.negativePrompt,
    count,
    aspectRatio,
    size,
    seed,
    parameters,
    referenceImage,
    apiKey: db.apiKeys.get(parent.service.id),
  };

  // 链路：rootImageId 沿祖父的根一路传下去，根任务自身为 undefined。
  const rootImageId = parent.rootImageId ?? parent.id;
  const task = enqueueTask(genParams, {
    parentTaskId: parent.id,
    parentImageId: img.id,
    branchId: uid("branch"),
    rootImageId,
    editMode: body.editMode,
    modificationPrompt: body.promptDelta?.trim() || undefined,
  });

  return NextResponse.json({ task });
}

/**
 * fetchImageAsDataUrl — 把任意图片 URL 转成 base64 data URL。
 *
 * 父图的 url 可能是 OSS 外链，也可能是 /api/images/[id]（MySQL 后端
 * 从 LONGBLOB 里读）。adapter 只认 data URL，所以分支时要在服务端
 * 先拉下来再编码。拉不到就抛错，让这次分支整体失败而不是传一个坏引用图。
 *
 * 注意：持久化后的图片 url 是相对路径（/api/images/[id]），而 Node 的 fetch
 * 要求绝对 URL——这里用请求的 origin 解析，同时兼容 OSS 外链。
 */
async function fetchImageAsDataUrl(url: string, req: Request): Promise<string> {
  const absolute = new URL(url, new URL(req.url).origin);
  const { data, mimeType } = await readImage(absolute.href);
  const ext = imageFileExtension(mimeType);
  return `data:image/${ext};base64,${data.toString("base64")}`;
}