/** Pure, clock-free M6.3 oscillator. x = short-side fractions; v = fractions/second.
 * Canonical 1ms steps use the exact oscillator transition, followed by an
 * inelastic limit projection. Partial observations NEVER advance the grid.
 * Input events commit dense output at their exact timestamp and start a new grid.
 */
import { checkJellyParams, type JellyBehavior } from './jelly';
export const JELLY_STEP_MS = 1;
export interface MotionPair { x: number; v: number }
export interface JellyMotion extends MotionPair {
  readonly behavior: JellyBehavior;
  readonly target: number;
  readonly pressed: boolean;
  readonly time: number;
  readonly origin: number;
  readonly ticks: number;
  readonly base: MotionPair;
}
const finiteTime = (time: number) => { if (!Number.isFinite(time)) throw new Error('Tempo Jelly non finito'); return time; };
const omega = (b: JellyBehavior) => 2 * Math.PI / (b.responseMs / 1000);
function behaviorCopy(b: JellyBehavior): JellyBehavior {
  const result = checkJellyParams(b, { partial: true, scope: 'behavior' });
  if (result.errors.length) throw new Error(result.errors.join('; '));
  for (const key of ['responseMs', 'dampingRatio', 'maxDeformation', 'pressStrength', 'releaseImpulse'] as const)
    if (!Number.isFinite(b[key])) throw new Error(`behavior.${key} mancante`);
  return { ...b };
}
/** Stable closed form, including the continuous limit at critical damping. */
export function oscillator(p: MotionPair, target: number, responseMs: number, zeta: number, seconds: number): MotionPair {
  if (![p.x, p.v, target, responseMs, zeta, seconds].every(Number.isFinite) || responseMs <= 0 || zeta < 0 || seconds < 0) throw new Error('Oscillatore Jelly non valido');
  if (!seconds) return { ...p };
  const w = 2 * Math.PI / (responseMs / 1000), a = zeta * w, y = p.x - target;
  const d = zeta*zeta - 1;
  let ec: number, es: number;
  if (Math.abs(d) < 1e-10) { const e = Math.exp(-a*seconds); ec = e; es = seconds*e; }
  else if (d < 0) { const q = w*Math.sqrt(-d), e = Math.exp(-a*seconds); ec = e*Math.cos(q*seconds); es = e*Math.sin(q*seconds)/q; }
  else {
    const q = w*Math.sqrt(d);
    // Exponentials of the two negative roots avoid exp(-a*t)*cosh(q*t) overflow.
    const e1 = Math.exp((-a+q)*seconds), e2 = Math.exp((-a-q)*seconds);
    ec = (e1+e2)/2; es = (e1-e2)/(2*q);
  }
  return { x: target + y*ec + (p.v+a*y)*es, v: p.v*ec - (a*p.v+w*w*y)*es };
}
function bounded(p: MotionPair, b: JellyBehavior): MotionPair {
  const limit = b.maxDeformation;
  if (!limit) return { x: 0, v: 0 };
  const x = Math.max(-limit, Math.min(limit, p.x));
  // Finite energy ceiling also bounds deliberate rapid alternating input.
  const cap = omega(b)*limit*2;
  let v = Math.max(-cap, Math.min(cap, p.v));
  if ((x === limit && v > 0) || (x === -limit && v < 0)) v = 0;
  return { x, v };
}
export function initJellyMotion(behavior: JellyBehavior, time = 0): JellyMotion {
  const b = behaviorCopy(behavior);
  return { behavior: b, x: 0, v: 0, target: 0, pressed: false, time: finiteTime(time), origin: time, ticks: 0, base: { x: 0, v: 0 } };
}
export function evolveJellyMotion(s: JellyMotion, time: number): JellyMotion {
  finiteTime(time);
  if (time <= s.time) return s;
  let ticks = s.ticks, base = s.base;
  const end = Math.floor((time-s.origin)/JELLY_STEP_MS + 1e-9);
  // Bounded recovery: after 60s the slowest allowed oscillator is far below
  // floating point visual relevance. Runtime suspension resets instead.
  if ((base.x === s.target && base.v === 0) || end-ticks > 60000) {
    base = { x: s.target, v: 0 }; ticks = end;
  } else while (ticks < end) {
    base = bounded(oscillator(base, s.target, s.behavior.responseMs, s.behavior.dampingRatio, JELLY_STEP_MS/1000), s.behavior);
    ticks++;
  }
  const remainder = Math.max(0, time-s.origin-ticks*JELLY_STEP_MS)/1000;
  const p = bounded(oscillator(base, s.target, s.behavior.responseMs, s.behavior.dampingRatio, remainder), s.behavior);
  return { ...s, ...p, base, ticks, time };
}
function commit(s: JellyMotion, time: number): JellyMotion {
  const next = evolveJellyMotion(s, time);
  return { ...next, origin: next.time, ticks: 0, base: { x: next.x, v: next.v } };
}
export function targetJellyMotion(s: JellyMotion, target: number, time: number): JellyMotion {
  if (!Number.isFinite(target)) throw new Error('Target Jelly non finito');
  const next = commit(s, time), limit = s.behavior.maxDeformation;
  return { ...next, target: Math.max(-limit, Math.min(limit, target)) };
}
/** Impulse in fractions/second, projected to the shared energy ceiling. */
export function impulseJellyMotion(s: JellyMotion, deltaV: number, time: number): JellyMotion {
  if (!Number.isFinite(deltaV)) throw new Error('Impulso Jelly non finito');
  const next = commit(s, time), p = bounded({ x: next.x, v: next.v+deltaV }, next.behavior);
  return { ...next, ...p, base: p };
}
export function pressJellyMotion(s: JellyMotion, pressed: boolean, time: number): JellyMotion {
  if (s.pressed === pressed) return evolveJellyMotion(s, time);
  const enabled = s.behavior.press === 'enabled';
  let next = targetJellyMotion(s, pressed && enabled ? s.behavior.pressStrength*s.behavior.maxDeformation : 0, time);
  // Zero press strength deliberately means zero motion, including release.
  if (!pressed && enabled && s.behavior.pressStrength > 0)
    next = impulseJellyMotion(next, -s.behavior.releaseImpulse*omega(s.behavior)*s.behavior.maxDeformation, time);
  return { ...next, pressed };
}
/** Cancellation is an immediate rest reset, never an intentional release. */
export function resetJellyMotion(s: JellyMotion, time: number): JellyMotion { return initJellyMotion(s.behavior, finiteTime(time)); }
export function configureJellyMotion(s: JellyMotion, behavior: JellyBehavior, time: number): JellyMotion {
  const b = behaviorCopy(behavior), next = commit(s, time), p = bounded(next, b);
  const pressed = next.pressed && b.press === 'enabled';
  return { ...next, ...p, base: p, behavior: b, pressed, target: pressed ? b.pressStrength*b.maxDeformation : 0 };
}
/** Both displacement AND velocity matter; a turning point cannot settle. No math snap. */
export const jellyMotionSettled = (s: JellyMotion): boolean => Math.abs(s.x-s.target) < 1e-4 && Math.abs(s.v) < 1e-3;
