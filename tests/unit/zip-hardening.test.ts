/**
 * `.jello` ZIP reading against malformed and hostile archives. Archives are
 * built here byte by byte so every field can be falsified.
 */
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { crc32 } from '../../src/export/zip';
import { inspectFile } from '../../src/project/importer';
import { buildProjectPackage, packageBytes } from '../../src/project/package';
import { checkZipPath, readZip, ZIP_LIMITS, ZipError } from '../../src/project/unzip';
import { kitAssets } from '../../src/project/defaults';
import { createProject } from '../../src/project/document';

interface Spec {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  /** Falsified fields (central directory and local header unless `localOnly`). */
  size?: number;
  crc?: number;
  flags?: number;
  localName?: string;
}

const enc = new TextEncoder();
const u8 = (s: string) => enc.encode(s);

/** A ZIP with full control over each field. `mutate` edits the final bytes. */
function craft(specs: Spec[], opts: { count?: number; cdOffset?: number; overlap?: boolean; mutate?: (b: Uint8Array, v: DataView, at: { cd: number; end: number }) => void } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let firstLocal = 0;
  specs.forEach((s, i) => {
    const method = s.method ?? 0;
    const body = method === 8 ? new Uint8Array(deflateRawSync(s.data)) : s.data;
    const name = u8(s.name);
    const lname = u8(s.localName ?? s.name);
    const crc = s.crc ?? crc32(s.data);
    const size = s.size ?? s.data.length;
    const csize = body.length;
    const flags = (s.flags ?? 0) | 0x0800;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, csize, true);
    local.setUint32(22, size, true);
    local.setUint16(26, lname.length, true);
    const at = opts.overlap && i > 0 ? firstLocal : offset;
    if (i === 0) firstLocal = offset;
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, flags, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, csize, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, at, true);
    central.push(new Uint8Array(cd.buffer), name);
    if (opts.overlap && i > 0) return;
    parts.push(new Uint8Array(local.buffer), lname, body);
    offset += 30 + lname.length + body.length;
  });
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, opts.count ?? specs.length, true);
  end.setUint16(10, opts.count ?? specs.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, opts.cdOffset ?? offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  opts.mutate?.(out, new DataView(out.buffer), { cd: offset, end: offset + cdSize });
  return out;
}

const json = u8('{"ok":true}');
const fails = async (bytes: Uint8Array, re: RegExp, limits = ZIP_LIMITS) => {
  const p = readZip(bytes, limits);
  await expect(p).rejects.toBeInstanceOf(ZipError);
  await expect(p).rejects.toThrow(re);
};

/** Counts the bytes DecompressionStream actually produces. */
const Real = globalThis.DecompressionStream;
let produced = 0;
class Counting {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<BufferSource>;
  constructor(format: CompressionFormat) {
    const d = new Real(format);
    this.writable = d.writable;
    this.readable = d.readable.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(c, ctl) {
          produced += c.length;
          ctl.enqueue(c);
        },
      }),
    );
  }
}
afterEach(() => {
  globalThis.DecompressionStream = Real;
});

describe('valid archives', () => {
  it('reads a package written by the Studio, and a deflated one with a data descriptor', async () => {
    const pkg = packageBytes(buildProjectPackage(createProject({ id: 'p', name: 'P', assets: kitAssets() }), { materials: [], components: [], colors: true, icons: 'none', fonts: false }));
    expect((await readZip(pkg)).map((e) => e.path)).toContain('progetto.json');
    const big = u8('x'.repeat(50_000));
    const entries = await readZip(craft([{ name: 'materiali/a.json', data: big, method: 8, flags: 0x8 }, { name: 'dir/', data: new Uint8Array() }]));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.data).toEqual(big);
  });

  it('an empty archive has no entries, and the importer says progetto.json is missing', async () => {
    expect(await readZip(craft([]))).toEqual([]);
    const item = await inspectFile('vuoto.jello', craft([]));
    expect(item).toMatchObject({ kind: 'rejected', errors: [expect.stringMatching(/progetto\.json/)] });
  });
});

describe('hostile archives', () => {
  it('refuses a deflated entry that expands beyond its declared size, and stops inflating early', async () => {
    globalThis.DecompressionStream = Counting as unknown as typeof DecompressionStream;
    produced = 0;
    const bomb = new Uint8Array(40 * 1024 * 1024); // 40 MB of zeros, ~40 KB compressed
    await fails(craft([{ name: 'progetto.json', data: bomb, method: 8, size: 1024, crc: 0 }]), /supera quella dichiarata/);
    // Bounded by the declared size, not by what the stream could produce.
    expect(produced).toBeLessThan(2 * 1024 * 1024);
  });

  it('refuses honest sizes over the entry or total limits before inflating anything', async () => {
    globalThis.DecompressionStream = Counting as unknown as typeof DecompressionStream;
    produced = 0;
    const big = new Uint8Array(4096);
    await fails(craft([{ name: 'a.json', data: big, method: 8 }]), /troppo grande/, { ...ZIP_LIMITS, entryBytes: 1024 });
    await fails(craft([{ name: 'a.json', data: big, method: 8 }, { name: 'b.json', data: big, method: 8 }]), /decompresso è troppo grande/, { ...ZIP_LIMITS, totalBytes: 6000 });
    expect(produced).toBe(0);
  });

  it('refuses a deflated entry smaller than declared, and a wrong CRC', async () => {
    await fails(craft([{ name: 'a.json', data: json, method: 8, size: json.length + 10 }]), /incoerente/);
    await fails(craft([{ name: 'a.json', data: json, crc: 1234 }]), /CRC/);
    await fails(craft([{ name: 'a.json', data: json, method: 8, crc: 1234 }]), /CRC/);
  });

  it('refuses stored entries whose sizes disagree', async () => {
    await fails(craft([{ name: 'a.json', data: json, size: json.length + 1 }]), /incoerente/);
  });

  it('refuses duplicate paths, also after normalisation', async () => {
    await fails(craft([{ name: 'progetto.json', data: json }, { name: 'progetto.json', data: json }]), /duplicata/);
    await fails(craft([{ name: 'materiali/A.json', data: json }, { name: 'materiali/a.json', data: json }]), /duplicata/);
    await fails(craft([{ name: 'caf\u00e9.json', data: json }, { name: 'cafe\u0301.json', data: json }]), /duplicata/);
  });

  it('refuses unsafe paths', async () => {
    for (const name of ['../progetto.json', '/etc/passwd', 'a\\b.json', 'C:/x.json', 'a/./b.json', 'a//b.json', 'a/../b.json', 'nul\u0000.json']) {
      expect(checkZipPath(name), name).not.toBeNull();
      await fails(craft([{ name, data: json }]), /Percorso non ammesso/);
    }
    expect(checkZipPath('materiali/vetro-2.json')).toBeNull();
  });

  it('refuses a corrupted central directory, a misplaced index and a local header that disagrees', async () => {
    await fails(craft([{ name: 'a.json', data: json }], { mutate: (_b, v, at) => v.setUint32(at.cd, 0x12345678, true) }), /danneggiato/);
    await fails(craft([{ name: 'a.json', data: json }], { cdOffset: 3 }), /danneggiato/);
    await fails(craft([{ name: 'a.json', data: json }], { count: 2 }), /danneggiato/);
    await fails(craft([{ name: 'a.json', data: json, localName: 'b.json' }]), /incoerente con l’indice/);
    await fails(craft([{ name: 'a.json', data: json }], { mutate: (_b, v) => v.setUint32(0, 0, true) }), /danneggiato/);
    await fails(new Uint8Array([1, 2, 3, 4]), /ZIP non riconosciuto/);
  });

  it('refuses overlapping entries, encrypted entries, ZIP64 and unknown methods explicitly', async () => {
    // B's local header and data live inside A's stored data: two entries share bytes.
    const inner = craft([{ name: 'b.json', data: json }]);
    const bLocal = inner.subarray(0, 30 + 'b.json'.length + json.length);
    const nested = craft([{ name: 'a.json', data: bLocal }, { name: 'b.json', data: json }], {
      overlap: true,
      mutate: (_b, v, at) => v.setUint32(at.cd + 46 + 'a.json'.length + 42, 30 + 'a.json'.length, true),
    });
    await fails(nested, /sovrapposte/);
    await fails(craft([{ name: 'a.json', data: json, flags: 0x1 }]), /cifrat/);
    await fails(craft([{ name: 'a.json', data: json }], { mutate: (_b, v, at) => v.setUint32(at.end + 16, 0xffffffff, true) }), /ZIP64/);
    await fails(craft([{ name: 'a.json', data: json }], { mutate: (_b, v, at) => (v.setUint16(at.cd + 10, 12, true), v.setUint16(8, 12, true)) }), /Compressione non supportata/);
  });

  it('turns every refusal into a readable import message, never a stack trace', async () => {
    const item = await inspectFile('ostile.jello', craft([{ name: '../x.json', data: json }]));
    expect(item.kind).toBe('rejected');
    if (item.kind === 'rejected') {
      expect(item.errors[0]).toMatch(/^Percorso non ammesso/);
      expect(item.errors.join(' ')).not.toMatch(/at \w+ \(|Error:/);
    }
  });
});
