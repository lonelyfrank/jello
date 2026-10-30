/**
 * One parameter control, generated from its descriptor (core/params.ts).
 * Numeric fields keep the first milestone's contract: slider + text field,
 * comma or dot, ↑/↓ by one step (Shift ×10); invalid text is reported
 * (aria-invalid) and never reaches the renderer; leaving the field restores
 * the value in use.
 */

import { useEffect, useRef, useState } from 'react';
import { parseNumberInput, type NumberDescriptor, type ParamDescriptor } from '../../core/params';
import type { Applicability } from '../applicability';
import { ColorField, useProjectTokens } from './ColorPicker';

const digits = (d: NumberDescriptor) => (d.step < 0.01 ? 3 : d.step < 0.1 ? 2 : d.step < 1 ? 1 : 0);
/** Text shown in the numeric field: no trailing zeros, step precision. */
export const formatValue = (d: NumberDescriptor, v: number) => String(Number(v.toFixed(Math.max(digits(d), 2))));
const formatRange = (d: NumberDescriptor) => `${d.min} – ${d.max}${d.unit ? ` ${d.unit}` : ''} · passo ${d.step}`.replace(/-(?=\d)/g, '−');

export interface ParamFieldProps {
  d: ParamDescriptor;
  value: number | string;
  applicability: Applicability | undefined;
  /** Support note of the running backend ("ignorato", "approssimato"). */
  support: { level: string; note: string } | undefined;
  onChange(value: number | string): void;
}

export function ParamField({ d, value, applicability: a, support, onChange }: ParamFieldProps) {
  const tokens = useProjectTokens();
  const disabled = !!a?.disabled;
  const state = a ? (a.disabled ? 'no' : 'inactive') : 'yes';
  const note = a?.note;
  const supportNote = support && support.level !== 'supported' ? `${support.level === 'ignored' ? 'Ignorato' : 'Approssimato'} da questo backend: ${support.note}` : null;
  const label = (
    <label htmlFor={`param-${d.key}`} id={`label-${d.key}`}>
      {d.label}
    </label>
  );
  const notes = (
    <>
      <p className="param-note" id={`note-${d.key}`} hidden={!note}>
        {note ?? ''}
      </p>
      {supportNote && (
        <p className="param-support" data-level={support!.level}>
          {supportNote}
        </p>
      )}
    </>
  );

  if (d.type === 'number') return <NumberField d={d} value={value as number} disabled={disabled} state={state} label={label} notes={notes} onChange={onChange} />;
  if (d.type === 'enum') {
    return (
      <div className="field param" data-param-field={d.key} data-applicable={state} data-support={support?.level}>
        <div className="field-head">{label}</div>
        <select id={`param-${d.key}`} data-param={d.key} aria-describedby={`desc-${d.key}`} value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {d.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <p className="param-desc" id={`desc-${d.key}`}>
          {d.description}
        </p>
        {notes}
      </div>
    );
  }
  return (
    <div className="field param" data-param-field={d.key} data-applicable={state} data-support={support?.level}>
      <div className="field-head">
        {label}
        <ColorField id={`param-${d.key}`} label={d.label} hex={String(value)} withAlpha={false} disabled={disabled} {...(tokens ? { tokens } : {})} onChange={(hex) => onChange(hex)} />
      </div>
      <p className="param-desc" id={`desc-${d.key}`}>
        {d.description}
      </p>
      {notes}
    </div>
  );
}

function NumberField(props: {
  d: NumberDescriptor;
  value: number;
  disabled: boolean;
  state: string;
  label: React.ReactNode;
  notes: React.ReactNode;
  onChange(v: number): void;
}) {
  const { d, value, disabled, state, label, notes, onChange } = props;
  const [text, setText] = useState(() => formatValue(d, value));
  const [invalid, setInvalid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Value this field just sent: its echo must not overwrite what the user typed ("7,5"). */
  const sent = useRef<number | null>(null);

  useEffect(() => {
    if (sent.current !== null && sent.current === value) {
      sent.current = null;
      return;
    }
    sent.current = null;
    setText(formatValue(d, value));
    setInvalid(false);
    setMessage(null);
  }, [d, value]);

  const apply = (v: number) => {
    sent.current = v;
    onChange(v);
  };

  return (
    <div className="field param" data-param-field={d.key} data-applicable={state}>
      <div className="field-head">
        {label}
        <span className="num">
          <input
            id={`num-${d.key}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className="num-input"
            aria-labelledby={`label-${d.key} unit-${d.key}`}
            aria-describedby={`desc-${d.key} err-${d.key}`}
            aria-invalid={invalid ? true : undefined}
            data-param-number={d.key}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              const t = e.target.value;
              setText(t);
              const r = parseNumberInput(d, t);
              if (!r.ok) {
                // Invalid text never reaches the renderer.
                setInvalid(true);
                setMessage(`${r.error}: non applicato.`);
                return;
              }
              setInvalid(false);
              setMessage(null);
              apply(r.value);
            }}
            onBlur={() => {
              if (!invalid) return;
              // Leaving the field with invalid text restores the value in use.
              setText(formatValue(d, value));
              setInvalid(false);
              setMessage(`Valore non valido scartato: resta ${formatValue(d, value)}${d.unit ? ` ${d.unit}` : ''}.`);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              e.preventDefault();
              const step = d.step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
              const next = Math.min(d.max, Math.max(d.min, value + step));
              const r = parseNumberInput(d, String(Math.round((next - d.min) / d.step) * d.step + d.min));
              if (r.ok) {
                setText(formatValue(d, r.value));
                setInvalid(false);
                setMessage(null);
                apply(r.value);
              }
            }}
          />
          <span className="unit" id={`unit-${d.key}`}>
            {d.unit || '·'}
          </span>
        </span>
      </div>
      <input
        id={`param-${d.key}`}
        type="range"
        min={d.min}
        max={d.max}
        step={d.step}
        data-param={d.key}
        aria-describedby={`desc-${d.key}`}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          setText(formatValue(d, v));
          setInvalid(false);
          setMessage(null);
          apply(v);
        }}
      />
      <p className="param-desc" id={`desc-${d.key}`}>{`${d.description} ${formatRange(d)}.`}</p>
      <p className="param-error" id={`err-${d.key}`} aria-live="polite" hidden={!message}>
        {message ?? ''}
      </p>
      {notes}
    </div>
  );
}
