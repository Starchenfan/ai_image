import { Position } from '@xyflow/system';
export interface GetSimpleBezierPathParams {
    sourceX: number;
    sourceY: number;
    /** @default Position.Bottom */
    sourcePosition?: Position;
    targetX: number;
    targetY: number;
    /** @default Position.Top */
    targetPosition?: Position;
}
/**
 * The `getSimpleBezierPath` util returns everything you need to render a simple
 * bezier edge between two nodes.
 * @public
 * @returns
 * - `path`: the path to use in an SVG `<path>` element.
 * - `labelX`: the `x` position you can use to render a label for this edge.
 * - `labelY`: the `y` position you can use to render a label for this edge.
 * - `offsetX`: the absolute difference between the source `x` position and the `x` position of the
 * middle of this path.
 * - `offsetY`: the absolute difference between the source `y` position and the `y` position of the
 * middle of this path.
 */
export declare function getSimpleBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, }: GetSimpleBezierPathParams): [path: string, labelX: number, labelY: number, offsetX: number, offsetY: number];
declare const SimpleBezierEdge: any;
declare const SimpleBezierEdgeInternal: any;
export { SimpleBezierEdge, SimpleBezierEdgeInternal };
//# sourceMappingURL=SimpleBezierEdge.d.ts.map