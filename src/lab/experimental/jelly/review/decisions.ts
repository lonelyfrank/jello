/**
 * Review decisions and exportable report (M6.4.3.A).
 *
 * A decision is a record the reviewer writes. Nothing here derives a status from measurements: the
 * only way to a non-pending status is `setDecisionStatus`, called from a user action, and it asks for
 * the evidence a human must give (a variant and a reason). The record is a separate, versioned
 * structure; it never touches presets, personal materials, drafts or the material schema.
 */
import { motionMetrics, type MotionMetrics } from './review-model';
import { PRESET_TITLE, REVIEW_PRESET_IDS, REVIEW_VARIANT_IDS, reviewVariant, VARIANT_INFO, type ReviewPresetId, type ReviewVariantId } from './variants';

export const DECISION_SCHEMA = 'jello-visual-review';
export const DECISION_VERSION = 1;
export const REPORT_SCHEMA = 'jello-visual-review-report';

export const DECISION_STATES = ['pending', 'candidate-accepted', 'needs-refinement', 'rejected'] as const;
export type DecisionStatus = typeof DECISION_STATES[number];
export const DECISION_LABEL: Record<DecisionStatus, string> = { pending: 'Pending', 'candidate-accepted': 'Candidate Accepted', 'needs-refinement': 'Needs Refinement', rejected: 'Rejected' };

export const NOTE_FIELDS = ['rationale', 'positives', 'issues', 'requestedChanges', 'acceptedLimitations', 'technicalNotes'] as const;
export type NoteField = typeof NOTE_FIELDS[number];
export const NOTE_LABEL: Record<NoteField, string> = {
  rationale: 'Motivazione', positives: 'Aspetti positivi', issues: 'Problemi visivi', requestedChanges: 'Correzioni richieste', acceptedLimitations: 'Limitazioni accettate', technicalNotes: 'Note tecniche',
};
export const NOTE_MAX = 2000;

export interface PresetDecision extends Record<NoteField, string> {
  presetId: ReviewPresetId;
  status: DecisionStatus;
  /** The variant the decision is about; required for Candidate Accepted. */
  variant: ReviewVariantId | null;
  /** ISO time of the last status change made by the reviewer; null while pending. */
  decidedAt: string | null;
}
export interface DecisionSet {
  schema: typeof DECISION_SCHEMA;
  version: typeof DECISION_VERSION;
  decisions: Record<ReviewPresetId, PresetDecision>;
}

export const emptyDecision = (presetId: ReviewPresetId): PresetDecision => ({
  presetId, status: 'pending', variant: null, rationale: '', positives: '', issues: '', requestedChanges: '', acceptedLimitations: '', technicalNotes: '', decidedAt: null,
});
export const emptyDecisionSet = (): DecisionSet => ({
  schema: DECISION_SCHEMA, version: DECISION_VERSION,
  decisions: Object.fromEntries(REVIEW_PRESET_IDS.map((id) => [id, emptyDecision(id)])) as Record<ReviewPresetId, PresetDecision>,
});

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Strict reader for stored or imported data: unknown shapes are rejected, never repaired. */
export function parseDecisionSet(input: unknown): Result<DecisionSet> {
  const errors: string[] = [];
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!o) return { ok: false, errors: ['Il record non è un oggetto'] };
  if (o.schema !== DECISION_SCHEMA) errors.push(`schema atteso «${DECISION_SCHEMA}»`);
  if (o.version !== DECISION_VERSION) errors.push(`versione ${String(o.version)} non supportata (attesa ${DECISION_VERSION})`);
  const raw = o.decisions && typeof o.decisions === 'object' ? (o.decisions as Record<string, unknown>) : null;
  if (!raw) errors.push('decisions mancante');
  const decisions = {} as Record<ReviewPresetId, PresetDecision>;
  for (const id of REVIEW_PRESET_IDS) {
    const d = raw?.[id] && typeof raw[id] === 'object' ? (raw[id] as Record<string, unknown>) : null;
    if (!d) { errors.push(`decisione di ${id} mancante`); continue; }
    if (d.presetId !== id) errors.push(`${id}: presetId incoerente`);
    if (!(DECISION_STATES as readonly unknown[]).includes(d.status)) errors.push(`${id}: stato non valido`);
    if (d.variant !== null && !(REVIEW_VARIANT_IDS as readonly unknown[]).includes(d.variant)) errors.push(`${id}: variante non valida`);
    for (const f of NOTE_FIELDS) if (typeof d[f] !== 'string' || (d[f] as string).length > NOTE_MAX) errors.push(`${id}: ${f} non valido`);
    if (d.decidedAt !== null && (typeof d.decidedAt !== 'string' || Number.isNaN(Date.parse(d.decidedAt)))) errors.push(`${id}: decidedAt non valido`);
    if (d.status === 'pending' && (d.decidedAt !== null)) errors.push(`${id}: una decisione pending non ha data`);
    if (d.status === 'candidate-accepted' && d.variant === null) errors.push(`${id}: Candidate Accepted richiede una variante`);
    decisions[id] = d as unknown as PresetDecision;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: { schema: DECISION_SCHEMA, version: DECISION_VERSION, decisions } };
}

/** Edits a text field or the variant under discussion; never changes the status or its date. */
export function editDecision(set: DecisionSet, presetId: ReviewPresetId, patch: Partial<Record<NoteField, string>> & { variant?: ReviewVariantId | null }): DecisionSet {
  const prev = set.decisions[presetId];
  const next: PresetDecision = { ...prev };
  for (const f of NOTE_FIELDS) { const v = patch[f]; if (typeof v === 'string') next[f] = v.slice(0, NOTE_MAX); }
  if (patch.variant !== undefined) next.variant = patch.variant;
  return { ...set, decisions: { ...set.decisions, [presetId]: next } };
}

/**
 * The only door to a non-pending status. `now` is the reviewer's moment of decision, passed in so the
 * result is deterministic. Accepting needs a variant and a reason; rejecting or asking for refinement needs a reason.
 */
export function setDecisionStatus(set: DecisionSet, presetId: ReviewPresetId, status: DecisionStatus, now: string): Result<DecisionSet> {
  const prev = set.decisions[presetId];
  const errors: string[] = [];
  if (status !== 'pending') {
    if (!prev.rationale.trim()) errors.push('Scrivi la motivazione prima di registrare la decisione.');
    if (status === 'candidate-accepted' && prev.variant === null) errors.push('Scegli la variante candidata prima di accettarla.');
  }
  if (errors.length) return { ok: false, errors };
  const next: PresetDecision = { ...prev, status, decidedAt: status === 'pending' ? null : now };
  return { ok: true, value: { ...set, decisions: { ...set.decisions, [presetId]: next } } };
}

// ------------------------------------------------------------------ report

export const DELIVERY_STATES = ['TECHNICAL REVIEW READY', 'VISUAL REVIEW PARTIAL', 'VISUAL REVIEW COMPLETE'] as const;
export type DeliveryState = typeof DELIVERY_STATES[number];
export function deliveryState(set: DecisionSet): DeliveryState {
  const decided = REVIEW_PRESET_IDS.filter((id) => set.decisions[id].status !== 'pending').length;
  return decided === 0 ? 'TECHNICAL REVIEW READY' : decided === REVIEW_PRESET_IDS.length ? 'VISUAL REVIEW COMPLETE' : 'VISUAL REVIEW PARTIAL';
}

/** What the surfaces on screen reported at export time (from the real renderer's status), if mounted. */
export interface SurfaceEvidence {
  presetId: ReviewPresetId; variant: ReviewVariantId;
  backend: 'svg' | 'css'; opaque: boolean; motion: 'static' | 'dynamic'; bubbles: number; effectiveAlpha: number; effectiveTransmission: number; treatment: 'm642' | 'm643';
}
export interface ReviewConditions {
  mode: string; gridAxis: string; viewport: { width: number; height: number }; background: string; content: string; state: string;
  normalizedTint: boolean; reducedMotion: boolean; syncInput: boolean; devicePixelRatio: number;
}
export interface ReportSource { branch: string | null; commit: string | null; note: string }
export interface ReviewReport {
  schema: typeof REPORT_SCHEMA; version: 1;
  generatedAt: string;
  deliveryState: DeliveryState;
  visuallyVerified: false;
  source: ReportSource;
  conditions: ReviewConditions;
  presets: Array<{
    presetId: ReviewPresetId; name: string; identity: string;
    decision: PresetDecision;
    variants: Array<{ id: ReviewVariantId; treatment: 'm642' | 'm643'; changedParameters: number; sameAs: ReviewVariantId | null; motion: MotionMetrics }>;
    limitations: readonly string[];
  }>;
  surfaceEvidence: SurfaceEvidence[];
  notTested: readonly string[];
  references: readonly string[];
}

export const NOT_TESTED: readonly string[] = [
  'Giudizio estetico indipendente (questo report registra solo le decisioni scritte dal reviewer).',
  'Contrasto in stato premuto/hover e su sfondi testo/strutturato (non misurato).',
  'Lettore di schermo.',
  'Safari/WebKit, telefoni e display ad alta densità fisici.',
];
export const REFERENCES: readonly string[] = [
  'docs/m643/visual-review.md', 'docs/m643/preset-experiments.md', 'docs/m643/performance.md', 'docs/m643/compatibility.md', 'docs/m643a/audit-baseline.md',
];

export interface ReportInput { set: DecisionSet; conditions: ReviewConditions; evidence: SurfaceEvidence[]; source: ReportSource; now: string }
/** Built only from the decisions given, the pure motion model and what the mounted surfaces reported: nothing is invented. */
export function buildReport({ set, conditions, evidence, source, now }: ReportInput): ReviewReport {
  return {
    schema: REPORT_SCHEMA, version: 1, generatedAt: now, deliveryState: deliveryState(set), visuallyVerified: false, source, conditions,
    presets: REVIEW_PRESET_IDS.map((presetId) => {
      const variants = REVIEW_VARIANT_IDS.map((id) => reviewVariant(presetId, id));
      return {
        presetId, name: PRESET_TITLE[presetId].full, identity: PRESET_TITLE[presetId].identity,
        decision: set.decisions[presetId],
        variants: variants.map((v) => ({ id: v.id, treatment: v.treatment, changedParameters: v.changes.length, sameAs: v.sameAs, motion: motionMetrics(v.doc.behavior) })),
        limitations: variants[0]!.limitations,
      };
    }),
    surfaceEvidence: evidence, notTested: NOT_TESTED, references: REFERENCES,
  };
}
export const reportJson = (r: ReviewReport): string => `${JSON.stringify(r, null, 2)}\n`;

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
export function reportMarkdown(r: ReviewReport): string {
  const L: string[] = [];
  L.push('# Jello Visual Review — report', '');
  L.push(`**Stato di consegna:** ${r.deliveryState} · \`visuallyVerified\` resta \`false\` (nessun preset promosso).`);
  L.push(`**Generato:** ${r.generatedAt}`);
  L.push(`**Sorgente:** branch ${r.source.branch ?? 'non disponibile'} · commit ${r.source.commit ?? 'non disponibile'} — ${r.source.note}`, '');
  const c = r.conditions;
  L.push('## Condizioni di prova', '');
  L.push(`Modalità ${c.mode}${c.mode === 'grid' ? ` (asse: ${c.gridAxis})` : ''} · ${c.viewport.width}×${c.viewport.height} px · sfondo ${c.background} · contenuto ${c.content} · stato ${c.state} · tinta normalizzata: ${c.normalizedTint ? 'sì' : 'no'} · movimento ridotto simulato: ${c.reducedMotion ? 'sì' : 'no'} · input sincronizzato: ${c.syncInput ? 'sì' : 'no'} · DPR del browser: ${c.devicePixelRatio}`, '');
  for (const p of r.presets) {
    const d = p.decision;
    L.push(`## ${p.name} (${p.identity})`, '');
    L.push(`- **Decisione:** ${DECISION_LABEL[d.status]}${d.variant ? ` · variante ${d.variant}` : ''}${d.decidedAt ? ` · ${d.decidedAt}` : ''}`);
    for (const f of NOTE_FIELDS) L.push(`- **${NOTE_LABEL[f]}:** ${d[f].trim() ? cell(d[f]) : '—'}`);
    L.push('', '| Variante | Trattamento | Parametri cambiati | Picco press | Swing rilascio | Riposo (ms) | Note |', '|---|---|---|---|---|---|---|');
    for (const v of p.variants) {
      L.push(`| ${VARIANT_INFO[v.id].label} | ${v.treatment} | ${v.changedParameters} | ${v.motion.pressPeak} | ${v.motion.releaseSwing} | ${v.motion.restMs ?? '—'} | ${v.sameAs ? `identica a ${v.sameAs}` : ''} |`);
    }
    L.push('', '**Limiti noti:**', ...p.limitations.map((l) => `- ${l}`), '');
  }
  L.push('## Superfici osservate al momento dell’export', '');
  if (r.surfaceEvidence.length) {
    L.push('| Preset | Variante | Backend | Opaco | Moto | Bolle | Alpha eff. | Trasm. eff. |', '|---|---|---|---|---|---|---|---|');
    for (const e of r.surfaceEvidence) L.push(`| ${e.presetId} | ${e.variant} | ${e.backend} | ${e.opaque ? 'sì' : 'no'} | ${e.motion} | ${e.bubbles} | ${e.effectiveAlpha} | ${e.effectiveTransmission} |`);
  } else L.push('Nessuna superficie montata (stato vuoto).');
  L.push('', '## NOT TESTED', '', ...r.notTested.map((n) => `- ${n}`), '', '## Riferimenti', '', ...r.references.map((n) => `- ${n}`), '');
  return L.join('\n');
}

// ------------------------------------------------------------------ storage (separate, versioned, per browser)

export const DECISIONS_KEY = 'jello-jelly-review-v1';
/** Reads the stored record. A corrupt or newer record is reported and left untouched. */
export function loadDecisions(storage: Pick<Storage, 'getItem'> | null): { set: DecisionSet; problem: string | null } {
  try {
    const raw = storage?.getItem(DECISIONS_KEY);
    if (!raw) return { set: emptyDecisionSet(), problem: null };
    const parsed = parseDecisionSet(JSON.parse(raw));
    return parsed.ok ? { set: parsed.value, problem: null } : { set: emptyDecisionSet(), problem: `Registro locale ignorato (non modificato): ${parsed.errors[0]}.` };
  } catch {
    return { set: emptyDecisionSet(), problem: 'Registro locale illeggibile: ignorato (non modificato).' };
  }
}
export function saveDecisions(storage: Pick<Storage, 'setItem'> | null, set: DecisionSet): boolean {
  try { storage?.setItem(DECISIONS_KEY, JSON.stringify(set)); return !!storage; } catch { return false; }
}
