/**
 * One colour popover everywhere: material tint, component colours, assets.
 * Four ways in: visual (square + hue), values (RGB, HSL, HEX, OKLCH), and the
 * project's tokens. Every control is a real input or button; the square is a
 * keyboard-operable 2D control.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLab } from '../store';
import { hexToRgb, hslToRgb, normalizeHex, oklchToRgb, parseColor, rgbToHex, rgbToHsl, rgbToOklch, type Oklch, type Rgb } from '../../project/color';
import { Ic, StateChip } from './ui';

export interface TokenOption {
  name: string;
  token: string;
  hex: string;
  group: string;
}

type Mode = 'visual' | 'values' | 'tokens';
type Format = 'rgb' | 'hsl' | 'hex' | 'oklch';

const RECENT_KEY = 'jello.recent-colors';
function recent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function remember(hex: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...recent().filter((x) => x !== hex)].slice(0, 8)));
  } catch {
    /* storage unavailable: recents are a convenience */
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function Slider({ label, value, min, max, step, onChange, track, unit, id }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; track?: string; unit?: string; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="cp-slider">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} type="range" min={min} max={max} step={step} value={value} style={track ? { background: track } : undefined} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="cp-num">
        <input aria-label={`${label}, valore`} type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0} onChange={(e) => e.target.value !== '' && onChange(clamp(Number(e.target.value), min, max))} />
        {unit && <span className="muted">{unit}</span>}
      </span>
    </div>
  );
}

/** The active project's colours as tokens to pick from. */
export function useProjectTokens(): TokenOption[] | undefined {
  const palettes = useLab((s) => s.projects.find((p) => p.id === s.projectId)?.assets.palettes);
  return useMemo(() => (palettes && palettes.some((p) => p.colors.length) ? palettes.flatMap((p) => p.colors.map((c) => ({ name: c.name, token: c.token, hex: c.hex, group: p.name }))) : undefined), [palettes]);
}

/** The popover body, independent of how it is opened. */
export function ColorPanel({
  hex,
  alpha,
  onChange,
  tokens,
  linked,
  onLink,
  onUnlink,
  withAlpha = true,
}: {
  hex: string;
  alpha: number;
  onChange(hex: string, alpha: number): void;
  tokens?: readonly TokenOption[];
  linked?: string | null;
  onLink?(t: TokenOption): void;
  onUnlink?(): void;
  withAlpha?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('visual');
  const [format, setFormat] = useState<Format>('rgb');
  const [paste, setPaste] = useState('');
  const [hexText, setHexText] = useState(hex.slice(1).toUpperCase());
  const [query, setQuery] = useState('');
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  const okFromHex = rgbToOklch(rgb);
  // What was asked in OKLCH can lie outside sRGB; the hex is its clamped result, so the request is kept apart.
  const [okReq, setOkReq] = useState<Oklch | null>(null);
  const ok = okReq && rgbToHex(oklchToRgb(okReq).rgb) === hex ? okReq : okFromHex;
  const setOk = (next: Oklch) => {
    setOkReq(next);
    setRgb(oklchToRgb(next).rgb);
  };
  // The hue survives greys, where HSL cannot tell it.
  const [hue, setHue] = useState(hsl.h);
  useEffect(() => {
    if (hsl.s > 1 && hsl.l > 1 && hsl.l < 99) setHue(hsl.h);
    setHexText(hex.slice(1).toUpperCase());
  }, [hex]); // eslint-disable-line react-hooks/exhaustive-deps
  const sv = useRef<HTMLDivElement>(null);
  const modes = [
    { id: 'visual', label: 'Visivo' },
    { id: 'values', label: 'Valori' },
    ...(tokens ? [{ id: 'tokens', label: 'Token' }] : []),
  ] as { id: Mode; label: string }[];

  const setRgb = (c: Rgb) => onChange(rgbToHex(c), alpha);
  const setHsv = (h: number, s: number, v: number) => {
    // HSV → HSL
    const l = v * (1 - s / 2);
    const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
    setHue(h);
    setRgb(hslToRgb({ h, s: sl * 100, l: l * 100 }));
  };
  // Current position in HSV for the thumb.
  const l01 = hsl.l / 100;
  const s01 = hsl.s / 100;
  const v = l01 + s01 * Math.min(l01, 1 - l01);
  const sHsv = v === 0 ? 0 : 2 * (1 - l01 / v);

  const dragSv = (e: React.PointerEvent) => {
    const el = sv.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    setHsv(hue, x, 1 - y);
  };
  const onSvKey = (e: React.KeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const map: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    setHsv(hue, clamp(sHsv + m[0], 0, 1), clamp(v + m[1], 0, 1));
  };

  const commitHex = (text: string) => {
    const n = normalizeHex(text);
    if (n) onChange(n, alpha);
  };
  const parsed = paste ? parseColor(paste) : null;
  const gamut = oklchToRgb(ok);
  const hueTrack = 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)';

  const q = query.trim().toLowerCase();
  const groups = new Map<string, TokenOption[]>();
  for (const t of tokens ?? []) if (!q || t.name.toLowerCase().includes(q) || t.token.includes(q)) groups.set(t.group, [...(groups.get(t.group) ?? []), t]);
  const recents = recent();

  return (
    <div className="cp">
      <div className="cp-tabs" role="tablist" aria-label="Modalità di inserimento">
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className="cp-tab" onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'visual' && (
        <div className="cp-body">
          <div
            ref={sv}
            className="cp-sv"
            style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${Math.round(hue)} 100% 50%))` }}
            tabIndex={0}
            role="group"
            aria-label="Saturazione e luminosità"
            aria-roledescription="selettore a due assi"
            aria-description={`Saturazione ${Math.round(sHsv * 100)}%, luminosità ${Math.round(v * 100)}%. Frecce per spostare, Maiusc per passi più larghi.`}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              dragSv(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && dragSv(e)}
            onPointerUp={() => remember(hex)}
            onKeyDown={onSvKey}
          >
            <span className="cp-thumb" style={{ left: `${sHsv * 100}%`, top: `${(1 - v) * 100}%`, background: hex }} />
          </div>
          <Slider label="Tonalità" value={Math.round(hue)} min={0} max={360} step={1} onChange={(h) => setHsv(h, sHsv || 0.5, v || 0.5)} track={hueTrack} unit="°" />
          <div className="cp-row">
            <label className="cp-hex">
              <span>HEX</span>
              <span className="cp-hex-in">
                <span aria-hidden="true">#</span>
                <input
                  value={hexText}
                  maxLength={6}
                  spellCheck={false}
                  aria-label="Valore HEX"
                  aria-invalid={hexText.length > 0 && !normalizeHex(hexText)}
                  onChange={(e) => {
                    setHexText(e.target.value.toUpperCase());
                    commitHex(e.target.value);
                  }}
                  onBlur={() => setHexText(hex.slice(1).toUpperCase())}
                />
              </span>
            </label>
            {withAlpha && (
              <label className="cp-alpha">
                <span>Opacità</span>
                <span className="cp-hex-in">
                  <input type="number" min={0} max={100} aria-label="Opacità in percentuale" value={Math.round(alpha * 100)} onChange={(e) => onChange(hex, clamp(Number(e.target.value) / 100, 0, 1))} />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
            )}
            {'EyeDropper' in window && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Contagocce"
                title="Preleva un colore dallo schermo"
                onClick={async () => {
                  try {
                    const r = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
                    onChange(r.sRGBHex.toLowerCase(), alpha);
                    remember(r.sRGBHex.toLowerCase());
                  } catch {
                    /* cancelled */
                  }
                }}
              >
                <Ic name="eyedrop" />
              </button>
            )}
          </div>
          {recents.length > 0 && (
            <div className="cp-recent">
              <span className="muted small">Recenti</span>
              <div className="cp-recent-row">
                {recents.map((r) => (
                  <button key={r} type="button" className="swatch-btn" style={{ background: r }} aria-label={`Colore recente ${r}`} onClick={() => onChange(r, alpha)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'values' && (
        <div className="cp-body">
          <div className="seg" role="group" aria-label="Formato">
            {(['rgb', 'hsl', 'hex', 'oklch'] as Format[]).map((f) => (
              <button key={f} type="button" className="seg-b" aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {format === 'rgb' && (
            <>
              <Slider label="Rosso" value={rgb.r} min={0} max={255} step={1} onChange={(r) => setRgb({ ...rgb, r })} track={`linear-gradient(to right,rgb(0 ${rgb.g} ${rgb.b}),rgb(255 ${rgb.g} ${rgb.b}))`} />
              <Slider label="Verde" value={rgb.g} min={0} max={255} step={1} onChange={(g) => setRgb({ ...rgb, g })} track={`linear-gradient(to right,rgb(${rgb.r} 0 ${rgb.b}),rgb(${rgb.r} 255 ${rgb.b}))`} />
              <Slider label="Blu" value={rgb.b} min={0} max={255} step={1} onChange={(b) => setRgb({ ...rgb, b })} track={`linear-gradient(to right,rgb(${rgb.r} ${rgb.g} 0),rgb(${rgb.r} ${rgb.g} 255))`} />
            </>
          )}
          {format === 'hsl' && (
            <>
              <Slider label="Tonalità" value={Math.round(hsl.h)} min={0} max={360} step={1} unit="°" onChange={(h) => setRgb(hslToRgb({ ...hsl, h }))} track={hueTrack} />
              <Slider label="Saturazione" value={Math.round(hsl.s)} min={0} max={100} step={1} unit="%" onChange={(s) => setRgb(hslToRgb({ ...hsl, s }))} />
              <Slider label="Luminosità" value={Math.round(hsl.l)} min={0} max={100} step={1} unit="%" onChange={(l) => setRgb(hslToRgb({ ...hsl, l }))} />
            </>
          )}
          {format === 'hex' && <p className="muted small">Usa la scheda Visivo per scrivere il valore HEX o incolla qualsiasi formato qui sotto.</p>}
          {format === 'oklch' && (
            <>
              <Slider label="Luminosità" value={Math.round(ok.l * 100) / 100} min={0} max={1} step={0.01} onChange={(l) => setOk({ ...ok, l })} />
              <Slider label="Croma" value={Math.round(ok.c * 1000) / 1000} min={0} max={0.4} step={0.005} onChange={(c) => setOk({ ...ok, c })} />
              <Slider label="Tonalità" value={Math.round(ok.h)} min={0} max={360} step={1} unit="°" onChange={(h) => setOk({ ...ok, h })} track={hueTrack} />
              {!gamut.inGamut && (
                <p className="cp-warn" role="status">
                  Fuori gamma sRGB: sugli schermi standard diventa <strong>{hex.toUpperCase()}</strong>.
                </p>
              )}
              <code className="cp-code">{`oklch(${ok.l.toFixed(2)} ${ok.c.toFixed(2)} ${Math.round(ok.h)})`}</code>
            </>
          )}
          <label className="cp-paste">
            <span>Incolla in qualsiasi formato</span>
            <input
              value={paste}
              placeholder="#7c4deb · rgb(124 77 235) · hsl(258 80% 61%) · oklch(0.56 0.28 292)"
              spellCheck={false}
              onChange={(e) => {
                setPaste(e.target.value);
                const p = parseColor(e.target.value);
                if (p) onChange(p.hex, p.alpha < 1 ? p.alpha : alpha);
              }}
              aria-invalid={paste.length > 0 && !parsed}
            />
          </label>
          {paste && (parsed ? <StateChip kind="ok">{`${parsed.format.toUpperCase()} riconosciuto`}</StateChip> : <span className="field-error">Formato non riconosciuto</span>)}
        </div>
      )}

      {mode === 'tokens' && tokens && (
        <div className="cp-body">
          <label className="cp-search">
            <span className="visually-hidden">Cerca token</span>
            <Ic name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca token" />
          </label>
          {linked && (
            <div className="cp-linked">
              <StateChip kind="accent" icon="link">
                Collegato
              </StateChip>
              <span className="muted small">Cambia il token e si aggiorna ovunque</span>
              {onUnlink && (
                <button type="button" className="link" onClick={onUnlink}>
                  Scollega
                </button>
              )}
            </div>
          )}
          {[...groups].map(([g, list]) => (
            <div key={g} className="cp-group">
              <span className="eyebrow">{g}</span>
              {list.map((t) => (
                <button key={t.token} type="button" className="cp-token" aria-pressed={linked === t.token} onClick={() => (onChange(t.hex, alpha), onLink?.(t))}>
                  <span className="swatch-dot" style={{ background: t.hex }} />
                  <span className="cp-token-name">{t.name}</span>
                  <code>{t.token}</code>
                </button>
              ))}
            </div>
          ))}
          {groups.size === 0 && <p className="muted small">Nessun token corrisponde.</p>}
        </div>
      )}
    </div>
  );
}

/** A swatch button that opens the popover under it. */
export function ColorField({ hex, alpha = 1, onChange, label, tokens, linked, onLink, onUnlink, withAlpha, id, disabled = false }: {
  disabled?: boolean; hex: string; alpha?: number; onChange(hex: string, alpha: number): void; label: string; tokens?: readonly TokenOption[]; linked?: string | null; onLink?(t: TokenOption): void; onUnlink?(): void; withAlpha?: boolean; id?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const rgb = hexToRgb(hex);
  return (
    <div
      className="cp-wrap"
      ref={wrap}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button ref={trigger} id={id} type="button" className="cp-trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${hex.toUpperCase()}`} onClick={() => setOpen(!open)}>
        <span className="cp-trigger-sw" style={{ background: `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alpha})` }} />
      </button>
      {open && (
        <div className="cp-pop" role="dialog" aria-label={`Selettore colore · ${label}`}>
          <ColorPanel hex={hex} alpha={alpha} onChange={onChange} {...(tokens ? { tokens } : {})} {...(linked !== undefined ? { linked } : {})} {...(onLink ? { onLink } : {})} {...(onUnlink ? { onUnlink } : {})} {...(withAlpha !== undefined ? { withAlpha } : {})} />
        </div>
      )}
    </div>
  );
}
