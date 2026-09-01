import type { GenerateTask, GeneratedImage, HistoryItem } from "@/lib/types";
import type { VersionTreeItem } from "./types";

export const MAX_NODE_WIDTH = 240;
export const MAX_NODE_HEIGHT = 320;
export const HORIZONTAL_GAP = 80;
export const VERTICAL_GAP = 40;

export function imageNodeSize(image: Pick<GeneratedImage, "width" | "height">) {
  const aspectRatio = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  let nodeWidth = MAX_NODE_WIDTH;
  let nodeHeight = nodeWidth / aspectRatio;
  if (nodeHeight > MAX_NODE_HEIGHT) {
    nodeHeight = MAX_NODE_HEIGHT;
    nodeWidth = nodeHeight * aspectRatio;
  }
  return { nodeWidth, nodeHeight };
}

export function createRootItem(task: GenerateTask, image: GeneratedImage): VersionTreeItem {
  const size = imageNodeSize(image);
  return {
    id: image.id,
    taskId: task.id,
    imageId: image.id,
    imageUrl: image.url,
    imageWidth: image.width,
    imageHeight: image.height,
    ...size,
    seed: image.seed,
    prompt: task.request.prompt,
    modelName: task.model?.displayName ?? "Unknown",
    serviceName: task.service?.name ?? "Unknown",
    status: "completed",
    // When the canvas is opened from a branch result, keep its real parent
    // image id. History loading will add that parent node and ReactFlow can
    // then restore the edge instead of treating the selected branch as a root.
    parentId: task.parentImageId ?? null,
    position: { x: 0, y: 0 },
    manualPosition: false,
  };
}

export function buildTreeFromHistory(
  history: HistoryItem[],
  rootTaskId: string,
  selectedImageId: string
) {
  const candidates = history.filter(
    (item) => item.rootImageId === rootTaskId || item.id === rootTaskId
  );
  const all: VersionTreeItem[] = [];

  for (const item of candidates) {
    const parentId = item.id === rootTaskId ? null : (item.parentImageId ?? null);
    for (const image of item.images) {
      const size = imageNodeSize(image);
      all.push({
        id: image.id,
        taskId: item.id,
        imageId: image.id,
        imageUrl: image.url,
        imageWidth: image.width,
        imageHeight: image.height,
        ...size,
        seed: image.seed,
        prompt: item.prompt,
        modelName: item.modelName,
        serviceName: item.serviceName,
        status: "completed",
        parentId,
        position: { x: 0, y: 0 },
        manualPosition: false,
      });
    }
  }

  const byId = new Map(all.map((item) => [item.id, item]));
  if (!byId.has(selectedImageId)) return [];

  const connected = new Set<string>();
  let ancestorId: string | null = selectedImageId;
  while (ancestorId && !connected.has(ancestorId)) {
    connected.add(ancestorId);
    const parentItem = byId.get(ancestorId);
    const parentId: string | null = parentItem?.parentId ?? null;
    // 把父节点的所有子节点（即当前节点的兄弟）也纳入，否则从子分支
    // 进入画布时只显示一条链路，父节点的其它分支全部丢失。
    if (parentId) {
      for (const item of all) {
        if (item.parentId === parentId && !connected.has(item.id)) {
          connected.add(item.id);
        }
      }
    }
    ancestorId = parentId;
  }

  const queue = [selectedImageId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const item of all) {
      if (item.parentId === parentId && !connected.has(item.id)) {
        connected.add(item.id);
        queue.push(item.id);
      }
    }
  }

  return all.filter((item) => connected.has(item.id));
}

export function layoutVersionTree(items: VersionTreeItem[]) {
  if (items.length === 0) return [];

  const byId = new Map(items.map((item) => [item.id, { ...item }]));
  const children = new Map<string, VersionTreeItem[]>();
  for (const item of items) {
    if (!item.parentId || !byId.has(item.parentId)) continue;
    const list = children.get(item.parentId) ?? [];
    list.push(item);
    children.set(item.parentId, list);
  }

  const root =
    items.find((item) => !item.parentId || !byId.has(item.parentId)) ?? items[0];
  const heights = new Map<string, number>();
  const measuring = new Set<string>();

  const subtreeHeight = (id: string): number => {
    const cached = heights.get(id);
    if (cached !== undefined) return cached;
    const item = byId.get(id);
    if (!item || measuring.has(id)) return item?.nodeHeight ?? 0;
    measuring.add(id);
    const childItems = children.get(id) ?? [];
    const childHeight = childItems.reduce(
      (sum, child, index) =>
        sum + subtreeHeight(child.id) + (index === 0 ? 0 : VERTICAL_GAP),
      0
    );
    measuring.delete(id);
    const height = Math.max(item.nodeHeight, childHeight);
    heights.set(id, height);
    return height;
  };

  const placed = new Set<string>();
  const place = (id: string, x: number, top: number) => {
    if (placed.has(id)) return;
    const item = byId.get(id);
    if (!item) return;
    placed.add(id);

    const height = subtreeHeight(id);
    item.position = { x, y: top + (height - item.nodeHeight) / 2 };
    const childItems = children.get(id) ?? [];
    const childrenHeight = childItems.reduce(
      (sum, child, index) =>
        sum + subtreeHeight(child.id) + (index === 0 ? 0 : VERTICAL_GAP),
      0
    );
    let childTop = top + (height - childrenHeight) / 2;
    for (const child of childItems) {
      const childHeight = subtreeHeight(child.id);
      place(child.id, x + item.nodeWidth + HORIZONTAL_GAP, childTop);
      childTop += childHeight + VERTICAL_GAP;
    }
  };

  place(root.id, 0, 0);

  // Corrupt or legacy lineage can leave disconnected items. Keep them visible
  // below the main tree rather than silently dropping them.
  let orphanTop = subtreeHeight(root.id) + VERTICAL_GAP;
  for (const item of items) {
    if (placed.has(item.id)) continue;
    place(item.id, 0, orphanTop);
    orphanTop += subtreeHeight(item.id) + VERTICAL_GAP;
  }

  return items.map((item) => byId.get(item.id)!);
}

export function nextChildPosition(
  parent: VersionTreeItem,
  siblings: VersionTreeItem[],
  childHeight: number
) {
  const x = parent.position.x + parent.nodeWidth + HORIZONTAL_GAP;
  if (siblings.length === 0) {
    return {
      x,
      y: parent.position.y + (parent.nodeHeight - childHeight) / 2,
    };
  }
  return {
    x,
    y: Math.max(...siblings.map((item) => item.position.y + item.nodeHeight)) + VERTICAL_GAP,
  };
}
