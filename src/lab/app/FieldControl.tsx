/**
 * One component property control, generated from its descriptor
 * (src/components/fields.ts): range + numeric field, select, colour with
 * alpha, checkbox, text or radius. Same rules as the material fields: invalid
 * text is reported and never applied; leaving the field restores the value.
 */

import { useEffect, useState } from 'react';
import type { FieldDescriptor } from '../../components/fields';
import { ColorField, useProjectTokens } from './ColorPicker';

export const fieldId = (path: string) => `bf-${path.replace(/\./g, '-')}`;

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));
const fmt = (v: number, step: number) => String(Number(v.toFixed(decimals(step))));

export function parseNumber(text: string, min: number, max: number, step: number): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return Number((Math.round((v - min) / step) * step + min).toFixed(decimals(step)));
}

interface Props {
  f: FieldDescriptor;
  value: unknown;
  onChange(value: unknown): void;
  /** Id prefix for fields repeated per element (tab overrides, breakpoints). */
  id?: string;
  disabled?: boolean;
}

export function FieldControl({ f, value, onChange, id = fieldId(f.path), disabled = false }: Props) {
  const desc = `${id}-desc`;
  const head = (
    <label htmlFor={id} id={`${id}-label`}>
      {f.label}
    </label>
  );
  switch (f.type) {
    case 'number':
      return <NumberControl id={id} label={head} min={f.min} max={f.max} step={f.step} unit={f.unit} value={value as number} description={f.description} disabled={disabled} onChange={onChange} />;
    case 'radius': {
      const capsule = value === 'capsule';
      return (
        <div className="field param" data-field={f.path}>
          <div className="field-head">{head}</div>
          <select id={id} value={capsule ? 'capsule' : 'px'} disabled={disabled} aria-describedby={desc} onChange={(e) => onChange(e.target.value === 'capsule' ? 'capsule' : 24)}>
            <option value="capsule">Capsula (metà dell’altezza)</option>
            <option value="px">Raggio in px</option>
          </select>
          {!capsule && <NumberControl id={`${id}-px`} label={<label htmlFor={`${id}-px`}>Raggio</label>} min={f.min} max={f.max} step={1} unit="px" value={value as number} description="" disabled={disabled} onChange={onChange} />}
          <p className="param-desc" id={desc}>
            {f.description}
          </p>
        </div>
      );
    }
    case 'enum':
      return (
        <div className="field param" data-field={f.path}>
          <div className="field-head">{head}</div>
          <select id={id} value={String(value)} disabled={disabled} aria-describedby={desc} onChange={(e) => onChange(e.target.value)}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="param-desc" id={desc}>
            {f.description}
          </p>
        </div>
      );
    case 'boolean':
      return (
        <div className="field param" data-field={f.path}>
          <label className="check" htmlFor={id}>
            <input id={id} type="checkbox" checked={value === true} disabled={disabled} aria-describedby={desc} onChange={(e) => onChange(e.target.checked)} />
            <span>{f.label}</span>
          </label>
          <p className="param-desc" id={desc}>
            {f.description}
          </p>
        </div>
      );
    case 'color':
      return <ColorControl id={id} label={head} value={String(value)} description={f.description} disabled={disabled} onChange={onChange} />;
    case 'text':
      return <TextControl id={id} label={head} value={String(value)} pattern={f.pattern} maxLength={f.maxLength} description={f.description} disabled={disabled} onChange={onChange} />;
  }
}

function NumberControl(props: { id: string; label: React.ReactNode; min: number; max: number; step: number; unit: string; value: number; description: string; disabled: boolean; onChange(v: number): void }) {
  const { id, label, min, max, step, unit, value, description, disabled, onChange } = props;
  const [text, setText] = useState(fmt(value, step));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(fmt(value, step));
    setInvalid(false);
  }, [value, step]);
  return (
    <div className="field param" data-field={id}>
      <div className="field-head">
        {label}
        <span className="num">
          <input
            id={`${id}-num`}
            className="num-input"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-labelledby={`${id}-label ${id}-unit`}
            aria-invalid={invalid || undefined}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              const v = parseNumber(e.target.value, min, max, step);
              setInvalid(v === null);
              if (v !== null) onChange(v);
            }}
            onBlur={() => {
              setText(fmt(value, step));
              setInvalid(false);
            }}
          />
          <span className="unit" id={`${id}-unit`}>
            {unit || '·'}
          </span>
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-describedby={`${id}-desc`} onChange={(e) => onChange(e.target.valueAsNumber)} />
      <p className="param-desc" id={`${id}-desc`}>
        {description} {`${min} – ${max}${unit ? ` ${unit}` : ''}`.replace(/-(?=\d)/g, '−')}
      </p>
      {invalid && (
        <p className="param-error" role="status">
          Valore non valido: non applicato.
        </p>
      )}
    </div>
  );
}

function ColorControl(props: { id: string; label: React.ReactNode; value: string; description: string; disabled: boolean; onChange(v: string): void }) {
  const { id, label, value, description, disabled, onChange } = props;
  const tokens = useProjectTokens();
  const rgb = value.slice(0, 7);
  const alpha = value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1;
  const compose = (hex: string, a: number) => (a >= 0.999 ? hex : `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`);
  return (
    <div className="field param" data-field={id}>
      <div className="field-head">
        {label}
        <ColorField id={id} label={typeof label === 'string' ? label : 'Colore'} hex={rgb} alpha={alpha} disabled={disabled} {...(tokens ? { tokens } : {})} onChange={(hex, a) => onChange(compose(hex, a))} />
      </div>
      <p className="param-desc" id={`${id}-desc`}>
        {description} <code>{value}</code>
      </p>
    </div>
  );
}

export function TextControl(props: { id: string; label: React.ReactNode; value: string; pattern?: RegExp; maxLength: number; description: string; disabled?: boolean; onChange(v: string): void }) {
  const { id, label, value, pattern, maxLength, description, disabled = false, onChange } = props;
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);
  return (
    <div className="field param" data-field={id}>
      <div className="field-head">{label}</div>
      <input
        id={id}
        className="text-input"
        value={text}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-desc`}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const ok = t.trim().length > 0 && (!pattern || pattern.test(t));
          setInvalid(!ok);
          if (ok) onChange(t);
        }}
        onBlur={() => {
          setText(value);
          setInvalid(false);
        }}
      />
      <p className="param-desc" id={`${id}-desc`}>
        {description}
      </p>
      {invalid && (
        <p className="param-error" role="status">
          Testo non valido: non applicato.
        </p>
      )}
    </div>
  );
}
