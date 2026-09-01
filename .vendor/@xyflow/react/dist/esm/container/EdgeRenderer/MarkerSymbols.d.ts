import { MarkerType, type EdgeMarker } from '@xyflow/system';
type SymbolProps = Omit<EdgeMarker, 'type'>;
export declare const MarkerSymbols: {
    [x: number]: ({ color, strokeWidth }: SymbolProps) => any;
};
export declare function useMarkerSymbol(type: MarkerType | `${MarkerType}`): any;
export {};
//# sourceMappingURL=MarkerSymbols.d.ts.map