import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jellyParams, parseExperimentalJelly } from '../../src/model/experimental/jelly';
import { JELLY_CANDIDATE_PRESETS } from '../../src/model/experimental/jelly-presets';
import {
  buildReport, DECISION_STATES, DECISIONS_KEY, deliveryState, editDecision, emptyDecisionSet, loadDecisions, parseDecisionSet, reportJson, reportMarkdown, saveDecisions, setDecisionStatus,
  type ReviewConditions,
} from '../../src/lab/experimental/jelly/review/decisions';
import { cellsFor, clampCustom, DEFAULT_REVIEW_VIEW, HOLD_MS, motionMetrics, phaseTime, TIMELINE_MS, viewportOf } from '../../src/lab/experimental/jelly/review/review-model';
import { SyncHub, type SyncTarget } from '../../src/lab/experimental/jelly/review/sync';
import { ManualClock, TimelineController, type TimelineTarget } from '../../src/lab/experimental/jelly/review/timeline';
import { baselineDocument, normalizeTint, REVIEW_PRESET_IDS, REVIEW_VARIANT_IDS, reviewVariant, reviewVariants } from '../../src/lab/experimental/jelly/review/variants';
import { NORMALIZED, VARIANTS, normalized } from '../fixtures/jelly-m643/variants';

const repo = resolve(__dirname, '../..');
const NOW = '2026-11-04T10:00:00.000Z';
const CONDITIONS: ReviewConditions = { mode: 'side', gridAxis: 'variants', viewport: { width: 160, height: 44 }, background: 'light', content: 'short', state: 'live', normalizedTint: false, reducedMotion: false, syncInput: true, devicePixelRatio: 1 };

describe('M6.4.3.A variants: derivation, parity and immutability', () => {
  it.each(REVIEW_PRESET_IDS.flatMap((id) => REVIEW_VARIANT_IDS.map((v) => [id, v] as const)))('%s %s equals the M6.4.3 fixture variant, document and options', (id, v) => {
    const mine = reviewVariant(id, v);
    const ref = VARIANTS[v]!(id);
    expect(mine.doc).toEqual(ref.doc);
    expect(mine.options).toEqual(ref.options ?? {});
  });
  it.each(REVIEW_PRESET_IDS)('%s tint normalisation equals the fixture normalisation', (id) => {
    expect(normalizeTint(reviewVariant(id, 'A').doc)).toEqual(normalized(VARIANTS.A!(id).doc));
    expect(NORMALIZED).toEqual({ tint: '#b8a2e8', foreground: '#211735' });
  });
  it('A is the built-in document: same values, id, name, seed, geometry, target and quality', () => {
    for (const id of REVIEW_PRESET_IDS) {
      const built = JELLY_CANDIDATE_PRESETS.find((p) => p.doc.id === id)!;
      expect(reviewVariant(id, 'A').doc).toEqual(built.doc);
      expect(reviewVariant(id, 'A').changes).toEqual([]);
    }
  });
  it('building every variant, normalised or not, and mutating the result never touches the built-ins', () => {
    const before = JSON.stringify(JELLY_CANDIDATE_PRESETS);
    for (const id of REVIEW_PRESET_IDS) {
      for (const v of reviewVariants(id)) { v.doc.material.tint = '#000000'; v.doc.bubbles.seed = 1; v.doc.name = 'X'; }
      baselineDocument(id).material.bodyOpacity = 0.01;
      normalizeTint(reviewVariant(id, 'B3').doc);
    }
    expect(JSON.stringify(JELLY_CANDIDATE_PRESETS)).toBe(before);
    expect(JELLY_CANDIDATE_PRESETS.every((p) => p.visuallyVerified === false)).toBe(true);
  });
  it('variants keep identity, seed, geometry, target and quality of A (only existing descriptors change)', () => {
    for (const id of REVIEW_PRESET_IDS) {
      const a = reviewVariant(id, 'A').doc;
      for (const v of reviewVariants(id)) {
        expect(v.doc.id).toBe(a.id);
        expect(v.doc.name).toBe(a.name);
        expect(v.doc.geometry).toEqual(a.geometry);
        expect(v.doc.target).toEqual(a.target);
        expect(v.doc.quality).toEqual(a.quality);
        // Candy B1's density is the only inclusion count that moves, and only through the existing `density` parameter.
        expect(v.doc.bubbles.seed).toBe(a.bubbles.seed);
        expect(v.approved).toBe(false);
      }
    }
  });
  it('every variant, and every normalised variant, is a valid Jello document', () => {
    for (const id of REVIEW_PRESET_IDS) for (const v of reviewVariants(id)) {
      expect(parseExperimentalJelly(v.doc).ok, `${id} ${v.id}`).toBe(true);
      expect(parseExperimentalJelly(normalizeTint(v.doc)).ok, `${id} ${v.id} normalised`).toBe(true);
    }
  });
  it('B2 changes only behaviour; B1 changes only optics; B3 is both (Candy: B2 = A and B3 = B1 by decision)', () => {
    const behaviorKeys = new Set(['responseMs', 'dampingRatio', 'maxDeformation', 'pressStrength', 'releaseImpulse']);
    for (const id of REVIEW_PRESET_IDS) {
      expect(reviewVariant(id, 'B2').changes.every((c) => behaviorKeys.has(c.key))).toBe(true);
      expect(reviewVariant(id, 'B1').changes.every((c) => !behaviorKeys.has(c.key))).toBe(true);
    }
    expect(reviewVariant('jelly-candy', 'B2').sameAs).toBe('A');
    expect(reviewVariant('jelly-candy', 'B3').sameAs).toBe('B1');
    expect(reviewVariant('jelly-soft', 'B3').sameAs).toBeNull();
    expect(reviewVariant('jelly-soft', 'B1').changes.length).toBe(12);
    expect(reviewVariant('jelly-soft', 'B2').changes.length).toBe(4);
    expect(reviewVariant('jelly-soft', 'B3').changes.length).toBe(16);
  });
  it('the treatment follows the variant: m642 for A and B2, m643 for B1 and B3', () => {
    for (const id of REVIEW_PRESET_IDS) {
      expect(['A', 'B2'].map((v) => reviewVariant(id, v as 'A').treatment)).toEqual(['m642', 'm642']);
      expect(['B1', 'B3'].map((v) => reviewVariant(id, v as 'B1').treatment)).toEqual(['m643', 'm643']);
    }
  });
  it('an unknown preset is rejected, not defaulted', () => {
    expect(() => baselineDocument('jelly-nope' as never)).toThrow(/sconosciuto/);
  });
});

describe('M6.4.3.A motion metrics come from the model oscillator and match the recorded M6.4.3 measurements', () => {
  const recorded = JSON.parse(readFileSync(join(repo, 'docs/m643/motion-metrics.json'), 'utf8')) as { rows: { variant: string; preset: string; pressPeak: number; pressT90Ms: number | null; releaseSwing: number; restMs: number | null }[] };
  it.each(recorded.rows)('$variant $preset', (row) => {
    const m = motionMetrics(reviewVariant(row.preset as 'jelly-soft', row.variant as 'A').doc.behavior);
    expect(m.pressPeak).toBeCloseTo(row.pressPeak, 4);
    expect(m.releaseSwing).toBeCloseTo(row.releaseSwing, 4);
    expect(m.pressT90Ms).toBe(row.pressT90Ms);
    expect(m.restMs).toBe(row.restMs);
  });
  it('phase instants are inside the timeline; hover, idle and disabled are states, not instants', () => {
    for (const id of REVIEW_PRESET_IDS) {
      const b = reviewVariant(id, 'A').doc.behavior;
      for (const p of ['press', 'hold', 'release', 'rebound', 'rest'] as const) { const t = phaseTime(p, b)!; expect(t).toBeGreaterThan(0); expect(t).toBeLessThanOrEqual(TIMELINE_MS); }
      for (const p of ['idle', 'hover', 'disabled'] as const) expect(phaseTime(p, b)).toBeNull();
    }
    expect(phaseTime('hold', reviewVariant('jelly-soft', 'A').doc.behavior)).toBe(HOLD_MS);
  });
});

describe('M6.4.3.A cells, viewports and custom size', () => {
  const view = (p: Partial<typeof DEFAULT_REVIEW_VIEW>) => ({ ...DEFAULT_REVIEW_VIEW, ...p });
  it('side by side: A and the variant under discussion (just A when that is A)', () => {
    expect(cellsFor(view({ mode: 'side', variantId: 'B3' })).map((c) => c.variantId)).toEqual(['A', 'B3']);
    expect(cellsFor(view({ mode: 'side', variantId: 'A' })).map((c) => c.variantId)).toEqual(['A']);
  });
  it('grid: the four variants of a preset, or the four presets under one variant; each with a distinct key', () => {
    const v = cellsFor(view({ mode: 'grid', axis: 'variants' }));
    expect(v.map((c) => c.variantId)).toEqual(['A', 'B1', 'B2', 'B3']);
    const p = cellsFor(view({ mode: 'grid', axis: 'presets', variantId: 'B1' }));
    expect(p.map((c) => c.presetId)).toEqual([...REVIEW_PRESET_IDS]);
    expect(new Set([...v, ...p].map((c) => c.key)).size).toBe(v.length + p.length - 1 /* soft:B1 appears in both */);
  });
  it('viewports and the clamped custom size', () => {
    expect(viewportOf(view({ viewportId: 'xs' }))).toMatchObject({ width: 80, height: 32 });
    expect(viewportOf(view({ viewportId: 'md' }))).toMatchObject({ width: 160, height: 44 });
    expect(viewportOf(view({ viewportId: 'lg' }))).toMatchObject({ width: 320, height: 96 });
    expect(viewportOf(view({ viewportId: 'custom', custom: { width: 5, height: 9999 } }))).toMatchObject({ width: 48, height: 160 });
    expect(clampCustom(Number.NaN, Number.NaN)).toEqual({ width: 160, height: 44 });
  });
});

describe('M6.4.3.A decisions: explicit, never automatic', () => {
  it('everything starts Pending, with no date and no variant; the delivery state is TECHNICAL REVIEW READY', () => {
    const s = emptyDecisionSet();
    expect(REVIEW_PRESET_IDS.every((id) => s.decisions[id].status === 'pending' && s.decisions[id].decidedAt === null && s.decisions[id].variant === null)).toBe(true);
    expect(deliveryState(s)).toBe('TECHNICAL REVIEW READY');
    expect(DECISION_STATES).toEqual(['pending', 'candidate-accepted', 'needs-refinement', 'rejected']);
  });
  it('editing text or the variant never changes the status', () => {
    const s = editDecision(emptyDecisionSet(), 'jelly-soft', { rationale: 'ok', variant: 'B3', issues: 'x' });
    expect(s.decisions['jelly-soft']).toMatchObject({ status: 'pending', variant: 'B3', rationale: 'ok', decidedAt: null });
  });
  it('a status needs a reason, and accepting also needs a variant', () => {
    const s0 = emptyDecisionSet();
    const noReason = setDecisionStatus(s0, 'jelly-soft', 'rejected', NOW);
    expect(noReason.ok).toBe(false);
    const withReason = editDecision(s0, 'jelly-soft', { rationale: 'troppo plastico' });
    expect(setDecisionStatus(withReason, 'jelly-soft', 'candidate-accepted', NOW).ok).toBe(false);
    const r = setDecisionStatus(withReason, 'jelly-soft', 'rejected', NOW);
    expect(r.ok && r.value.decisions['jelly-soft']).toMatchObject({ status: 'rejected', decidedAt: NOW });
    const accepted = setDecisionStatus(editDecision(withReason, 'jelly-soft', { variant: 'B1' }), 'jelly-soft', 'candidate-accepted', NOW);
    expect(accepted.ok && accepted.value.decisions['jelly-soft']).toMatchObject({ status: 'candidate-accepted', variant: 'B1', decidedAt: NOW });
  });
  it('going back to Pending clears the date; other presets are untouched; the input is never mutated', () => {
    const base = editDecision(editDecision(emptyDecisionSet(), 'jelly-clear', { rationale: 'r' }), 'jelly-dense', { rationale: 'd' });
    const frozen = JSON.stringify(base);
    const rej = setDecisionStatus(base, 'jelly-clear', 'needs-refinement', NOW);
    expect(JSON.stringify(base)).toBe(frozen);
    expect(rej.ok).toBe(true);
    if (!rej.ok) return;
    expect(rej.value.decisions['jelly-dense']).toEqual(base.decisions['jelly-dense']);
    const back = setDecisionStatus(rej.value, 'jelly-clear', 'pending', NOW);
    expect(back.ok && back.value.decisions['jelly-clear']).toMatchObject({ status: 'pending', decidedAt: null });
  });
  it('delivery state: none decided → READY, some → PARTIAL, all four → COMPLETE', () => {
    let s = emptyDecisionSet();
    const decide = (id: typeof REVIEW_PRESET_IDS[number]) => {
      const r = setDecisionStatus(editDecision(s, id, { rationale: 'r' }), id, 'needs-refinement', NOW);
      if (!r.ok) throw new Error('unexpected');
      s = r.value;
    };
    decide('jelly-soft');
    expect(deliveryState(s)).toBe('VISUAL REVIEW PARTIAL');
    decide('jelly-clear'); decide('jelly-candy'); decide('jelly-dense');
    expect(deliveryState(s)).toBe('VISUAL REVIEW COMPLETE');
  });
  it('the strict reader accepts what it wrote and rejects wrong schema, version, status, variant, dates and long text', () => {
    const ok = parseDecisionSet(JSON.parse(JSON.stringify(emptyDecisionSet())));
    expect(ok.ok).toBe(true);
    const mutate = (fn: (s: any) => void) => { const s = JSON.parse(JSON.stringify(emptyDecisionSet())); fn(s); return parseDecisionSet(s); };
    expect(mutate((s) => { s.schema = 'x'; }).ok).toBe(false);
    expect(mutate((s) => { s.version = 2; }).ok).toBe(false);
    expect(mutate((s) => { s.decisions['jelly-soft'].status = 'approved'; }).ok).toBe(false);
    expect(mutate((s) => { s.decisions['jelly-soft'].variant = 'C9'; }).ok).toBe(false);
    expect(mutate((s) => { s.decisions['jelly-soft'].status = 'candidate-accepted'; s.decisions['jelly-soft'].decidedAt = NOW; }).ok).toBe(false); // no variant
    expect(mutate((s) => { s.decisions['jelly-soft'].decidedAt = NOW; }).ok).toBe(false); // pending with a date
    expect(mutate((s) => { s.decisions['jelly-soft'].rationale = 'x'.repeat(2001); }).ok).toBe(false);
    expect(mutate((s) => { Reflect.deleteProperty(s.decisions, 'jelly-dense'); }).ok).toBe(false);
    expect(parseDecisionSet(null).ok).toBe(false);
  });
  it('docs/m643a/review-decisions.json is a valid decision set, and records no decision', () => {
    const r = parseDecisionSet(JSON.parse(readFileSync(join(repo, 'docs/m643a/review-decisions.json'), 'utf8')));
    expect(r.ok).toBe(true);
    if (r.ok) expect(deliveryState(r.value)).toBe('TECHNICAL REVIEW READY');
  });
});

describe('M6.4.3.A storage: separate, versioned, and a record we cannot read is left alone', () => {
  const store = (initial?: string) => { const m = new Map<string, string>(initial === undefined ? [] : [[DECISIONS_KEY, initial]]); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('round trips through its own key and nothing else', () => {
    const s = store();
    const decided = setDecisionStatus(editDecision(emptyDecisionSet(), 'jelly-dense', { rationale: 'r', variant: 'B3' }), 'jelly-dense', 'candidate-accepted', NOW);
    if (!decided.ok) throw new Error('unexpected');
    expect(saveDecisions(s, decided.value)).toBe(true);
    expect([...s.m.keys()]).toEqual([DECISIONS_KEY]);
    expect(loadDecisions(s)).toEqual({ set: decided.value, problem: null });
  });
  it('a corrupt or newer record yields an empty set and a message; loading never writes', () => {
    for (const raw of ['not json', JSON.stringify({ schema: 'jello-visual-review', version: 9, decisions: {} })]) {
      const s = store(raw);
      const r = loadDecisions(s);
      expect(r.problem).toMatch(/ignorato/);
      expect(r.set).toEqual(emptyDecisionSet());
      expect(s.m.get(DECISIONS_KEY)).toBe(raw);
    }
  });
  it('unavailable or throwing storage degrades without throwing', () => {
    expect(loadDecisions(null)).toEqual({ set: emptyDecisionSet(), problem: null });
    expect(saveDecisions(null, emptyDecisionSet())).toBe(false);
    expect(saveDecisions({ setItem() { throw new Error('quota'); } }, emptyDecisionSet())).toBe(false);
  });
});

describe('M6.4.3.A report: built from the data available, deterministic, nothing invented', () => {
  const empty = () => buildReport({ set: emptyDecisionSet(), conditions: CONDITIONS, evidence: [], source: { branch: null, commit: null, note: 'n' }, now: NOW });
  it('is stable, never claims visual approval and says what it cannot know', () => {
    const r = empty();
    expect(reportJson(r)).toBe(reportJson(empty()));
    expect(JSON.parse(reportJson(r))).toEqual(JSON.parse(JSON.stringify(r)));
    expect(r.visuallyVerified).toBe(false);
    expect(r.deliveryState).toBe('TECHNICAL REVIEW READY');
    expect(r.source).toEqual({ branch: null, commit: null, note: 'n' });
    expect(r.notTested.length).toBeGreaterThan(0);
    expect(r.presets.map((p) => p.presetId)).toEqual([...REVIEW_PRESET_IDS]);
    expect(r.presets.every((p) => p.variants.length === 4 && p.decision.status === 'pending')).toBe(true);
  });
  it('motion figures in the report are the model figures; Markdown carries decisions, limits, NOT TESTED and no empty evidence table', () => {
    const r = empty();
    const soft = r.presets[0]!;
    expect(soft.variants[0]!.motion).toEqual(motionMetrics(reviewVariant('jelly-soft', 'A').doc.behavior));
    const md = reportMarkdown(r);
    expect(md).toContain('TECHNICAL REVIEW READY');
    expect(md).toContain('NOT TESTED');
    expect(md).toContain('Nessuna superficie montata');
    expect(md).toContain('Pending');
    expect(md).not.toContain('| Preset | Variante | Backend');
    expect(md).toContain('identica a B1'); // Candy B3
  });
  it('a recorded decision and live evidence appear exactly as given', () => {
    const d = setDecisionStatus(editDecision(emptyDecisionSet(), 'jelly-candy', { rationale: 'lucido ma plastica | a | b', variant: 'B1', issues: 'riflesso' }), 'jelly-candy', 'needs-refinement', NOW);
    if (!d.ok) throw new Error('unexpected');
    const r = buildReport({ set: d.value, conditions: CONDITIONS, evidence: [{ presetId: 'jelly-candy', variant: 'B1', backend: 'svg', opaque: false, motion: 'dynamic', bubbles: 9, effectiveAlpha: 0.93, effectiveTransmission: 0.45, treatment: 'm643' }], source: { branch: 'b', commit: 'c', note: 'n' }, now: NOW });
    expect(r.deliveryState).toBe('VISUAL REVIEW PARTIAL');
    const md = reportMarkdown(r);
    expect(md).toContain('Needs Refinement');
    expect(md).toContain('lucido ma plastica \\| a \\| b');
    expect(md).toContain('| jelly-candy | B1 | svg | no | dynamic | 9 | 0.93 | 0.45 |');
    expect(r.presets[2]!.decision.decidedAt).toBe(NOW);
  });
});

describe('M6.4.3.A timeline: deterministic replay on a manual clock', () => {
  const fake = () => {
    const log: string[] = [];
    let x = 0, pressed = false;
    const clockRef = { c: null as ManualClock | null };
    const target: TimelineTarget = {
      press: (p) => { pressed = p; log.push(`press:${p}@${clockRef.c!.now()}`); },
      reset: () => { x = 0; pressed = false; log.push('reset'); },
      get motion() { return { x }; },
    };
    // A trivial stand-in for a surface: follows the pressed state each frame. The tests care about WHEN input and frames happen.
    const clock = new ManualClock(); clockRef.c = clock;
    const tick = () => { x += pressed ? 0.01 : -0.005; if (Math.abs(x) > 1e-9) clock.request(() => tick()); };
    const origPress = target.press;
    (target as { press: typeof target.press }).press = (p) => { origPress(p); clock.request(() => tick()); };
    return { clock, target, log };
  };
  it('seek(t) is the same as playing to t: input at 0 and a single release at 600, frames of 16 ms', () => {
    const a = fake(), b = fake();
    const ca = new TimelineController(a.clock, () => [a.target]);
    const cb = new TimelineController(b.clock, () => [b.target]);
    ca.seek(1000);
    cb.reset(); for (let i = 0; i < 100; i++) cb.step();
    expect(a.log.filter((l) => l.startsWith('press'))).toEqual(['press:true@0', `press:false@${HOLD_MS}`]);
    expect(ca.currentTime).toBe(1000);
    expect(cb.currentTime).toBe(1600);
    cb.seek(1000);
    expect(b.log.filter((l) => l.startsWith('press')).slice(-2)).toEqual(['press:true@0', `press:false@${HOLD_MS}`]);
    expect(b.target.motion!.x).toBe(a.target.motion!.x);
  });
  it('seeking backwards resets first and replays from 0 (no frame is invented)', () => {
    const a = fake();
    const c = new TimelineController(a.clock, () => [a.target]);
    c.seek(900);
    const at900 = a.target.motion!.x;
    c.seek(200);
    expect(a.log.filter((l) => l === 'reset').length).toBeGreaterThanOrEqual(2);
    expect(c.currentTime).toBe(200);
    c.seek(900);
    expect(a.target.motion!.x).toBe(at900);
  });
  it('time is clamped to the timeline; step moves one frame; peaks are tracked per target', () => {
    const a = fake();
    const c = new TimelineController(a.clock, () => [a.target]);
    c.seek(10_000);
    expect(c.currentTime).toBe(TIMELINE_MS);
    c.reset();
    c.step();
    expect(c.currentTime).toBe(16);
    expect(c.peakDisplacement[0]).toBeGreaterThan(0);
  });
  it('play uses the injected scheduler, stops at the end and leaves no pending frame behind; pause and destroy cancel', () => {
    const a = fake();
    const queue = new Map<number, (t: number) => void>();
    let id = 0, real = 0; const states: boolean[] = [];
    const c = new TimelineController(a.clock, () => [a.target], { schedule: (cb) => { queue.set(++id, cb); return id; }, unschedule: (i) => { queue.delete(i); }, onPlayingChange: (p) => states.push(p) });
    c.play();
    expect(c.playing).toBe(true);
    for (let i = 0; i < 400 && queue.size; i++) { const [k, cb] = [...queue][0]!; queue.delete(k); real += 16; cb(real); }
    expect(c.currentTime).toBe(TIMELINE_MS);
    expect(c.playing).toBe(false);
    expect(states).toEqual([true, false]);
    c.reset(); c.play(); c.pause();
    expect(queue.size).toBe(0);
    c.play(); c.destroy();
    expect(queue.size).toBe(0);
    c.play();
    expect(queue.size).toBe(0);
  });
  it('the manual clock runs queued callbacks once per advance and can be rewound', () => {
    const clock = new ManualClock();
    let calls = 0;
    clock.request(() => { calls++; clock.request(() => { calls++; }); });
    clock.advance(16);
    expect(calls).toBe(1);
    expect(clock.pending).toBe(1);
    clock.advance(32);
    expect(calls).toBe(2);
    expect(clock.pending).toBe(0);
    clock.request(() => { calls++; });
    clock.rewind(0);
    expect(clock.now()).toBe(0);
    expect(clock.pending).toBe(0);
  });
});

describe('M6.4.3.A synchronised input: semantic forwarding, no native events', () => {
  const targets = (n: number) => {
    const log: string[][] = Array.from({ length: n }, () => []);
    const mk = (i: number): SyncTarget => ({ press: (p, pt) => log[i]!.push(`press:${p}${pt ? `@${pt.x},${pt.y}` : ''}`), hover: (h) => log[i]!.push(`hover:${h}`), reset: () => log[i]!.push('reset') });
    const hub = new SyncHub();
    const unreg = [...Array(n)].map((_, i) => hub.register(`c${i}`, mk(i)));
    return { hub, log, unreg };
  };
  it('forwards press with its contact point and release to the others, never to the source', () => {
    const { hub, log } = targets(3);
    hub.press('c0', { x: 0.25, y: 0.75 });
    expect(log.map((l) => l.join())).toEqual(['', 'press:true@0.25,0.75', 'press:true@0.25,0.75']);
    hub.release('c0');
    expect(log[1]!.at(-1)).toBe('press:false');
    expect(log[0]).toEqual([]);
    expect(hub.pressing).toBe(false);
  });
  it('one gesture at a time; a release from a non-source is ignored', () => {
    const { hub, log } = targets(2);
    hub.press('c0', { x: 0.5, y: 0.5 });
    hub.press('c1', { x: 0.1, y: 0.1 });
    expect(log[0]).toEqual([]);
    hub.release('c1');
    expect(hub.sourceId).toBe('c0');
    hub.release('c0');
    expect(log[1]).toEqual(['press:true@0.5,0.5', 'press:false']);
  });
  it('cancel drops followers without a rebound (reset), and hover is mirrored', () => {
    const { hub, log } = targets(2);
    hub.press('c0', { x: 0.5, y: 0.5 });
    hub.cancel();
    expect(log[1]!.at(-1)).toBe('reset');
    hub.hover('c0', true);
    hub.hover('c0', false);
    expect(log[1]!.slice(-2)).toEqual(['hover:true', 'hover:false']);
  });
  it('disabled: nothing is forwarded; turning it off mid-gesture releases the followers', () => {
    const { hub, log } = targets(2);
    hub.enabled = false;
    hub.press('c0', { x: 0.5, y: 0.5 }); hub.hover('c0', true);
    expect(log[1]).toEqual([]);
    hub.enabled = true;
    hub.press('c0', { x: 0.5, y: 0.5 });
    hub.enabled = false;
    expect(log[1]!.at(-1)).toBe('reset');
    expect(hub.pressing).toBe(false);
  });
  it('unregistered members receive nothing, and a cancel with no gesture does not reset anyone', () => {
    const { hub, log, unreg } = targets(2);
    unreg[1]!();
    hub.press('c0', { x: 0.5, y: 0.5 });
    expect(log[1]).toEqual([]);
    hub.release('c0');
    const t2 = targets(2);
    t2.hub.cancel();
    expect(t2.log[0]).toEqual([]);
  });
});

describe('M6.4.3.A boundaries: the review stays inside the experimental lab chunk', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const src = walk(join(repo, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
  it('nothing in src/ imports from tests/ or from the m643 fixtures', () => {
    for (const f of src) expect(readFileSync(f, 'utf8'), f).not.toMatch(/from\s+['"][^'"]*(?:\/tests\/|fixtures\/jelly-m643)[^'"]*['"]/);
  });
  it('only JellyMain reaches the review modules, and only with a dynamic import', () => {
    const users = src.filter((f) => !f.includes('/jelly/review/') && /jelly\/review|\.\/review\//.test(readFileSync(f, 'utf8')));
    expect(users.map((f) => f.replace(`${repo}/`, ''))).toEqual(['src/lab/experimental/jelly/JellyMain.tsx']);
    expect(readFileSync(join(repo, 'src/lab/experimental/jelly/JellyMain.tsx'), 'utf8')).toMatch(/import\('\.\/review\/ReviewWorkspace'\)/);
  });
  it('the review never reaches the material repository, the workbench or the lab storage (it cannot write materials)', () => {
    for (const f of src.filter((x) => x.includes('/jelly/review/') && /\.(ts|tsx)$/.test(x))) {
      const imports = [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const i of imports) expect(i, f).not.toMatch(/repository|workbench|\/storage|session|\/projects|reconcile|package/);
    }
  });
  it('the production runtime and registry know nothing about the review or the treatment under evaluation', () => {
    for (const f of src.filter((x) => /src\/(runtime\/(?!experimental)|model\/(?!experimental))/.test(x))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/jelly\/review|m643/);
  });
  it('the Jello params of every variant still come from the shared descriptors (no private parameter)', () => {
    const keys = new Set(Object.keys(jellyParams(reviewVariant('jelly-soft', 'A').doc)));
    for (const id of REVIEW_PRESET_IDS) for (const v of reviewVariants(id)) for (const k of Object.keys(jellyParams(v.doc))) expect(keys.has(k)).toBe(true);
  });
});
