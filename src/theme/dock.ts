// The selected tab's circle rises above the pill. DOCK_HEIGHT includes that rise.
export const PILL_HEIGHT = 68;
export const TAB_CIRCLE = 64;
export const DOCK_HEIGHT = PILL_HEIGHT + TAB_CIRCLE / 2;

// A three-button Android bar often reports no inset, so the dock would sit on those buttons.
export function dockBottomInset(bottomInset: number): number {
  return (bottomInset >= 24 ? bottomInset : 48) + 8;
}

// Distance from the physical bottom of the screen to the top of the dock.
export function dockClearance(bottomInset: number): number {
  return DOCK_HEIGHT + dockBottomInset(bottomInset);
}

// A tint, not a blur. The wave stays recognizable and the tab labels stay sharp.
export const GLASS_ALPHA = 0.68;

export function glassTint(hex: string, alpha = GLASS_ALPHA): string {
  const raw = hex.replace('#', '');
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
