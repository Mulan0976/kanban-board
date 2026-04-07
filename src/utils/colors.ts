export const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb7185',
  '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#818cf8', '#c084fc',
  '#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8',
  '#60a5fa', '#a78bfa', '#e879f9', '#f9a8d4', '#fdba74', '#fde047',
  '#86efac', '#5eead4', '#7dd3fc', '#93c5fd', '#c4b5fd', '#f0abfc',
  '#fda4af', '#fed7aa', '#fef08a', '#bbf7d0', '#99f6e4', '#a5f3fc',
];

/**
 * Converts a hex color string to an rgba color string with the given alpha.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns a deterministic color from a 10-color palette based on a string ID hash.
 */
export function getLinkColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const palette = [
    '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#f59e0b',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  ];
  return palette[Math.abs(hash) % palette.length];
}

/**
 * Returns '#ffffff' or '#000000' depending on which has better contrast
 * against the given hex background color, using relative luminance.
 */
export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // Convert to linear RGB
  const linearR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const linearG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const linearB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  // Relative luminance (WCAG formula)
  const luminance = 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;

  // Return white text for dark backgrounds, black text for light backgrounds
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
