/**
 * Comparison Stage of the Jello Visual Review. Every surface is the real renderer on a real host Button
 * (`JellyButton` → `JellyBridge` → `ExperimentalJellySurface`): live modes run on the shared RAF
 * coordinator, the motion mode on a manual clock. Nothing here draws a material.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { jellyLocalContact } from '../../../../runtime/experimental/jelly-input';
import { JellyCoordinator } from '../../../../runtime/experimental/jelly-scheduler';
import type { JellyBridge } from '../bridge';
import { JellyButton } from '../JellyButton';
import { DEFAULT_ENV, type PreviewState } from '../preview-model';
import {
  cellsFor, contentProps, FRAME_MS, HOLD_MS, MOTION_PHASE_LABEL, MOTION_PHASES, phaseTime, TIMELINE_MS, viewportMetrics, viewportOf,
  type CellSpec, type MotionPhase, type ReviewView,
} from './review-model';
import { SyncHub } from './sync';
import { ManualClock, TimelineController, type TimelineTarget } from './timeline';
import { normalizeTint, reviewVariant, VARIANT_INFO } from './variants';

export type BridgeRegistry = (spec: CellSpec, bridge: JellyBridge | null) => void;

/** Fixed lorem for the «Testo» background: the Button sits over real running text. */
const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur '.repeat(4);

interface CellProps {
  spec: CellSpec;
  view: ReviewView;
  coordinator: JellyCoordinator;
  state: PreviewState;
  register: BridgeRegistry;
  hub?: SyncHub;
  inert?: boolean;
  focus: boolean;
  children?: React.ReactNode;
}

function Cell({ spec, view, coordinator, state, register, hub, inert, focus, children }: CellProps) {
  const variant = useMemo(() => reviewVariant(spec.presetId, spec.variantId), [spec.presetId, spec.variantId]);
  const doc = useMemo(() => (view.normalized ? normalizeTint(variant.doc) : variant.doc), [variant, view.normalized]);
  const env = useMemo(() => ({ ...DEFAULT_ENV, reducedMotion: view.reducedMotion }), [view.reducedMotion]);
  const vp = viewportOf(view);
  const m = viewportMetrics(vp);
  const content = contentProps(view.content);
  const [errors, setErrors] = useState<string[] | null>(null);
  const bridgeRef = useRef<JellyBridge | null>(null);

  const onBridge = (b: JellyBridge | null) => {
    bridgeRef.current = b;
    register(spec, b);
    setErrors(b?.errors ?? null);
  };
  // A rejected document is reported next to its cell; the host stays a working native button.
  useEffect(() => { setErrors(bridgeRef.current?.errors ?? null); }, [doc]);

  const gesture = hub && !inert ? {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      const host = e.currentTarget.querySelector('button');
      if (e.button === 0 && e.isPrimary && host && !host.disabled) hub.press(spec.key, jellyLocalContact(host, e.clientX, e.clientY));
    },
    onPointerEnter: (e: React.PointerEvent<HTMLDivElement>) => { if (e.pointerType !== 'touch') hub.hover(spec.key, true); },
    onPointerLeave: () => { if (hub.sourceId === spec.key) hub.cancel(); hub.hover(spec.key, false); },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => { if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) hub.press(spec.key, { x: 0.5, y: 0.5 }); },
    onKeyUp: (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') hub.release(spec.key); },
    onBlur: () => { if (hub.sourceId === spec.key) hub.cancel(); },
  } : {};

  const style = { '--rv-w': `${vp.width * view.zoom}px` } as CSSProperties;
  return (
    <figure className="rv-cell" data-testid={`rv-cell-${spec.key}`} data-variant={spec.variantId} data-preset={spec.presetId} data-focus={focus} style={style}>
      <div className="rv-tile" data-background={view.background}>
        {view.background === 'text' && <p className="rv-copy" aria-hidden="true">{LOREM}</p>}
        <div className="rv-scaled" style={{ width: vp.width * view.zoom, height: vp.height * view.zoom }}>
          <div className="rv-zoom" style={{ transform: `scale(${view.zoom})` }} {...(inert ? { inert: true } : gesture)}>
            <JellyButton
              testId={`rv-btn-${spec.key}`}
              doc={doc}
              env={env}
              state={state}
              box={{ width: vp.width, height: vp.height, paddingX: m.paddingX }}
              fontSize={m.fontSize}
              label={content.label}
              icon={content.icon}
              {...(content.ariaLabel ? { ariaLabel: content.ariaLabel } : {})}
              renderExtra={variant.options}
              coordinator={coordinator}
              onBridge={onBridge}
            />
          </div>
        </div>
      </div>
      <figcaption>
        <strong>{spec.label}</strong>
        <span className="rv-meta">{variant.treatment === 'm643' ? 'trattamento m643' : 'trattamento m642'}{variant.sameAs ? ` · identica a ${variant.sameAs}` : ''}</span>
        {errors && <span className="rv-error" role="alert">Variante non valida: {errors[0]}</span>}
        {children}
      </figcaption>
    </figure>
  );
}

const gridStyle = (view: ReviewView) => ({ '--rv-w': `${viewportOf(view).width * view.zoom}px` }) as CSSProperties;

// ------------------------------------------------------------------ live comparison (side by side, grid)

export function LiveStage({ view, register, bounceSignal }: { view: ReviewView; register: BridgeRegistry; bounceSignal: number }) {
  const coordinator = useMemo(() => new JellyCoordinator({ now: () => performance.now(), request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) }), []);
  const hub = useMemo(() => new SyncHub(), []);
  const bridges = useRef(new Map<string, JellyBridge>());
  const unregister = useRef(new Map<string, () => void>());
  const cells = cellsFor(view);

  useEffect(() => () => coordinator.destroy(), [coordinator]);
  useEffect(() => { hub.enabled = view.sync; }, [hub, view.sync]);
  // The one gesture that ends outside its cell: released (or cancelled) on the window, like the real adapter.
  useEffect(() => {
    const ac = new AbortController();
    window.addEventListener('pointerup', () => { const id = hub.sourceId; if (id) hub.release(id); }, { signal: ac.signal });
    window.addEventListener('pointercancel', () => hub.cancel(), { signal: ac.signal });
    window.addEventListener('blur', () => hub.cancel(), { signal: ac.signal });
    return () => ac.abort();
  }, [hub]);
  // «Prova rimbalzo»: the same programmatic press/hold/release on every live cell.
  useEffect(() => { if (bounceSignal) for (const b of bridges.current.values()) b.playBounce(); }, [bounceSignal]);

  const registerBridge: BridgeRegistry = (spec, bridge) => {
    register(spec, bridge);
    unregister.current.get(spec.key)?.();
    unregister.current.delete(spec.key);
    if (bridge) {
      bridges.current.set(spec.key, bridge);
      unregister.current.set(spec.key, hub.register(spec.key, { press: (p, pt) => bridge.press(p, pt), hover: (h) => bridge.hover(h), reset: () => bridge.reset() }));
    } else bridges.current.delete(spec.key);
  };

  return (
    <div className="rv-grid" style={gridStyle(view)} data-mode={view.mode} data-axis={view.axis} data-count={cells.length} role="group" aria-label="Superfici a confronto">
      {cells.map((c) => (
        <Cell key={c.key} spec={c} view={view} coordinator={coordinator} state={view.state} register={registerBridge} hub={hub} focus={c.variantId === view.variantId && c.presetId === view.presetId} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ motion comparison (manual clock)

const fmt = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(4);

export function MotionStage({ view, register }: { view: ReviewView; register: BridgeRegistry }) {
  const clock = useMemo(() => new ManualClock(), []);
  const coordinator = useMemo(() => new JellyCoordinator(clock), [clock]);
  const cells = cellsFor(view);
  const bridges = useRef(new Map<string, JellyBridge>());
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const scrub = useRef<HTMLInputElement>(null);
  const timeOut = useRef<HTMLOutputElement>(null);
  const readouts = useRef(new Map<string, HTMLOutputElement>());
  const peaks = useRef(new Map<string, HTMLOutputElement>());
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<MotionPhase | null>('idle');
  const pending = useRef<(() => void) | null>(null);
  const focusDoc = useMemo(() => reviewVariant(view.presetId, view.variantId).doc, [view.presetId, view.variantId]);

  const controller = useMemo(() => new TimelineController(clock, () => cellsRef.current.flatMap((c): TimelineTarget[] => {
    const b = bridges.current.get(c.key);
    return b ? [{ press: (p) => b.press(p), reset: () => b.reset(), get motion() { return b.motion; } }] : [];
  }), {
    onPlayingChange: setPlaying,
    onTime: (t, xs) => {
      if (scrub.current) { scrub.current.value = String(Math.round(t)); scrub.current.setAttribute('aria-valuetext', `${Math.round(t)} ms`); }
      if (timeOut.current) timeOut.current.textContent = `t = ${Math.round(t)} ms`;
      cellsRef.current.forEach((c, i) => {
        const o = readouts.current.get(c.key);
        if (o) o.textContent = `x ${fmt(xs[i] ?? 0)}`;
        const p = peaks.current.get(c.key);
        if (p) p.textContent = `picco ${(controller.peakDisplacement[i] ?? 0).toFixed(4)}`;
      });
    },
  }), [clock]);
  useEffect(() => () => { controller.destroy(); coordinator.destroy(); }, [controller, coordinator]);

  // A different preset, viewport, content or document restarts from the idle surface.
  const signature = `${view.presetId}|${view.viewportId}|${view.custom.width}x${view.custom.height}|${view.content}|${view.normalized}|${view.reducedMotion}|${view.zoom}`;
  useEffect(() => { controller.reset(); setPhase('idle'); }, [controller, signature]);

  const registerBridge: BridgeRegistry = (spec, bridge) => {
    register(spec, bridge);
    if (bridge) bridges.current.set(spec.key, bridge); else bridges.current.delete(spec.key);
  };

  // The renderer suspends a surface that is scrolled out of view and resumes it at rest. When a cell comes back into view the
  // timeline replays to the current time with the same input, so every visible cell shows the same instant.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      let resumed = false;
      for (const e of entries) { if (e.isIntersecting && seen.get(e.target) === false) resumed = true; seen.set(e.target, e.isIntersecting); }
      if (resumed) setTimeout(() => controller.seek(controller.currentTime), 0);
    });
    root.current?.querySelectorAll('.rv-scaled').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [controller, signature, cells.length]);

  const goto = (p: MotionPhase) => {
    pending.current = null;
    setPhase(p);
    controller.reset();
    const at = phaseTime(p, focusDoc.behavior);
    if (at !== null) controller.seek(at);
  };
  const cellState: PreviewState = phase === 'hover' ? 'hover' : phase === 'disabled' ? 'disabled' : 'live';
  const reduced = view.reducedMotion;
  // Time controls need live cells (a forced hover/disabled state ignores press). When one is forced, go live first and act after the render.
  const act = (fn: () => void) => {
    if (cellState === 'live') { setPhase(null); fn(); return; }
    pending.current = fn;
    setPhase(null);
  };
  useEffect(() => { const fn = pending.current; pending.current = null; fn?.(); }, [phase]);

  return (
    <div className="rv-motion" ref={root}>
      {reduced && <p className="jl-banner" role="status" id="rv-motion-reduced">Movimento ridotto simulato: le superfici usano il profilo statico e non si deformano, quindi la timeline resta ferma. È il comportamento atteso, non un errore.</p>}
      <div className="rv-grid" style={gridStyle(view)} data-mode="motion" data-count={cells.length} role="group" aria-label="Superfici a confronto nel tempo">
        {cells.map((c) => (
          <Cell key={c.key} spec={c} view={view} coordinator={coordinator} state={cellState} register={registerBridge} inert focus={c.variantId === view.variantId}>
            <output className="rv-x" data-testid={`rv-x-${c.variantId}`} ref={(el) => { if (el) readouts.current.set(c.key, el); else readouts.current.delete(c.key); }}>x +0.0000</output>
            <output className="rv-peak" data-testid={`rv-peak-${c.variantId}`} ref={(el) => { if (el) peaks.current.set(c.key, el); else peaks.current.delete(c.key); }}>picco 0.0000</output>
          </Cell>
        ))}
      </div>
      <div className="rv-transport" role="group" aria-label="Controllo della timeline">
        <button type="button" className="button small" id="rv-play" aria-pressed={playing} onClick={() => { if (playing) controller.pause(); else act(() => controller.play()); }}>
          {playing ? 'Pausa' : 'Play'}
        </button>
        <button type="button" className="button small" id="rv-restart" onClick={() => act(() => controller.restart())}>Restart</button>
        <button type="button" className="button small" id="rv-step" onClick={() => act(() => controller.step())} title={`Avanza di un frame (${FRAME_MS} ms)`}>Step</button>
        <label className="rv-scrub">
          <span className="visually-hidden">Posizione temporale</span>
          <input ref={scrub} id="rv-scrubber" type="range" min={0} max={TIMELINE_MS} step={1} defaultValue={0} aria-valuetext="0 ms"
            onChange={(e) => { const t = Number(e.currentTarget.value); act(() => controller.seek(t)); }} />
        </label>
        <output ref={timeOut} id="rv-time" className="rv-time" aria-live="off">t = 0 ms</output>
      </div>
      <div className="rv-phases" role="group" aria-label="Fasi della risposta">
        {MOTION_PHASES.map((p) => (
          <button key={p} type="button" className="button small" id={`rv-phase-${p}`} aria-pressed={phase === p} onClick={() => goto(p)}>{MOTION_PHASE_LABEL[p]}</button>
        ))}
      </div>
      <details className="rv-note">
        <summary>Come funziona la timeline</summary>
        <p className="muted small">Pressione a 0 ms, rilascio a {HOLD_MS} ms, osservazione fino a {TIMELINE_MS} ms. Ogni frame è disegnato dal renderer reale con un orologio manuale; tornare indietro riavvia le superfici e le riporta al tempo scelto con lo stesso input. {phase ? `Fase «${MOTION_PHASE_LABEL[phase]}» · ` : 'Tempo libero · '}le fasi con un istante usano la variante in discussione ({VARIANT_INFO[view.variantId].label}). Le superfici fuori dallo schermo sono sospese dal renderer: tornando in vista vengono riallineate al tempo corrente.</p>
      </details>
    </div>
  );
}
