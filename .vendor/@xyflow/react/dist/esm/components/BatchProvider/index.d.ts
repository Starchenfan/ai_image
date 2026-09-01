import { ReactNode } from 'react';
import type { Edge, Node } from '../../types';
/**
 * This is a context provider that holds and processes the node and edge update queues
 * that are needed to handle setNodes, addNodes, setEdges and addEdges.
 *
 * @internal
 */
export declare function BatchProvider<NodeType extends Node = Node, EdgeType extends Edge = Edge>({ children, }: {
    children: ReactNode;
}): any;
export declare function useBatchContext(): any;
//# sourceMappingURL=index.d.ts.map