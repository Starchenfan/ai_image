import type { MouseEvent as ReactMouseEvent, SVGAttributes } from 'react';
import { Position } from '@xyflow/system';
export interface EdgeAnchorProps extends SVGAttributes<SVGGElement> {
    position: Position;
    centerX: number;
    centerY: number;
    radius?: number;
    onMouseDown: (event: ReactMouseEvent<SVGGElement, MouseEvent>) => void;
    onMouseEnter: (event: ReactMouseEvent<SVGGElement, MouseEvent>) => void;
    onMouseOut: (event: ReactMouseEvent<SVGGElement, MouseEvent>) => void;
    type: string;
}
/**
 * @internal
 */
export declare function EdgeAnchor({ position, centerX, centerY, radius, onMouseDown, onMouseEnter, onMouseOut, type, }: EdgeAnchorProps): any;
//# sourceMappingURL=EdgeAnchor.d.ts.map