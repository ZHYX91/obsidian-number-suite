export interface HeadingMapViewportState {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
}

export function zoomHeadingMapViewport(
  state: HeadingMapViewportState,
  nextScale: number,
  anchorX: number,
  anchorY: number,
  minimumScale: number,
  maximumScale: number,
): HeadingMapViewportState {
  const scale = Math.min(maximumScale, Math.max(minimumScale, nextScale));
  if (Math.abs(scale - state.scale) < 0.001) return state;
  const logicalX = (anchorX - state.offsetX) / state.scale;
  const logicalY = (anchorY - state.offsetY) / state.scale;
  return {
    scale,
    offsetX: anchorX - logicalX * scale,
    offsetY: anchorY - logicalY * scale,
  };
}
