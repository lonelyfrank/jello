/** Model helpers used by the dashboard components. */
export { FAMILIES, glassParams } from '../../model';

export function hexToRgbSafe(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [255, 255, 255];
}
