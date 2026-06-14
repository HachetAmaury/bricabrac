// Palette offered when creating/editing a category.
export const CATEGORY_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#78716c', // stone
  '#64748b' // slate
];

// A translucent tint of a hex colour, suitable as a button background.
export function tint(hex: string, alpha = '22'): string {
  return `${hex}${alpha}`;
}
