import type { InternalNode } from '../../types';
/**
 * Hook to handle the resize observation + internal updates for the passed node.
 *
 * @internal
 * @returns nodeRef - reference to the node element
 */
export declare function useNodeObserver({ node, nodeType, hasDimensions, resizeObserver, }: {
    node: InternalNode;
    nodeType: string;
    hasDimensions: boolean;
    resizeObserver: ResizeObserver | null;
}): any;
//# sourceMappingURL=useNodeObserver.d.ts.map