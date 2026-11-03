/**
 * Browser side of the experimental export: fetches the built experimental runtime served next
 * to the Studio (/runtime-jelly/, see vite.config.ts), verifies it against its own manifest and
 * builds the package with the pure builder. Nothing is offered unless the whole runtime is there.
 */
import type { JellyExperimentalDocument } from '../../../model/experimental/jelly';
import { buildJellyPackage, jellyPackageZip, type JellyPackageResult, type JellyRuntimeBundle } from './package';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function fetchJellyRuntime(base = new URL('runtime-jelly/', new URL(import.meta.env.BASE_URL, location.href))): Promise<JellyRuntimeBundle> {
  const r = await fetch(new URL('manifest.json', base)).catch(() => null);
  if (!r?.ok) throw new Error('Runtime Jelly sperimentale non trovato: esegui npm run build:jelly (in sviluppo) e ricarica. Nessun pacchetto generato.');
  const m = (await r.json()) as { version: string; files: string[]; sha256?: Record<string, string> };
  const files = await Promise.all(m.files.map(async (path) => {
    const f = await fetch(new URL(path, base));
    if (!f.ok) throw new Error(`Runtime Jelly: ${path} non scaricabile (HTTP ${f.status}). Nessun pacchetto generato.`);
    const data = new Uint8Array(await f.arrayBuffer());
    const expected = m.sha256?.[path];
    if (expected && hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)) !== expected) throw new Error(`Runtime Jelly: ${path} non corrisponde al manifest. Nessun pacchetto generato.`);
    return { path, data };
  }));
  return { version: m.version, files };
}

export interface JellyExportOutcome { ok: boolean; messages: string[]; result?: JellyPackageResult; zip?: Uint8Array }

export async function exportJellyPackage(doc: JellyExperimentalDocument, now?: string): Promise<JellyExportOutcome> {
  try {
    const runtime = await fetchJellyRuntime();
    const result = await buildJellyPackage({ doc, runtime, ...(now ? { now } : {}) });
    return { ok: true, result, zip: jellyPackageZip(result), messages: [`Pacchetto sperimentale: ${result.files.length} file, runtime ${runtime.version}.`, ...result.warnings] };
  } catch (e) {
    return { ok: false, messages: [(e as Error).message] };
  }
}
