import type { OnSelectionChangeFunc, Node, Edge } from '../../types';
type SelectionListenerProps<NodeType extends Node = Node, EdgeType extends Edge = Edge> = {
    onSelectionChange?: OnSelectionChangeFunc<NodeType, EdgeType>;
};
export declare function SelectionListener<NodeType extends Node = Node, EdgeType extends Edge = Edge>({ onSelectionChange, }: SelectionListenerProps<NodeType, EdgeType>): any;
export {};
//# sourceMappingURL=index.d.ts.map