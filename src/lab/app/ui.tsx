/**
 * Small UI vocabulary of the design: 24px stroke icons, state chips, switches,
 * buttons with their states, and the dialog frame used by the guided flows.
 * Every interactive element is a real button, link, input or select.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';

const P = {
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  home: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  folder: 'M4 6h6l2 2h8v11H4z',
  drop: 'M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.8-1.3-.8-2.2 0-.8.7-1.3 1.5-1.3H17a4 4 0 0 0 4-4c0-5-4-9-9-9zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21a8 8 0 0 1 16 0',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevDown: 'M6 9l6 6 6-6',
  chevRight: 'M9 6l6 6-6 6',
  chevLeft: 'M15 6l-6 6 6 6',
  x: 'M6 6l12 12M18 6L6 18',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  trash: 'M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  pencil: 'M15 4l5 5L9 20H4v-5z',
  link: 'M10 14l4-4M8.5 11.5L6 14a3.5 3.5 0 0 0 5 5l2.5-2.5M15.5 12.5L18 10a3.5 3.5 0 0 0-5-5l-2.5 2.5',
  alert: 'M12 4l9 16H3zM12 10v5M12 17.5h.01',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v5M12 8h.01',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',
  type: 'M5 6V4h14v2M12 4v16M9 20h6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  split: 'M4 5h16v14H4zM12 5v14',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  loader: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  package: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  eyedrop: 'M14 5l5 5-9 9H5v-5zM12 7l5 5',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  moon: 'M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
} as const;

export type IcName = keyof typeof P;

export function Ic({ name, size = 18 }: { name: IcName; size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={P[name]} />
    </svg>
  );
}

export type ChipKind = 'ok' | 'warn' | 'neutral' | 'accent' | 'danger' | 'local' | 'soon';

/** State label: colour plus text, never colour alone. */
export function StateChip({ kind, icon, children }: { kind: ChipKind; icon?: IcName; children: ReactNode }) {
  return (
    <span className="state-chip" data-kind={kind}>
      {icon && <Ic name={icon} size={14} />}
      {children}
    </span>
  );
}

export function Switch({ checked, onChange, label, hint, id, disabled }: { checked: boolean; onChange(v: boolean): void; label: string; hint?: string; id?: string; disabled?: boolean }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label className="switch-row" htmlFor={fid}>
      <span className="switch-text">
        <span>{label}</span>
        {hint && <span className="muted small">{hint}</span>}
      </span>
      <input id={fid} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: readonly { id: T; label: ReactNode; title?: string }[]; onChange(v: T): void; label: string; className?: string }) {
  return (
    <div className={`seg ${className ?? ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="seg-b" aria-pressed={value === o.id} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Full-width frame of a guided flow: title, numbered steps, body and footer actions. */
export function Stepper({ steps, current, done }: { steps: readonly string[]; current: number; done?: boolean }) {
  return (
    <ol className="stepper" aria-label="Passi">
      {steps.map((s, i) => {
        const state = done || i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} className="step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-n" aria-hidden="true">
              {state === 'done' ? <Ic name="check" size={14} /> : i + 1}
            </span>
            <span>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Modal frame for flows and confirmations: focus goes in, Escape closes, focus returns. */
export function Modal({ title, onClose, children, wide, label, role = 'dialog' }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; label?: string; role?: 'dialog' | 'alertdialog' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button')?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role={role} aria-modal="true" aria-labelledby={titleId} aria-label={label} ref={ref} onKeyDown={onKey}>
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IcName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic">
        <Ic name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function copyText(text: string): Promise<boolean> {
  return navigator.clipboard
    ? navigator.clipboard.writeText(text).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);
}
