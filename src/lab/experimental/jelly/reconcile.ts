/**
 * Reconciliation of the experimental database with the stable one (M6.4.1).
 *
 * Why it exists. Jelly records live in `jello-lab-experimental`, the projects and components they
 * belong to in `jello-lab`; no transaction spans two databases, so deleting a project or a component
 * leaves Jelly rows behind. Deleting them "because the project list says so" is not safe: the list may
 * be stale (another tab), the read may have partly failed, or the project may come back (an import).
 *
 * So this module never deletes. It does four separate things:
 *   1. DETECT   — `scanJelly` reads both databases (the stable one FRESH, never from the Studio's cached
 *                 lists) and modifies nothing.
 *   2. CLASSIFY — every row is `valid`, `orphan`, `unverifiable`, `corrupt` or `newer`; "absent from
 *                 memory" is never enough to call a row an orphan.
 *   3. RECOVER  — an orphan with a readable document is `recoverable`: it can be exported as a JSON
 *                 bundle and is moved to a quarantine store, byte-for-byte, and put back on request.
 *   4. CLEAN    — the only cleanup is the move to quarantine, explicit and reversible. There is no
 *                 permanent deletion: with two independent databases a robust guarantee that a record
 *                 is garbage cannot be given, so keeping an orphan is always preferred to losing data.
 *
 * Rows of an unknown (newer) version and rows that cannot be read are reported and left exactly where
 * they are. Nothing here runs at startup: it runs when the user asks.
 */
import { COMPONENT_TEMPLATES } from '../../../components';
import type { JellyInventoryRow, JellyMoveResult, JellyQuarantineRow, JellyRepository } from './repository';

export type ReconcileClass = 'valid' | 'orphan' | 'unverifiable' | 'corrupt' | 'newer';

/** What exists in the STABLE database right now, as read for this scan. */
export interface LiveSnapshot {
  /** False when the read was partial or the stable store is not persistent: then NO row may be called an orphan. */
  complete: boolean;
  /** Why it is not complete. */
  reason: string | null;
  projectIds: ReadonlySet<string>;
  /** Stored components by project. */
  components: ReadonlyMap<string, ReadonlySet<string>>;
  /** Components stored without a project (from before projects): they could belong to any project. */
  unscopedComponents: ReadonlySet<string>;
  /** Template component ids (always exist, in every project). */
  templateIds: ReadonlySet<string>;
}

export interface ClassifiedRow extends JellyInventoryRow {
  class: ReconcileClass;
  /** Why, in a sentence the user can read. */
  why: string;
  /** An orphan whose document is readable: exportable and movable to quarantine. */
  recoverable: boolean;
}

export interface ReconcileReport {
  rows: ClassifiedRow[];
  counts: Record<ReconcileClass, number>;
  live: Pick<LiveSnapshot, 'complete' | 'reason'>;
  scannedAt: string;
}

/** The part of the stable repository a scan needs. Structural on purpose: the experimental code imports nothing from the stable storage. */
export interface StableReader {
  readonly persistent: boolean;
  readonly reason: string | null;
  listProjectDocs(): Promise<{ items: readonly { id: string }[]; skipped: readonly string[] }>;
  listComponents(): Promise<{ items: readonly { id: string; projectId?: string }[]; skipped: readonly string[] }>;
}

/**
 * Reads the stable database for a scan. Always asks the repository (a fresh read of IndexedDB), never the
 * Studio's in-memory lists. Any failure or skipped record makes the snapshot incomplete.
 */
export async function readLiveSnapshot(repo: StableReader): Promise<LiveSnapshot> {
  const empty = { projectIds: new Set<string>(), components: new Map<string, Set<string>>(), unscopedComponents: new Set<string>(), templateIds: new Set<string>() };
  if (!repo.persistent) return { ...empty, complete: false, reason: `Archivio stabile non persistente (${repo.reason ?? 'memoria'}): non posso sapere quali progetti esistono.` };
  try {
    const [projects, components] = await Promise.all([repo.listProjectDocs(), repo.listComponents()]);
    const projectIds = new Set(projects.items.map((p) => p.id));
    const byProject = new Map<string, Set<string>>();
    const unscoped = new Set<string>();
    for (const c of components.items) {
      if (!c.projectId) { unscoped.add(c.id); continue; }
      if (!byProject.has(c.projectId)) byProject.set(c.projectId, new Set());
      byProject.get(c.projectId)!.add(c.id);
    }
    const problems = [...projects.skipped, ...components.skipped];
    return {
      complete: problems.length === 0,
      reason: problems.length ? `Lettura parziale dell’archivio stabile (${problems.length} record non leggibili): non posso escludere che appartengano a un progetto.` : null,
      projectIds, components: byProject, unscopedComponents: unscoped, templateIds: new Set(COMPONENT_TEMPLATES.map((t) => t.id)),
    };
  } catch (e) {
    return { ...empty, complete: false, reason: `Archivio stabile non leggibile (${(e as Error).message}).` };
  }
}

/** Pure: one row against one snapshot. */
export function classifyRow(row: JellyInventoryRow, live: LiveSnapshot): ClassifiedRow {
  const done = (cls: ReconcileClass, why: string): ClassifiedRow => ({ ...row, class: cls, why, recoverable: cls === 'orphan' && row.readable === 'ok' });
  if (row.readable === 'newer') return done('newer', 'Scritto da una versione più recente: non viene toccato.');
  if (row.readable === 'corrupt') return done('corrupt', `Non leggibile (${row.detail ?? 'dati non validi'}): conservato, non toccato.`);
  if (!row.projectId) return done('corrupt', 'Record senza progetto: conservato, non toccato.');
  if (live.projectIds.has(row.projectId)) {
    if (row.store !== 'links' || !row.componentId) return done('valid', 'Il progetto esiste.');
    if (live.components.get(row.projectId)?.has(row.componentId) || live.templateIds.has(row.componentId) || live.unscopedComponents.has(row.componentId)) return done('valid', 'Il progetto e il componente esistono.');
    return live.complete
      ? done('orphan', 'Il componente di questa prova non esiste più nel progetto (eliminato o mai salvato).')
      : done('unverifiable', live.reason ?? 'Archivio stabile non completamente leggibile.');
  }
  return live.complete
    ? done('orphan', 'Il progetto non esiste più.')
    : done('unverifiable', live.reason ?? 'Archivio stabile non completamente leggibile.');
}

export function summarize(rows: readonly ClassifiedRow[]): Record<ReconcileClass, number> {
  const counts: Record<ReconcileClass, number> = { valid: 0, orphan: 0, unverifiable: 0, corrupt: 0, newer: 0 };
  for (const r of rows) counts[r.class]++;
  return counts;
}

/** Read-only scan of both databases. */
export async function scanJelly(repo: JellyRepository, loadLive: () => Promise<LiveSnapshot>, now: () => string = () => new Date().toISOString()): Promise<ReconcileReport> {
  const [inventory, live] = await Promise.all([repo.inventory(), loadLive()]);
  const rows = inventory.map((r) => classifyRow(r, live));
  return { rows, counts: summarize(rows), live: { complete: live.complete, reason: live.reason }, scannedAt: now() };
}

export const rowId = (r: Pick<JellyInventoryRow, 'store' | 'key'>) => `${r.store}/${r.key}`;

export interface QuarantineOutcome extends JellyMoveResult { considered: number }

/**
 * Moves recoverable orphans to quarantine. The classification is redone NOW, from a fresh read of both
 * databases (a scan the user looked at a minute ago proves nothing), and the move itself is conditional on
 * each row still being at the revision seen, so a row edited in between stays where it is.
 */
export async function quarantineOrphans(repo: JellyRepository, loadLive: () => Promise<LiveSnapshot>, only?: readonly string[], now: () => string = () => new Date().toISOString()): Promise<QuarantineOutcome> {
  const report = await scanJelly(repo, loadLive, now);
  const wanted = only ? new Set(only) : null;
  const picked = report.rows.filter((r) => r.class === 'orphan' && r.recoverable && (!wanted || wanted.has(rowId(r))));
  if (!picked.length) return { moved: 0, skipped: [], considered: 0 };
  const result = await repo.quarantine(picked.map((r) => ({ store: r.store, key: r.key, rev: r.rev })), 'orfano: progetto o componente non più presente', now());
  return { ...result, considered: picked.length };
}

export interface RecoveryBundle {
  format: 'jello-experimental-recovery';
  version: 1;
  exportedAt: string;
  rows: { store: string; key: string; projectId: string | null; componentId: string | null; name: string | null; reason: string; value: unknown }[];
}

/** A JSON copy of rows, for the user to keep before (or after) moving them aside. Not an import format: the quarantine is the restore path. */
export function recoveryBundle(rows: readonly (ClassifiedRow | JellyQuarantineRow)[], exportedAt = new Date().toISOString()): RecoveryBundle {
  return {
    format: 'jello-experimental-recovery', version: 1, exportedAt,
    rows: rows.map((r) => ({ store: r.store, key: r.key, projectId: r.projectId, componentId: r.componentId, name: r.name, reason: 'why' in r ? r.why : r.reason, value: r.value })),
  };
}
