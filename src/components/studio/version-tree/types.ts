import type { MutableRefObject } from "react";
import type { Node, XYPosition } from "@xyflow/react";
import type {
  BranchMode,
  GenerateTask,
  GeneratedImage,
  TaskStatus,
} from "@/lib/types";

export type VersionTreeItem = {
  id: string;
  taskId: string;
  imageId: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  seed: number;
  prompt: string;
  modelName: string;
  serviceName: string;
  status: TaskStatus;
  parentId: string | null;
  position: XYPosition;
  manualPosition?: boolean;
  pending?: boolean;
};

export type VersionTreeActions = {
  openBranch: (id: string) => void;
  openPreview: (url: string) => void;
};

export type VersionTreeNodeData = {
  item: VersionTreeItem;
  actions: MutableRefObject<VersionTreeActions>;
};

export type VersionTreeFlowNode = Node<VersionTreeNodeData, "version">;

export type VersionTreeProps = {
  task: GenerateTask;
  image: GeneratedImage;
  onClose: () => void;
  onStarted: (taskId: string) => void;
};

export type BranchDraft = {
  mode: BranchMode;
  promptDelta: string;
};
