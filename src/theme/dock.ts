// Equal slots in one bar. The raised selected circle is gone, so clearance is the bar plus the system inset.
export const PILL_HEIGHT = 72;
// Minimum touch size for one slot. It no longer lifts the selected tab.
export const TAB_CIRCLE = 44;
export const DOCK_HEIGHT = PILL_HEIGHT;

// A three-button Android bar often reports no inset, so the dock would sit on those buttons.
export function dockBottomInset(bottomInset: number): number {
  return (bottomInset >= 24 ? bottomInset : 48) + 8;
}

// Icon, gap, two label lines, and vertical padding. The bar never shrinks below the default.
export function dockHeight(fontScale = 1): number {
  return Math.max(72, Math.ceil(20 + 2 + 28 * fontScale + 12));
}

// Distance from the physical bottom of the screen to the top of the dock.
export function dockClearance(bottomInset: number, fontScale = 1): number {
  return dockHeight(fontScale) + dockBottomInset(bottomInset);
}

// The dock paints a solid surface. The wave stays on the page, not behind the labels.
export const GLASS_ALPHA = 1;

export function glassTint(hex: string, alpha = GLASS_ALPHA): string {
  const raw = hex.replace('#', '');
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
