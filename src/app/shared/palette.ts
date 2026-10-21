/**
 * The colours that code draws with: the charts, the 3D bat, the score ring and the direction
 * label. They are the same values as the variables in the :root blocks of the two page
 * stylesheets, which say what each colour means. Change both together.
 */
export const PALETTE = {
  ink: '#17241c',
  muted: '#5a695f',
  border: '#dcdfd4',
  surface: '#ffffff',
  sage: '#f0f3ec',
  /** Forest green: the brand, the main action, bat speed. */
  accent: '#1e5b3a',
  /** Field green: a good result, straight, start. */
  green: '#3a8a3f',
  /** Ochre: the off side, a fair result, acceleration. */
  ochre: '#a8620f',
  /** Slate blue: the leg side. */
  leg: '#2b5b86',
  /** Stop, a poor result, errors. */
  red: '#b42318',
} as const;

/** The same colour as `#rrggbb` turned into rgba() with the given opacity. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}
