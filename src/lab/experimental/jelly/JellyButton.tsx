/**
 * A generic Button decorated by the real Jelly renderer. The host is a native <button>
 * that React owns; the bridge only prepends a decoration layer to it. Text, icon, padding,
 * size and radius belong to the button, not to the decoration, and the hitbox is the
 * button's own box, so it does not move while the jelly deforms.
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { JellyExperimentalDocument } from '../../../model/experimental/jelly';
import type { JellyRenderOptions } from '../../../runtime/experimental/jelly';
import type { JellyCoordinator } from '../../../runtime/experimental/jelly-scheduler';
import { JellyBridge, realDeps } from './bridge';
import { effectiveDoc, previewSizePx, renderOptions, type PreviewEnv, type PreviewSize, type PreviewState } from './preview-model';

export interface JellyButtonProps {
  doc: JellyExperimentalDocument;
  env: PreviewEnv;
  state: PreviewState;
  size?: PreviewSize;
  /** Explicit box (Builder trial); wins over `size`. */
  box?: { width?: number | 'auto'; height: number; paddingX?: number; fontWeight?: number };
  label?: string;
  icon?: boolean;
  /** Accessible name when the visible label is empty (icon-only button). */
  ariaLabel?: string;
  /** Extra renderer options (the review workspace's treatment); merged over the environment's. Memoise it: identity drives updates. */
  renderExtra?: JellyRenderOptions;
  coordinator?: JellyCoordinator;
  onBridge?(bridge: JellyBridge | null): void;
  onClick?(): void;
  id?: string;
  testId?: string;
  fontSize?: number;
}

const StarIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" focusable="false">
    <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

export function JellyButton({ doc, env, state, size = 'md', box, label = 'Jelly', icon = true, ariaLabel, renderExtra, coordinator, onBridge, onClick, id, testId, fontSize }: JellyButtonProps) {
  const host = useRef<HTMLButtonElement>(null);
  const bridge = useRef<JellyBridge | null>(null);
  const latest = useRef({ doc, env, state, onBridge, renderExtra });
  latest.current = { doc, env, state, onBridge, renderExtra };
  const applied = useRef<{ doc: JellyExperimentalDocument; env: PreviewEnv; renderExtra: JellyRenderOptions | undefined } | null>(null);

  // Create and destroy only with the host (or a different coordinator): never for a parameter change.
  useLayoutEffect(() => {
    const b = new JellyBridge(host.current!, realDeps, coordinator);
    bridge.current = b;
    const { doc: d, env: e, state: s, renderExtra: x } = latest.current;
    b.setPreviewState(s);
    b.apply(effectiveDoc(d, e), { ...renderOptions(e), ...x });
    applied.current = { doc: d, env: e, renderExtra: x };
    latest.current.onBridge?.(b);
    return () => {
      latest.current.onBridge?.(null);
      b.destroy();
      bridge.current = null;
      applied.current = null;
    };
  }, [coordinator]);

  useLayoutEffect(() => {
    const prev = applied.current;
    if (!bridge.current || (prev && prev.doc === doc && prev.env === env && prev.renderExtra === renderExtra)) return;
    bridge.current.apply(effectiveDoc(doc, env), { ...renderOptions(env), ...renderExtra });
    applied.current = { doc, env, renderExtra };
  }, [doc, env, renderExtra]);

  useLayoutEffect(() => { bridge.current?.setPreviewState(state); }, [state]);

  const px = previewSizePx(size);
  const width = box ? (box.width ?? 'auto') : px.width;
  const height = box ? box.height : px.height;
  const radius = doc.geometry.shape === 'capsule' ? 9999 : doc.geometry.radius;
  const style: CSSProperties = { width, height, borderRadius: radius, ...(box?.paddingX !== undefined ? { paddingInline: box.paddingX } : {}), ...(fontSize ? { fontSize } : {}), ...(box?.fontWeight ? { fontWeight: box.fontWeight } : {}) };
  return (
    <button
      ref={host}
      type="button"
      id={id}
      className="jl-btn"
      data-testid={testId}
      style={style}
      disabled={state === 'disabled'}
      aria-pressed={state === 'active' ? true : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className="jl-btn-content">
        {icon && <StarIcon />}
        {label !== '' && <span>{label}</span>}
      </span>
    </button>
  );
}
