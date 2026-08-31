"use client";

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type MutableRefObject,
} from "react";
import {
  DndContext,
  useDraggable,
  useSensors,
  useSensor,
  PointerSensor,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  X,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Loader2,
  ImagePlus,
  Move,
  Grip,
  Trash2,
  Edit,
  RefreshCw,
  Image,
  GitCommit,
} from "lucide-react";
import type {
  GenerateTask,
  GeneratedImage,
  TaskStatus,
  BranchMode,
  HistoryItem,
} from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * TreeCanvas — 「二次创作」的全屏树状画布（Figma / Draw.io 风格的无限画布）。
 *
 * 它取代原来那个居中的小 modal：把父图铺成画布的根节点，每点一次「二次创作」
 * 就在右侧长出一个分支节点，分支再分支……整棵树铺满全屏，鼠标可以拖拽平移、
 * 滚轮缩放，点节点上的「+」即可在该节点上继续改。
 *
 * 数据模型：每个节点 = 一张图（image.id）。节点之间的父子关系由
 * `parentId`（= 父图的 image.id）表达，这就是「树」而不是「列表」。
 * 服务端已经把 parentImageId / rootImageId 写进每条历史，重启后也能还原整棵树。
 *
 * 两种使用场景，同一个组件：
 *   1. 首次分支（父图刚生成完）：只有根节点，点 + 即开始。
 *   2. 回看已有分支树：从 /api/history 里捞出 rootImageId 一致的历史，
 *      还原出已有的整棵树，再继续往下加。
 */

const MAX_NODE_W = 240;
const MAX_NODE_H = 320;
const GAP_X = 340;
const GAP_Y = 56;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

interface CanvasNode {
  id: string; // 图片 id
  taskId: string;
  imageId: string;
  url: string;
  width: number;
  height: number;
  seed: number;
  prompt: string;
  modelName: string;
  serviceName: string;
  status: TaskStatus;
  parentId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  // 用户手动拖拽过的位置：true 时 computeLayout 跳过该节点，
  // 保留它的 x/y，子节点仍相对它排列。
  positioned?: boolean;
  // 未完成的分支节点：id 是临时占位，完成后换成真实 image id
  pending?: boolean;
}

function nodeSize(img: GeneratedImage) {
  const ar = img.width && img.height ? img.width / img.height : 1;
  let w = MAX_NODE_W;
  let h = w / ar;
  if (h > MAX_NODE_H) {
    h = MAX_NODE_H;
    w = h * ar;
  }
  return { w, h };
}

/** 从历史记录里还原出以 rootImageId 为根的整棵树。 */
function buildTreeFromHistory(
  items: HistoryItem[],
  rootTaskId: string,
  rootImageId: string
): CanvasNode[] {
  const candidates = items.filter(
    (it) => it.rootImageId === rootTaskId || it.id === rootTaskId
  );
  const built: CanvasNode[] = [];
  for (const it of candidates) {
    const parentId = it.id === rootTaskId ? null : (it.parentImageId ?? null);
    for (const img of it.images) {
      const s = nodeSize(img);
      built.push({
        id: img.id,
        taskId: it.id,
        imageId: img.id,
        url: img.url,
        width: img.width,
        height: img.height,
        seed: img.seed,
        prompt: it.prompt,
        modelName: it.modelName,
        serviceName: it.serviceName,
        status: "completed",
        parentId,
        x: 0,
        y: 0,
        w: s.w,
        h: s.h,
      });
    }
  }

  // 从点击的根图 id 出发，沿 parentId 向上找到所有祖先，再向下 BFS 找到所有后代，
  // 取并集 = 与该图连通的整棵树（根任务的其它并列图不算在内）。
  const byId = new Map(built.map((n) => [n.id, n]));
  if (!byId.has(rootImageId)) return [];
  const connected = new Set<string>();
  // 向上
  let cur: string | null = rootImageId;
  while (cur) {
    connected.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  // 向下
  const queue: string[] = [rootImageId];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of built) {
      if (n.parentId === c && !connected.has(n.id)) {
        connected.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return built.filter((n) => connected.has(n.id));
}

/** 给树排版：父节点居中于子节点，整棵树居中于 (0,0)。
    positioned 节点（用户手动拖过）保留原位，子节点仍相对它排列。

    坐标约定：返回的是「绝对画布坐标」（树心在原点）。
    第一次布局（lastLayout 为空）时整棵树从头排，居中偏移量算一次存进 centerRef。
    之后每次布局，已排过版的节点冻结在上一次的绝对坐标上，只把新节点
    （分支新加的）相对父节点排一遍——否则拖动一个节点时其它节点会跟着重排。 */
function computeLayout(
  list: CanvasNode[],
  rootId: string,
  centerRef: MutableRefObject<{ x: number; y: number } | null>,
  lastLayout: CanvasNode[]
): CanvasNode[] {
  const map = new Map(list.map((n) => [n.id, { ...n }]));
  const childrenOf = (id: string) =>
    list.filter((n) => n.parentId === id).map((n) => map.get(n.id)!);
  const prevById = new Map((lastLayout ?? []).map((n) => [n.id, n]));
  const fresh = !lastLayout || lastLayout.length === 0;

  // 把新节点相对父节点的绝对坐标排出来。已排过版 / positioned 的节点保留 state 里的
  // 绝对坐标，只作为锚点让新子节点相对它排列。
  const lay = (id: string, anchorX: number, anchorY: number): number => {
    const node = map.get(id)!;
    const kids = childrenOf(id).filter(
      (k) => !prevById.has(k.id) && !k.positioned
    );
    if (kids.length === 0) {
      node.x = anchorX;
      node.y = anchorY;
      return node.h;
    }
    let relY = 0;
    let maxBottom = 0;
    for (const kid of kids) {
      kid.x = anchorX + GAP_X;
      kid.y = anchorY + relY;
      const sub = lay(kid.id, kid.x, kid.y);
      relY += sub + GAP_Y;
      maxBottom = Math.max(maxBottom, kid.y + kid.h - anchorY);
    }
    // 父节点居中于子节点
    node.x = anchorX;
    node.y = anchorY - node.h / 2 + maxBottom / 2;
    return node.h + maxBottom;
  };

  if (fresh) {
    // 整棵树从头排：根在 (0,0)，算出包围盒后再居中。
    lay(rootId, 0, 0);
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of map.values()) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    centerRef.current = { x: cx, y: cy };
    for (const n of map.values()) {
      n.x -= cx;
      n.y -= cy;
    }
  } else {
    // 已排过版的节点冻结在上一次的绝对坐标上；positioned 节点保留 state 里的
    // 拖动后坐标。只把全新的节点相对父节点排一遍。
    for (const n of map.values()) {
      if (prevById.has(n.id) && !n.positioned) {
        const p = prevById.get(n.id)!;
        n.x = p.x;
        n.y = p.y;
      }
    }
    for (const n of map.values()) {
      if (!prevById.has(n.id) && !n.positioned) {
        const parent = n.parentId ? map.get(n.parentId) : null;
        // 新根节点（理论上不会出现）就放在原点。
        lay(n.id, parent ? parent.x + GAP_X : 0, parent ? parent.y : 0);
      }
    }
  }
  return [...map.values()];
}

const statusColor = (s: TaskStatus) =>
  s === "completed"
    ? "bg-success"
    : s === "failed"
      ? "bg-danger"
      : "bg-accent";

const statusLabel = (s: TaskStatus) =>
  s === "completed"
    ? "完成"
    : s === "failed"
      ? "失败"
      : s === "queued"
        ? "排队中"
        : s === "processing"
          ? "调用模型"
          : "生成中";

/**
 * 判断一次 pointerdown 是否落在交互控件上。
 *
 * 无限画布里「拖拽平移」是 everywhere 的常规操作，不能因为点在节点卡上就拒绝；
 * 但按钮 / 输入框 / 分支卡片必须自己处理点击，不能被平移劫持。
 */
function isInteractiveTarget(el: HTMLElement): boolean {
  return !!el.closest(
    "button, textarea, input, select, a, [data-branch-card], [data-tree-branch], [data-node-card]"
  );
}

export function TreeCanvas({
  task,
  image,
  onClose,
  onStarted,
}: {
  task: GenerateTask;
  image: GeneratedImage;
  onClose: () => void;
  onStarted: (taskId: string) => void;
}) {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDelta, setEditDelta] = useState("");
  const [editMode, setEditMode] = useState<BranchMode>("reprompt");
  const [busy, setBusy] = useState(false);
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  // 点击节点图片时打开的全屏预览。null 表示关闭。
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const transitioning = useRef(false);
  const positionedRef = useRef<CanvasNode[]>([]);
  // 树的居中偏移量：第一次布局时算好之后就锁死，避免拖动后重算把其它节点带着跳。
  const centerRef = useRef<{ x: number; y: number } | null>(null);
  // 上一次布局的绝对坐标。已排过版的节点冻结在这些坐标上，只把新节点
  // （分支新加的）相对父节点排一遍——否则拖动一个节点时其它节点会跟着重排。
  const lastLayoutRef = useRef<CanvasNode[]>([]);

  // 正在被拖拽的节点的实时偏移（屏幕像素）。dnd-kit 拖拽期间节点是靠 CSS
  // transform 移动的，state 里的 x/y 不变——所以边线如果不读这个偏移，
  // 拖动过程中边线一直停在原位，要等拖拽结束、handleDragEnd 写回 state
  // 之后才跳过去。这里用 onDragMove 跟踪，让边线和节点同步跟手。
  const [dragOffset, setDragOffset] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // dnd-kit 传感器：PointerSensor 同时支持鼠标 + 触摸，比手写 pointer 事件稳。
  const sensors = useSensors(useSensor(PointerSensor));

  // 布局：节点集合一变就重排。ref 始终持有最新布局，
  // 供 setTimeout/ RAF 里的 fitToScreen 读到，避免闭包拿到过时的节点集合。
  // 根节点是 parentId === null 的那个（不是数组第一个——第一个可能是子节点，
  // 否则父节点不会被布局，整棵树会塌成重叠的一堆）。
  const positioned = useMemo(() => {
    if (!nodes.length) {
      lastLayoutRef.current = [];
      return [];
    }
    const root = nodes.find((n) => !n.parentId) ?? nodes[0];
    const layout = computeLayout(nodes, root.id, centerRef, lastLayoutRef.current);
    lastLayoutRef.current = layout;
    return layout;
  }, [nodes]);
  positionedRef.current = positioned;

  /** 画布坐标 → 屏幕坐标。 */
  const toScreen = (x: number, y: number) => ({
    sx: pan.x + x * scale,
    sy: pan.y + y * scale,
  });

  /** 把某个节点的中心挪到视口中央。 */
  const centerOn = useCallback((node: CanvasNode) => {
    const vw = viewportRef.current?.offsetWidth ?? window.innerWidth;
    const vh = viewportRef.current?.offsetHeight ?? window.innerHeight;
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    transitioning.current = true;
    setPan({ x: vw / 2 - cx * scale, y: vh / 2 - cy * scale });
    setTimeout(() => (transitioning.current = false), 260);
  }, [scale]);

  /** 缩放：以光标为锚。 */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = viewportRef.current!.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      setScale((s) => {
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
        setPan((p) => {
          const lx = (sx - p.x) / s;
          const ly = (sy - p.y) / s;
          return { x: sx - lx * ns, y: sy - ly * ns };
        });
        return ns;
      });
    },
    []
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // 只有点在交互控件上（按钮 / 输入框 / 分支卡片）才不启动平移，
    // 点在节点卡或空白背景上都允许拖动平移——无限画布的常规体验。
    if (isInteractiveTarget(e.target as HTMLElement)) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
    transitioning.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setPan({
      x: d.startPanX + (e.clientX - d.startX),
      y: d.startPanY + (e.clientY - d.startY),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  // dnd-kit 拖拽中：持续更新被拖节点的屏幕偏移，让边线和节点同步跟手。
  // 只存偏移量、不改 state 里的 x/y——真正的坐标 still 在拖拽结束时由
  // handleDragEnd 写回，这里只是「视觉上」让边线跟着跑。
  const handleDragMove = (event: DragMoveEvent) => {
    const { active, delta } = event;
    if (!active) {
      setDragOffset(null);
      return;
    }
    setDragOffset({ id: active.id as string, x: delta.x, y: delta.y });
  };

  // dnd-kit 拖拽结束：把屏幕位移换算成画布坐标，写进节点的 x/y。
  // delta 是自拖拽起点的总位移（屏幕像素），除以 scale 得到画布坐标。
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    if (!active) return;
    setDragOffset(null);
    const nodeId = active.id as string;
    const canvasDx = delta.x / scale;
    const canvasDy = delta.y / scale;
    // 以节点当前的「绝对画布坐标」为基准累加拖动位移。不能直接用 state 里的
    // n.x——它可能是初始的 0，而节点实际已经在布局时被平移过；用 positioned
    // 里的实时绝对坐标，才能让位移量正好等于屏幕上的手指移动距离。
    const current = positioned.find((n) => n.id === nodeId);
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              x: (current?.x ?? n.x) + canvasDx,
              y: (current?.y ?? n.y) + canvasDy,
              positioned: true,
            }
          : n
      )
    );
  };

  // 键盘：Esc 关闭预览（若打开）或关闭画布
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewUrl) setPreviewUrl(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, previewUrl]);

  // 窗口尺寸变化 → 重新居中
  useEffect(() => {
    const onResize = () => {
      setPan({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 首次加载：还原已有分支树
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/history");
        const data = (await r.json()) as { items: HistoryItem[] };
        // rootImageId 沿祖父的根一路传下来，根任务自身为 undefined；
        // 这里取「真正的根任务 id」来过滤候选，否则从分支图打开时会漏掉父节点。
        const rootTaskId = task.rootImageId ?? task.id;
        const tree = buildTreeFromHistory(data.items, rootTaskId, image.id);
        if (cancelled) return;
        // 保证根节点一定存在（哪怕历史里还没持久化）
        if (!tree.some((n) => n.id === image.id)) {
          const s = nodeSize(image);
          tree.unshift({
            id: image.id,
            taskId: task.id,
            imageId: image.id,
            url: image.url,
            width: image.width,
            height: image.height,
            seed: image.seed,
            prompt: task.request.prompt,
            modelName: task.model?.displayName ?? "Unknown",
            serviceName: task.service?.name ?? "Unknown",
            status: "completed",
            parentId: null,
            x: 0,
            y: 0,
            w: s.w,
            h: s.h,
          });
        }
        setNodes(tree);
        // 延迟一帧，等 viewport 有尺寸后再居中。保持 scale=1 的小视图，
        // 不要一进来就 fitToScreen 放大——用户偏好原本的小尺寸。
        requestAnimationFrame(() => {
          setPan({
            x: (viewportRef.current?.offsetWidth ?? window.innerWidth) / 2,
            y: (viewportRef.current?.offsetHeight ?? window.innerHeight) / 2,
          });
        });
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, image.id]);

  // 轮询未完成的分支节点
  useEffect(() => {
    const pending = nodes.filter(
      (n) => n.status === "queued" || n.status === "processing" || n.status === "generating"
    );
    if (pending.length === 0) return;
    const tick = async () => {
      let anyCompleted = false;
      for (const n of pending) {
        try {
          const r = await fetch(`/api/tasks/${n.taskId}`);
          const data = (await r.json()) as { task: GenerateTask };
          const t = data.task;
          setNodes((prev) =>
            prev.map((m) => {
              if (m.taskId !== n.taskId) return m;
              const img = t.images[0];
              const next: CanvasNode = {
                ...m,
                status: t.status,
                prompt: t.request.prompt,
                modelName: t.model?.displayName ?? m.modelName,
                serviceName: t.service?.name ?? m.serviceName,
              };
              if (img) {
                const s = nodeSize(img);
                next.id = img.id;
                next.imageId = img.id;
                next.url = img.url;
                next.width = img.width;
                next.height = img.height;
                next.seed = img.seed;
                next.w = s.w;
                next.h = s.h;
                next.pending = false;
              }
              if (t.status === "completed") anyCompleted = true;
              return next;
            })
          );
        } catch {
          /* 单个节点轮询失败不影响其它 */
        }
      }
      // 分支节点完成时，真实图片尺寸可能与占位尺寸不同，重新排版并铺满视口。
      if (anyCompleted) setTimeout(fitToScreen, 60);
    };
    const id = setInterval(tick, 2000);
    tick();
    return () => clearInterval(id);
  }, [nodes]);

  /** 提交一次「二次创作」。 */
  const submitBranch = async (parent: CanvasNode) => {
    if (busy) return;
    if (editMode !== "variant" && !editDelta.trim()) {
      setError("请写下修改指令，否则生成结果与原图相同");
      return;
    }
    setBusy(true);
    setBusyNodeId(parent.id);
    setError(null);
    try {
      const r = await fetch(`/api/tasks/${parent.taskId}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentTaskId: parent.taskId,
          parentImageId: parent.imageId,
          editMode: editMode,
          promptDelta: editDelta.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const err = (await r.json()) as { error?: string };
        throw new Error(err.error || `请求失败 (${r.status})`);
      }
      const data = (await r.json()) as { task: GenerateTask };
      const newTask = data.task;
      // 新节点：临时 id，待轮询到完成再换成真实 image id
      const newNode: CanvasNode = {
        id: `pending_${newTask.id}`,
        taskId: newTask.id,
        imageId: "",
        url: "",
        width: image.width,
        height: image.height,
        seed: -1,
        prompt: newTask.request.prompt,
        modelName: newTask.model?.displayName ?? "Unknown",
        serviceName: newTask.service?.name ?? "Unknown",
        status: newTask.status,
        parentId: parent.imageId,
        x: 0,
        y: 0,
        w: MAX_NODE_W,
        h: 240,
        pending: true,
      };
      setNodes((prev) => [...prev, newNode]);
      setEditingId(null);
      setEditDelta("");
      setToast("已创建分支，正在生成…");
      // 不主动 fitToScreen——保持原有 scale，新节点以当前缩放出现，
      // 避免生成时整树突然放大/缩小的跳跃感。用户可随时点顶栏「铺满屏幕」。
      onStarted(newTask.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分支失败");
    } finally {
      setBusy(false);
      setBusyNodeId(null);
      setTimeout(() => setToast(null), 2000);
    }
  };

  /** 重置视图：整棵树铺满屏幕。 */
  const fitToScreen = () => {
    const positioned = positionedRef.current;
    if (!positioned.length) return;
    const vw = viewportRef.current?.offsetWidth ?? window.innerWidth;
    const vh = viewportRef.current?.offsetHeight ?? window.innerHeight;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of positioned) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const s = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, Math.min(vw / (bw + 80), vh / (bh + 80)))
    );
    transitioning.current = true;
    setScale(s);
    // 把树的包围盒中心对齐视口中心，而不是把原点 (0,0) 对中——
    // 非对称布局下后者会让整树偏到一边、边缘节点被裁掉。
    setPan({
      x: vw / 2 - ((minX + maxX) / 2) * s,
      y: vh / 2 - ((minY + maxY) / 2) * s,
    });
    setTimeout(() => (transitioning.current = false), 260);
  };

  return (
    <div
      ref={viewportRef}
      className="fixed inset-0 z-50 flex flex-col bg-paper-3/95 backdrop-blur-sm"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 顶栏：标题 + 工具 + 关闭 */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-paper-2/80 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <GitCommit className="h-4 w-4 text-accent" />
          <span className="font-medium text-ink-2">版本树画布</span>
          <span className="text-ink-3">
            · {positioned.length} 个节点
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.15)}
            title="缩小"
            className="rounded p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.15)}
            title="放大"
            className="rounded p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={fitToScreen}
            title="铺满屏幕"
            className="rounded p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
          <button
            onClick={onClose}
            title="关闭 (Esc)"
            aria-label="关闭"
            className="rounded p-1.5 text-ink-3 hover:bg-danger/10 hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 画布区：transform 做平移+缩放，SVG 跟随变换绘制边线，
          节点用 absolute 定位在画布坐标里。 */}
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-visible",
          transitioning.current && "transition-transform duration-250 ease-out"
        )}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: 1, overflow: "visible" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* 树边箭头：指向子节点，orient=auto 让箭头始终贴合边线终点的切线方向。
                  SVG 放在 transform 包裹块内部，和节点卡片共用同一套画布坐标与
                  缩放变换——边线永远和卡片同坐标系，不会因为两者原点不同而脱节。
                  markerUnits 用 userSpaceOnUse，markerWidth 随 scale 反向折算，
                  保证缩放时箭头在屏幕上大小不变。 */}
              <marker
                id="tree-edge-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth={7 / scale}
                markerHeight={7 / scale}
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 L 4.5 5 z" fill="var(--color-ink-3)" />
              </marker>
            </defs>
            {positioned.map((n) => {
              if (!n.parentId) return null;
              const parent = positioned.find((p) => p.id === n.parentId);
              if (!parent) return null;
              // 拖拽中的节点要加上实时偏移，否则边线会停在原地、
              // 等拖拽结束写回 state 后才跳过去——视觉上就是「拖动时没连线」。
              const eff = (node: CanvasNode) =>
                dragOffset?.id === node.id
                  ? {
                      x: node.x + dragOffset.x / scale,
                      y: node.y + dragOffset.y / scale,
                    }
                  : { x: node.x, y: node.y };
              const pe = eff(parent);
              const ce = eff(n);
              // 坐标用画布坐标：SVG 在 transform 包裹块内，会和节点一起被
              // 平移+缩放，所以直接用画布坐标就能和卡片对齐，不用再折算屏幕坐标。
              const ps = { x: pe.x + parent.w, y: pe.y + parent.h / 2 };
              const cs = { x: ce.x, y: ce.y + n.h / 2 };
              const mx = (ps.x + cs.x) / 2;
              return (
                <path
                  key={n.id}
                  d={`M ${ps.x} ${ps.y} C ${mx} ${ps.y}, ${mx} ${cs.y}, ${cs.x} ${cs.y}`}
                  fill="none"
                  stroke="var(--color-ink-3)"
                  strokeWidth={2.5}
                  opacity={0.9}
                  markerEnd="url(#tree-edge-arrow)"
                />
              );
            })}
          </svg>
          <DndContext sensors={sensors} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
            {positioned.map((n) => (
              <CanvasNodeCard
                key={n.id}
                node={n}
                scale={scale}
                onPreview={setPreviewUrl}
                onBranch={() => {
                  if (n.status !== "completed") return;
                  setEditingId(n.id);
                  setEditDelta("");
                  setEditMode("reprompt");
                }}
                onCenter={() => centerOn(n)}
              />
            ))}
          </DndContext>
        </div>

        {/* 内联分支输入卡：屏幕空间定位，不随缩放变形，也不被 transform 包含块影响 */}
        {editingId && (() => {
          const node = positioned.find((n) => n.id === editingId);
          if (!node) return null;
          const CARD_W = 360;
          const vw = viewportRef.current?.offsetWidth ?? window.innerWidth;
          const vh = viewportRef.current?.offsetHeight ?? window.innerHeight;
          // 面板默认锚在节点右侧；右侧放不下就翻到左侧，再放不下就贴屏幕边——
          // 保证面板永远可见。原来的写法只处理了「超出右边界」一种情况，
          // 节点被拖到屏幕最左时面板会定位到负数坐标、肉眼不可见。
          const right = toScreen(node.x + node.w + 16, node.y);
          const leftAnchor = toScreen(node.x - 16, node.y);
          let left = right.sx;
          if (left + CARD_W > vw) left = leftAnchor.sx - CARD_W;
          if (left < 0) left = 0;
          if (left + CARD_W > vw) left = vw - CARD_W;
          let top = right.sy;
          if (top < 0) top = 0;
          if (top + 320 > vh) top = Math.max(0, vh - 320);
          return (
            <BranchCard
              node={node}
              delta={editDelta}
              mode={editMode}
              busy={busy && busyNodeId === node.id}
              error={error}
              onDelta={setEditDelta}
              onMode={setEditMode}
              onCancel={() => setEditingId(null)}
              onSubmit={() => submitBranch(node)}
              left={left}
              top={top}
            />
          );
        })()}
      </div>

      {/* 底栏提示 */}
      <div className="flex shrink-0 items-center justify-between border-t border-line bg-paper-2/80 px-4 py-1.5 text-xs text-ink-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Move className="h-3 w-3" />
            拖拽平移
          </span>
          <span className="flex items-center gap-1">
            <Grip className="h-3 w-3" />
            按住节点拖动
          </span>
          <span className="flex items-center gap-1">
            <ZoomIn className="h-3 w-3" />
            滚轮缩放
          </span>
          <span className="flex items-center gap-1">
            <Plus className="h-3 w-3" />
            点「+」二次创作
          </span>
        </div>
        <span>Esc 关闭</span>
      </div>

      {toast && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-md bg-ink-2 px-3 py-1.5 text-sm text-paper-3 shadow-xl">
          {toast}
        </div>
      )}

      {/* 图片预览：点节点图片时全屏放大，背景遮罩 + Esc / 点遮罩关闭。
          这里用屏幕坐标而非画布坐标，保证预览不受平移/缩放影响。 */}
      {previewUrl && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-ink-2/85 p-6 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            title="关闭 (Esc)"
            aria-label="关闭预览"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-paper-2/90 text-ink shadow-xl transition-colors hover:bg-paper-3"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="预览"
            className="max-h-full max-w-full object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function CanvasNodeCard({
  node,
  onBranch,
  onCenter,
  onPreview,
  scale,
}: {
  node: CanvasNode;
  scale: number;
  onBranch: () => void;
  onCenter: () => void;
  onPreview: (url: string) => void;
}) {
  // 图片链接失效时（OSS 过期 / 403）降级到占位，避免卡片裂成白板。
  const [broken, setBroken] = useState(false);

  // dnd-kit 6.x：useDraggable 返回的 attributes 只有 ARIA 元数据，
  // 真正的 pointer 事件处理器在 listeners 里——必须把它们也 spread 到节点上，
  // 否则节点收不到 pointerdown，拖拽永远不会启动。
  // transform 是屏幕像素，父容器有 CSS scale，除以 scale 后在父空间里
  // 移动的距离才等于屏幕上的手指位移。
  const { setNodeRef, attributes, listeners, transform } = useDraggable({
    id: node.id,
  });
  const tx = transform?.x ?? 0;
  const ty = transform?.y ?? 0;
  const dx = tx / scale;
  const dy = ty / scale;
  const isDragging = tx !== 0 || ty !== 0;
  return (
    <div
      ref={setNodeRef}
      data-node-card
      {...attributes}
      {...listeners}
      className={cn(
        "absolute overflow-hidden rounded-lg border border-line bg-paper-2 shadow-xl transition-shadow",
        isDragging
          ? "cursor-grabbing shadow-2xl"
          : "cursor-grab hover:shadow-2xl"
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        transform: `translate(${dx}px, ${dy}px)`,
      }}
      onClick={() => onCenter()}
    >
      {node.url && !broken ? (
        <div
          className="relative h-full w-full cursor-zoom-in"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(node.url!);
          }}
        >
          <img
            src={node.url}
            alt={node.prompt}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setBroken(true)}
          />
          <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-md bg-black/40 p-1 text-white/80">
            <Maximize2 className="h-3 w-3" />
          </div>
        </div>
      ) : broken ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-ink-3 to-ink-2 p-2 text-center">
          <Image className="h-5 w-5 text-paper-3/50" />
          <span className="text-[10px] text-paper-3/70">图片链接已失效</span>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-ink-3 to-ink-2 p-2 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <span className="text-[10px] text-paper-3/70">
            {statusLabel(node.status)}
          </span>
        </div>
      )}

      {/* 底部信息条 */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10px] text-white/90">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                statusColor(node.status)
              )}
            />
            <span className="truncate">{node.prompt}</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-white/55">
            <span>{node.serviceName}</span>
            <span>·</span>
            <span>seed {node.seed}</span>
          </div>
        </div>
        {node.status === "completed" && (
          <button
            data-tree-branch
            onPointerDown={(e) => {
              // 卡片整体挂了 dnd-kit 的拖拽 listeners，pointerdown 会冒泡到卡片
              // 触发拖拽。这里先拦下 pointerdown，避免「想点 + 结果变成拖动」——
              // 否则手指 slightest 一动，dnd-kit 就会接管 pointerup，按钮的 onClick
              // 根本不会触发，二次创作面板也就出不来。
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onBranch();
            }}
            title="二次创作这张图"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform hover:scale-105"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function BranchCard({
  node,
  delta,
  mode,
  busy,
  error,
  onDelta,
  onMode,
  onCancel,
  onSubmit,
  left,
  top,
}: {
  node: CanvasNode;
  delta: string;
  mode: BranchMode;
  busy: boolean;
  error: string | null;
  onDelta: (v: string) => void;
  onMode: (v: BranchMode) => void;
  onCancel: () => void;
  onSubmit: () => void;
  left: number;
  top: number;
}) {
  const modes: {
    v: BranchMode;
    label: string;
    icon: typeof Edit;
    hint: string;
  }[] = [
    {
      v: "reprompt",
      label: "改 prompt",
      icon: Edit,
      hint: "保留原 prompt，追加你的修改指令，纯文本驱动",
    },
    {
      v: "variant",
      label: "变体",
      icon: RefreshCw,
      hint: "prompt 不变，seed 重新随机，产出另一个版本",
    },
    {
      v: "edit",
      label: "图生图",
      icon: Image,
      hint: "把原图当参考图传给模型，真正以图生图",
    },
  ];
  // 快捷键提示要按平台显示：Mac 显示 ⌘，Windows/Linux 显示 Ctrl。
  // 后端实际监听的是 e.metaKey || e.ctrlKey，两种平台都能用，
  // 但提示写死 ⌘ 会让 Windows 用户以为这个快捷键自己按不出来。
  const submitKey =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform)
      ? "⌘"
      : "Ctrl";
  return (
    <div
      data-branch-card
      className="fixed z-[60] w-[360px] rounded-xl border border-line bg-paper-2 p-4 shadow-2xl"
      style={{ left, top }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <img
          src={node.url}
          alt=""
          className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-line"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-2">
            二次创作这张图
          </p>
          <p className="truncate text-[10px] text-ink-3">
            {node.serviceName} · seed {node.seed}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="ml-auto rounded-md p-1 text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex rounded-md border border-line bg-paper-3/40 p-0.5 text-xs">
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.v}
              onClick={() => onMode(m.v)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 transition-colors",
                mode === m.v
                  ? "bg-accent text-white shadow-sm"
                  : "text-ink-3 hover:text-ink"
              )}
            >
              <span className="flex items-center justify-center gap-1">
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-ink-3">
        {modes.find((m) => m.v === mode)?.hint}
      </p>

      {mode === "variant" ? (
        <div className="flex items-center gap-1.5 rounded-md border border-line bg-paper-3/40 px-2.5 py-2 text-[11px] text-ink-3">
          <RefreshCw className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span>无需输入指令，点「开始修改」即可生成一个新版本。</span>
        </div>
      ) : (
        <textarea
          value={delta}
          onChange={(e) => onDelta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !busy) onSubmit();
          }}
          rows={4}
          placeholder={
            mode === "edit"
              ? "例如：给猫加个帽子，背景换成夜晚…"
              : "例如：让它在草坪上玩耍…"
          }
          className="w-full resize-none rounded-md border border-line bg-paper-3/40 p-2.5 text-sm text-ink-2 outline-none transition-colors focus:border-accent"
        />
      )}

      {error && (
        <div className="mt-2 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-3">
          <kbd className="rounded border border-line bg-paper-3 px-1 py-0.5 font-mono">
            {submitKey}
          </kbd>
          {" "}
          + Enter 提交
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs text-ink-3 transition-colors hover:bg-paper-3"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            开始修改
          </button>
        </div>
      </div>
    </div>
  );
}