"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  Maximize2,
  Move,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
  GitCommit,
  Loader2,
} from "lucide-react";
import {
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useStoreApi,
  type Edge,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { BranchMode, GenerateTask } from "@/lib/types";
import { BranchPanel } from "./branch-panel";
import {
  buildTreeFromHistory,
  createRootItem,
  imageNodeSize,
  layoutVersionTree,
  nextChildPosition,
  MAX_NODE_HEIGHT,
  MAX_NODE_WIDTH,
} from "./tree-layout";
import type {
  BranchDraft,
  VersionTreeFlowNode,
  VersionTreeItem,
  VersionTreeActions,
  VersionTreeProps,
} from "./types";
import { VersionTreeNode } from "./version-tree-node";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const BRANCH_PANEL_WIDTH = 360;
const nodeTypes = { version: VersionTreeNode };

function requestHistory() {
  return fetch("/api/history", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error(`历史记录加载失败 (${response.status})`);
    return (await response.json()) as { items?: Parameters<typeof buildTreeFromHistory>[0] };
  });
}

export function VersionTree(props: VersionTreeProps) {
  return (
    <ReactFlowProvider>
      <VersionTreeInner {...props} />
    </ReactFlowProvider>
  );
}

function VersionTreeInner({ task, image, onClose, onStarted }: VersionTreeProps) {
  const rootItem = useMemo(() => createRootItem(task, image), [task, image]);
  const [items, setItems] = useState<VersionTreeItem[]>([rootItem]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BranchDraft>({ mode: "reprompt", promptDelta: "" });
  const [busy, setBusy] = useState(false);
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  // viewport 最新值始终写进 ref；React state 只在分支面板打开时同步。
  // 否则平移/缩放画布时 onViewportChange 每帧 setState，整个 VersionTreeInner
  // 跟着重渲染，是「拖拽平移」卡顿的主因之一。
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const editingIdRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const edgeTopologyRef = useRef<Array<Pick<VersionTreeItem, "id" | "parentId">>>([]);
  // 拖拽期间的实时位置。拖拽时不写 items（避免 setItems 触发 VersionTreeInner
  // 整树重渲染 + StoreUpdater 二次 setNodes），而是直接 setNodes 到 ReactFlow store；
  // 这里只记一份 live 位置，供 items 因轮询等其他原因变化时合并，防止节点弹回旧位置。
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const actionsRef = useRef<VersionTreeActions>({
    openBranch: () => {},
    openPreview: () => {},
  });
  const { zoomIn, zoomOut, setViewport } = useReactFlow<VersionTreeFlowNode>();
  const store = useStoreApi();
  itemsRef.current = items;
  edgeTopologyRef.current = items.map(({ id, parentId }) => ({ id, parentId }));
  editingIdRef.current = editingId;

  const onViewportChange = useCallback((next: Viewport) => {
    viewportRef.current = next;
    // 只有分支面板打开时才需要 viewport 进 React state（面板锚点按帧跟随）。
    if (editingIdRef.current) setViewportState(next);
  }, []);

  // flowNodes — 节点对象的「引用稳定性」是拖拽流畅度的关键。
  //
  // @xyflow/react 的 StoreUpdater 用引用相等判断节点是否变更
  // (adoptUserNodes: userNode === internalNode.internals.userNode)。
  // 每次 items 变化都全新生成节点数组 → 每个节点都被判定为「已变更」
  // → adoptUserNodes 重建全部 internal node → 全部节点组件重渲染。
  // 拖拽一帧触发一次 setItems，等于每帧全量重建所有节点，节点越多越卡。
  //
  // 解决：未变更的节点复用同一个对象引用，让 adoptUserNodes 跳过它们，
  // 只有被拖拽（或内容真的变了）的那个节点才重建+重渲染。
  const flowNodesRef = useRef<VersionTreeFlowNode[]>([]);
  const flowNodes = useMemo<VersionTreeFlowNode[]>(() => {
    const prev = flowNodesRef.current;
    const prevById = new Map(prev.map((n) => [n.id, n]));
    const next: VersionTreeFlowNode[] = [];
    for (const item of items) {
      const existing = prevById.get(item.id);
      if (
        existing &&
        existing.data.item === item &&
        existing.width === item.nodeWidth &&
        existing.height === item.nodeHeight
      ) {
        // 内容未变（例如是别的节点在移动）— 复用原引用，xyflow 跳过重建。
        next.push(existing);
      } else {
        next.push({
          id: item.id,
          type: "version",
          position: positionsRef.current.get(item.id) ?? item.position,
          width: item.nodeWidth,
          height: item.nodeHeight,
          measured: { width: item.nodeWidth, height: item.nodeHeight },
          data: { item, actions: actionsRef },
          draggable: true,
          selectable: true,
        });
      }
    }
    flowNodesRef.current = next;
    return next;
  }, [items]);

  const openBranch = useCallback((id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item || item.status !== "completed") return;
    // 面板锚点依赖 viewport state —— 打开瞬间同步一次 ref 里的最新值，
    // 之后由 onViewportChange 持续跟进。
    setViewportState(viewportRef.current);
    setEditingId(id);
    setDraft({ mode: "reprompt", promptDelta: "" });
    setError(null);
  }, [items]);

  actionsRef.current = {
    openBranch,
    openPreview: setPreviewUrl,
  };

  useEffect(() => {
    let cancelled = false;
    setItems([rootItem]);
    setEditingId(null);
    setLoadingHistory(true);

    requestHistory()
      .then(({ items: history }) => {
        if (cancelled) return;
        const rootTaskId = task.rootImageId ?? task.id;
        const tree = buildTreeFromHistory(history ?? [], rootTaskId, image.id);
        const withoutCurrentRoot = tree.filter((item) => item.id !== image.id);
        const laidOut = layoutVersionTree([rootItem, ...withoutCurrentRoot]);
        setItems(laidOut);
      })
      .catch(() => {
        // The current result remains usable when history is temporarily unavailable.
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [image.id, rootItem, task.id, task.rootImageId]);

  const treeStructureKey = useMemo(
    () =>
      items
        .map(
          (item) =>
            `${item.id}:${item.parentId ?? "root"}:${item.nodeWidth}:${item.nodeHeight}`
        )
        .join("|"),
    [items]
  );
  const treeTopologyKey = useMemo(
    () => items.map((item) => `${item.id}:${item.parentId ?? "root"}`).join("|"),
    [items]
  );

  const fitContent = useCallback(() => {
    const canvas = canvasRef.current;
    const currentItems = itemsRef.current;
    if (!canvas || currentItems.length === 0) return;
    const padding = 32;
    const minX = Math.min(...currentItems.map((item) => item.position.x));
    const minY = Math.min(...currentItems.map((item) => item.position.y));
    const maxX = Math.max(
      ...currentItems.map((item) => item.position.x + item.nodeWidth)
    );
    const maxY = Math.max(
      ...currentItems.map((item) => item.position.y + item.nodeHeight)
    );
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const zoom = Math.min(
      1.2,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (canvas.clientWidth - padding * 2) / contentWidth,
          (canvas.clientHeight - padding * 2) / contentHeight
        )
      )
    );
    setViewport({
      x: canvas.clientWidth / 2 - ((minX + maxX) / 2) * zoom,
      y: canvas.clientHeight / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    });
  }, [setViewport]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitContent);
    return () => cancelAnimationFrame(frame);
  }, [fitContent, treeStructureKey]);

  useEffect(() => {
    let frame = 0;
    const refit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fitContent);
    };
    window.addEventListener("resize", refit);
    return () => {
      window.removeEventListener("resize", refit);
      window.cancelAnimationFrame(frame);
    };
  }, [fitContent]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (previewUrl) setPreviewUrl(null);
      else if (editingId) setEditingId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId, onClose, previewUrl]);

  // pendingSignature — 只有「排队/处理中/生成中」的任务才会让轮询 effect 活着。
  // 用结构签名而非整个 items 数组做依赖：拖拽只改 position，不改 status，
  // 所以拖拽期间不会反复 clear + recreate 这个 2s 定时器。
  const pendingSignature = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.status === "queued" ||
            item.status === "processing" ||
            item.status === "generating"
        )
        .map((item) => item.taskId)
        .sort()
        .join("|"),
    [items]
  );

  useEffect(() => {
    const taskIds = pendingSignature ? pendingSignature.split("|").filter(Boolean) : [];
    if (taskIds.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      // 拖拽进行中（positionsRef 持有 live 位置）跳过本轮轮询 ——
      // 此时 setItems 会重建 flowNodes，把正在被拖的节点对象替换掉，
      // adoptUserNodes 重建 internal node，拖拽中的组件会被重置/抖动。
      if (positionsRef.current.size > 0) return;
      for (const taskId of taskIds) {
        try {
          const response = await fetch(`/api/tasks/${taskId}`);
          if (!response.ok) continue;
          const data = (await response.json()) as { task?: GenerateTask };
          const current = data.task;
          if (!current || cancelled) continue;

          setItems((previous) => previous.map((item) => {
            if (item.taskId !== taskId) return item;
            const generated = current.images[0];
            if (!generated) {
              return {
                ...item,
                status: current.status,
                prompt: current.request.prompt,
              };
            }
            const size = imageNodeSize(generated);
            return {
              ...item,
              id: generated.id,
              imageId: generated.id,
              imageUrl: generated.url,
              imageWidth: generated.width,
              imageHeight: generated.height,
              ...size,
              seed: generated.seed,
              prompt: current.request.prompt,
              modelName: current.model?.displayName ?? item.modelName,
              serviceName: current.service?.name ?? item.serviceName,
              status: current.status,
              pending: false,
            };
          }));

          if (current.status === "completed") {
            setToast("分支生成完成");
            window.setTimeout(() => setToast(null), 2200);
          }
          if (current.status === "failed") {
            setToast(current.errorMessage || "分支生成失败");
            window.setTimeout(() => setToast(null), 3000);
          }
        } catch {
          // A failed poll is retried on the next tick.
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingSignature]);

  const flowEdges = useMemo<Edge[]>(
    () => {
      const topology = edgeTopologyRef.current;
      const ids = new Set(topology.map((item) => item.id));
      return topology
        .filter((item): item is { id: string; parentId: string } =>
          Boolean(item.parentId && ids.has(item.parentId))
        )
        .map((item) => ({
          id: `edge-${item.id}`,
          source: item.parentId,
          target: item.id,
          type: "default",
          selectable: false,
          focusable: false,
          style: {
            stroke: "var(--color-ink-3)",
            strokeWidth: 2,
            opacity: 0.85,
            strokeDasharray: "5 4",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--color-ink-3)",
            width: 16,
            height: 16,
          },
        }));
    },
    [treeTopologyKey]
  );

  const onNodesChange = useCallback((changes: NodeChange<VersionTreeFlowNode>[]) => {
    let dragEnded = false;
    let hasRemove = false;
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        positionsRef.current.set(change.id, change.position);
        if (change.dragging !== true) dragEnded = true;
      } else if (change.type === "remove") {
        hasRemove = true;
      }
    }
    // 短路径：直接调 store 的 setNodes（经 adoptUserNodes 更新 nodeLookup），
    // 与 StoreUpdater 同一条路。注意必须用 store.setNodes，不能用
    // useReactFlow().setNodes —— 后者推入 batch queue，而 hasDefaultNodes=false
    // 时 queue handler 不更新 nodeLookup，只会无限生成 replace 变更、节点不动。
    const { nodes: currentNodes, setNodes: storeSetNodes } = store.getState();
    storeSetNodes(applyNodeChanges(changes, currentNodes));

    if (dragEnded || hasRemove) {
      setItems((previous) => {
        let next = previous;
        if (hasRemove) {
          const removed = new Set(
            changes.filter((c) => c.type === "remove").map((c) => c.id)
          );
          next = next.filter((item) => !removed.has(item.id));
        }
        if (dragEnded) {
          const committed = new Map<string, { x: number; y: number }>();
          for (const [id, pos] of positionsRef.current) committed.set(id, pos);
          positionsRef.current.clear();
          next = next.map((item) => {
            const p = committed.get(item.id);
            return p ? { ...item, position: p, manualPosition: true } : item;
          });
        }
        return next;
      });
    }
  }, [store]);

  const submitBranch = async () => {
    if (!editingId || busy) return;
    const parent = items.find((item) => item.id === editingId);
    if (!parent) return;
    if (draft.mode !== "variant" && !draft.promptDelta.trim()) {
      setError("请写下修改指令，否则生成结果与原图相同");
      return;
    }

    setBusy(true);
    setBusyNodeId(parent.id);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${parent.taskId}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentTaskId: parent.taskId,
          parentImageId: parent.imageId,
          editMode: draft.mode,
          promptDelta: draft.promptDelta.trim() || undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        task?: GenerateTask;
        error?: string;
      } | null;
      if (!response.ok || !data?.task) throw new Error(data?.error || `请求失败 (${response.status})`);

      const childTask = data.task;
      const siblings = items.filter((item) => item.parentId === parent.imageId);
      const pendingHeight = Math.min(MAX_NODE_HEIGHT, Math.max(220, parent.nodeHeight));
      const pendingPosition = nextChildPosition(parent, siblings, pendingHeight);
      const pending: VersionTreeItem = {
        id: `pending-${childTask.id}`,
        taskId: childTask.id,
        imageId: "",
        imageUrl: "",
        imageWidth: parent.imageWidth,
        imageHeight: parent.imageHeight,
        nodeWidth: MAX_NODE_WIDTH,
        nodeHeight: pendingHeight,
        seed: -1,
        prompt: childTask.request.prompt,
        modelName: childTask.model?.displayName ?? parent.modelName,
        serviceName: childTask.service?.name ?? parent.serviceName,
        status: childTask.status,
        parentId: parent.imageId,
        position: pendingPosition,
        pending: true,
      };
      setItems((previous) => [...previous, pending]);
      setEditingId(null);
      setDraft({ mode: "reprompt", promptDelta: "" });
      setToast("已创建分支，正在生成…");
      window.setTimeout(() => setToast(null), 2200);
      onStarted(childTask.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分支失败");
    } finally {
      setBusy(false);
      setBusyNodeId(null);
    }
  };

  const branchPanelPosition = useMemo(() => {
    const item = items.find((candidate) => candidate.id === editingId);
    const canvas = canvasRef.current;
    if (!item || !canvas) return null;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const right = viewport.x + (item.position.x + item.nodeWidth + 16) * viewport.zoom;
    const leftOfNode = viewport.x + (item.position.x - 16) * viewport.zoom;
    let left = right;
    if (left + BRANCH_PANEL_WIDTH > width) left = leftOfNode - BRANCH_PANEL_WIDTH;
    left = Math.max(12, Math.min(left, width - BRANCH_PANEL_WIDTH - 12));
    let top = viewport.y + item.position.y * viewport.zoom;
    top = Math.max(12, Math.min(top, height - 332));
    return { item, left, top };
  }, [editingId, items, viewport]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper-3">
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-paper-2/90 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <GitCommit className="h-4 w-4 text-accent" />
          <span className="font-medium text-ink-2">版本树画布</span>
          <span className="flex items-center gap-1 text-ink-3">
            {loadingHistory ? (
              <><Loader2 className="h-3 w-3 animate-spin" />加载中…</>
            ) : `· ${items.length} 个节点`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void zoomOut()} title="缩小" className="rounded p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void zoomIn()} title="放大" className="rounded p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={fitContent} title="铺满屏幕" className="rounded p-1.5 text-ink-3 hover:bg-paper-3 hover:text-ink">
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-line" />
          <button type="button" onClick={onClose} title="关闭 (Esc)" aria-label="关闭" className="rounded p-1.5 text-ink-3 hover:bg-danger/10 hover:text-danger">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onViewportChange={onViewportChange}
          onPaneClick={() => setEditingId(null)}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          className="bg-paper-3"
          proOptions={{ hideAttribution: true }}
        />
        {branchPanelPosition && (
          <BranchPanel
            item={branchPanelPosition.item}
            draft={draft}
            busy={busy && busyNodeId === branchPanelPosition.item.id}
            error={error}
            left={branchPanelPosition.left}
            top={branchPanelPosition.top}
            onDraftChange={setDraft}
            onCancel={() => {
              setEditingId(null);
              setError(null);
            }}
            onSubmit={submitBranch}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-line bg-paper-2/90 px-4 py-1.5 text-xs text-ink-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Move className="h-3 w-3" />拖拽平移</span>
          <span className="flex items-center gap-1"><Plus className="h-3 w-3" />点「+」二次创作</span>
        </div>
        <span>Esc 关闭</span>
      </div>

      {toast && (
        <div className="absolute bottom-14 left-1/2 z-30 -translate-x-1/2 rounded-md bg-ink-2 px-3 py-1.5 text-sm text-paper-3 shadow-xl">
          {toast}
        </div>
      )}

      {previewUrl && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-2/85 p-6 backdrop-blur-sm" onClick={() => setPreviewUrl(null)}>
          <button type="button" onClick={() => setPreviewUrl(null)} title="关闭预览" aria-label="关闭预览" className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-paper-2/90 text-ink shadow-xl hover:bg-paper-3">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="预览" className="max-h-full max-w-full object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
