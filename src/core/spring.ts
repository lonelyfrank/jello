/**
 * Damped spring, integrated with semi-implicit Euler in fixed sub-steps so the
 * result does not depend on the display refresh rate. Pure and allocation-free:
 * the state object is mutated in place.
 */

export interface Spring {
  value: number;
  velocity: number;
  target: number;
}

export interface SpringConfig {
  /** Stiffness k, 1/s². */
  stiffness: number;
  /** Damping ratio ζ: 1 = critical, < 1 overshoots. */
  damping: number;
}

const STEP = 1 / 240;
/** Longer gaps (tab switch, breakpoint) are not simulated: the spring jumps. */
const MAX_DT = 0.1;

export function spring(value: number): Spring {
  return { value, velocity: 0, target: value };
}

export function stepSpring(s: Spring, dt: number, c: SpringConfig): void {
  if (dt > MAX_DT) {
    snapSpring(s);
    return;
  }
  const k = c.stiffness;
  const damp = 2 * c.damping * Math.sqrt(k);
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = remaining < STEP ? remaining : STEP;
    const a = -k * (s.value - s.target) - damp * s.velocity;
    s.velocity += a * h;
    s.value += s.velocity * h;
    remaining -= h;
  }
}

export function snapSpring(s: Spring): void {
  s.value = s.target;
  s.velocity = 0;
}

export function isSettled(s: Spring, epsilon = 0.01, velocityEpsilon = 0.05): boolean {
  return Math.abs(s.value - s.target) < epsilon && Math.abs(s.velocity) < velocityEpsilon;
}
