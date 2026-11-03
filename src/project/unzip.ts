/**
 * ZIP reader for `.jello` packages: untrusted input, read defensively.
 *
 * Two passes. The first reads the whole central directory and every local
 * header and checks them against each other (signatures, methods, names,
 * sizes, offsets, overlaps, duplicate paths) without decompressing
 * anything. The second decompresses entry by entry, streaming, and stops
 * the moment an entry produces more bytes than it declared: no entry can
 * allocate more than its declared size, and the declared sizes are bounded
 * per entry and in total before the first byte is inflated. The CRC of
 * every entry is checked.
 *
 * Supported: stored (0) and deflate (8) entries, UTF-8 names, data
 * descriptors (bit 3; the central directory sizes are authoritative).
 * Refused explicitly: ZIP64, multi-volume archives, encrypted entries.
 */

import { crc32, type ZipEntry } from '../export/zip';

export interface ZipLimits {
  entries: number;
  entryBytes: number;
  totalBytes: number;
  nameBytes: number;
}

export const ZIP_LIMITS: ZipLimits = { entries: 2000, entryBytes: 8 * 1024 * 1024, totalBytes: 64 * 1024 * 1024, nameBytes: 512 };

/** Errors meant for the user: what is wrong with the file, never a stack trace. */
export class ZipError extends Error {}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64_LOCATOR = 0x07064b50;
const FLAG_ENCRYPTED = 0x1;
const FLAG_DESCRIPTOR = 0x8;

const DAMAGED = 'Il pacchetto è danneggiato';
const names = new TextDecoder('utf-8', { fatal: true });

/** A path inside the package: relative, `/`-separated, no `.`/`..`/empty segments, no control characters. */
export function checkZipPath(path: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(path)) return 'carattere di controllo';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'percorso assoluto';
  if (path.includes('\\')) return 'separatore «\\»';
  if (path.split('/').some((s) => s === '' || s === '.' || s === '..')) return 'segmento vuoto, «.» o «..»';
  return null;
}

interface Planned {
  path: string;
  method: number;
  crc: number;
  size: number;
  start: number;
  end: number;
  header: number;
}

function findEnd(bytes: Uint8Array, v: DataView): number {
  // The end record is the last one whose comment ends exactly at the end of the file.
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === SIG_END && i + 22 + v.getUint16(i + 20, true) === bytes.length) return i;
  }
  return -1;
}

/** Pass 1: everything that can be checked without decompressing. */
function plan(bytes: Uint8Array, limits: ZipLimits): Planned[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length >= 22 ? findEnd(bytes, v) : -1;
  if (end < 0) throw new ZipError('Non è un pacchetto .jello valido (ZIP non riconosciuto).');
  const disk = v.getUint16(end + 4, true);
  const cdDisk = v.getUint16(end + 6, true);
  const onDisk = v.getUint16(end + 8, true);
  const count = v.getUint16(end + 10, true);
  const cdSize = v.getUint32(end + 12, true);
  const cdOffset = v.getUint32(end + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff || (end >= 20 && v.getUint32(end - 20, true) === SIG_END64_LOCATOR)) {
    throw new ZipError('Formato ZIP64 non supportato: crea il pacchetto con Jello Studio.');
  }
  if (disk !== 0 || cdDisk !== 0) throw new ZipError('Archivi ZIP divisi in più parti non supportati.');
  if (onDisk !== count) throw new ZipError(`${DAMAGED} (indice incoerente).`);
  if (count > limits.entries) throw new ZipError(`Il pacchetto ha troppe voci (${count}, massimo ${limits.entries}).`);
  if (cdOffset + cdSize !== end) throw new ZipError(`${DAMAGED} (posizione dell’indice).`);

  const out: Planned[] = [];
  const seen = new Set<string>();
  let declared = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || v.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError(`${DAMAGED} (indice).`);
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const header = v.getUint32(p + 42, true);
    const next = p + 46 + nameLen + extraLen + commentLen;
    if (next > end) throw new ZipError(`${DAMAGED} (indice).`);
    if (nameLen === 0 || nameLen > limits.nameBytes) throw new ZipError(`${DAMAGED} (nome di una voce non valido).`);
    const rawName = bytes.subarray(p + 46, p + 46 + nameLen);
    let path: string;
    try {
      path = names.decode(rawName);
    } catch {
      throw new ZipError('Nome di una voce non leggibile (atteso UTF-8).');
    }
    p = next;

    if (flags & FLAG_ENCRYPTED) throw new ZipError(`«${path}» è cifrata: voci cifrate non supportate.`);
    if (path.endsWith('/')) {
      if (size || csize) throw new ZipError(`${DAMAGED} (cartella «${path}» con contenuto).`);
      continue;
    }
    const bad = checkZipPath(path);
    if (bad) throw new ZipError(`Percorso non ammesso nel pacchetto: ${path} (${bad}).`);
    const key = path.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new ZipError(`Voce duplicata nel pacchetto: ${path}.`);
    seen.add(key);
    if (method !== 0 && method !== 8) throw new ZipError(`Compressione non supportata in «${path}».`);
    if (method === 0 && csize !== size) throw new ZipError(`«${path}»: dimensione incoerente.`);
    if (size > limits.entryBytes) throw new ZipError(`«${path}» è troppo grande (massimo ${Math.round(limits.entryBytes / 1024 / 1024)} MB).`);
    declared += size;
    if (declared > limits.totalBytes) throw new ZipError(`Il pacchetto decompresso è troppo grande (massimo ${Math.round(limits.totalBytes / 1024 / 1024)} MB).`);

    if (header + 30 > cdOffset || v.getUint32(header, true) !== SIG_LOCAL) throw new ZipError(`${DAMAGED} (voce «${path}»).`);
    const lFlags = v.getUint16(header + 6, true);
    const lMethod = v.getUint16(header + 8, true);
    const lNameLen = v.getUint16(header + 26, true);
    const lExtraLen = v.getUint16(header + 28, true);
    const lName = bytes.subarray(header + 30, header + 30 + lNameLen);
    if (lMethod !== method || lNameLen !== nameLen || !lName.every((b, i) => b === rawName[i])) throw new ZipError(`${DAMAGED} (voce «${path}» incoerente con l’indice).`);
    if (!(lFlags & FLAG_DESCRIPTOR) && (v.getUint32(header + 14, true) !== crc || v.getUint32(header + 18, true) !== csize || v.getUint32(header + 22, true) !== size)) {
      throw new ZipError(`«${path}»: dimensione incoerente.`);
    }
    const start = header + 30 + lNameLen + lExtraLen;
    if (start + csize > cdOffset) throw new ZipError(`${DAMAGED} (voce «${path}» fuori dai limiti).`);
    out.push({ path, method, crc, size, start, end: start + csize, header });
  }
  if (p !== end) throw new ZipError(`${DAMAGED} (indice).`);
  // Entries sharing bytes are how small archives expand into huge ones: refused.
  const sorted = [...out].sort((a, b) => a.header - b.header);
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.header < sorted[i - 1]!.end) throw new ZipError(`${DAMAGED} (voci sovrapposte).`);
  return out;
}

/** Inflates into a buffer of the declared size and stops as soon as the stream would exceed it. */
async function inflateRaw(data: Uint8Array, expected: number, path: string): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('Questo browser non sa leggere file ZIP compressi.');
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const out = new Uint8Array(expected);
  let n = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new ZipError(`«${path}» è danneggiata (dati compressi non validi).`);
    }
    if (chunk.done) break;
    if (n + chunk.value.length > expected) {
      await reader.cancel().catch(() => undefined);
      throw new ZipError(`«${path}»: la dimensione decompressa supera quella dichiarata.`);
    }
    out.set(chunk.value, n);
    n += chunk.value.length;
  }
  if (n !== expected) throw new ZipError(`«${path}»: dimensione incoerente.`);
  return out;
}

/** Reads a ZIP by its central directory, with the limits above. Throws ZipError with a readable reason. */
export async function readZip(bytes: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<ZipEntry[]> {
  const entries = plan(bytes, limits);
  const out: ZipEntry[] = [];
  for (const e of entries) {
    const raw = bytes.subarray(e.start, e.end);
    const data = e.method === 0 ? raw.slice() : await inflateRaw(raw, e.size, e.path);
    if (crc32(data) !== e.crc) throw new ZipError(`«${e.path}» è danneggiata (CRC).`);
    out.push({ path: e.path, data });
  }
  return out;
}
