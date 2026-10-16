import JSZip from 'jszip';
import { readZipEntries, readZipEntry, type ByteSource } from '@/utils/zipReader';

/** In-memory ByteSource that records every read, to prove reads stay small. */
function source(bytes: Uint8Array): ByteSource & { reads: number[] } {
  const reads: number[] = [];
  return {
    size: bytes.length,
    reads,
    read(offset, length) {
      reads.push(length);
      return bytes.slice(offset, offset + length);
    },
  };
}

function noise(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

async function zipOf(files: Record<string, { data: Uint8Array | string; deflate?: boolean }>) {
  const zip = new JSZip();
  for (const [name, { data, deflate }] of Object.entries(files)) {
    zip.file(name, data, { compression: deflate ? 'DEFLATE' : 'STORE' });
  }
  return zip.generateAsync({ type: 'uint8array' });
}

describe('zipReader', () => {
  it('lists entries and reads stored and deflated ones', async () => {
    const photo = noise(5000, 1);
    const bytes = await zipOf({
      'manifest.json': { data: JSON.stringify({ photos: [1, 2, 3] }), deflate: true },
      'images/2026-03-01.jpg': { data: photo },
    });
    const src = source(bytes);
    const entries = readZipEntries(src);

    // (JSZip also writes an "images/" folder entry; lookups are by full name.)
    expect(entries.has('images/2026-03-01.jpg')).toBe(true);
    expect(entries.has('manifest.json')).toBe(true);
    expect(Array.from(readZipEntry(src, entries.get('images/2026-03-01.jpg')!))).toEqual(Array.from(photo));
    const manifest = new TextDecoder().decode(readZipEntry(src, entries.get('manifest.json')!));
    expect(JSON.parse(manifest)).toEqual({ photos: [1, 2, 3] });
  });

  it('never reads the whole archive at once', async () => {
    // The old importer base64'd the entire backup into one JS string (1.3 GB -> crash).
    const files: Record<string, { data: Uint8Array }> = {};
    for (let i = 0; i < 4; i++) files[`images/2026-03-0${i + 1}.jpg`] = { data: noise(80_000, i + 7) };
    const bytes = await zipOf(files);
    const src = source(bytes);

    const entries = readZipEntries(src);
    for (const e of entries.values()) readZipEntry(src, e);
    expect(Math.max(...src.reads)).toBeLessThan(bytes.length / 3);
  });

  it('rejects a file that is not a zip', () => {
    expect(() => readZipEntries(source(new TextEncoder().encode('just some text, no zip here')))).toThrow(
      'not a zip',
    );
  });

  it('rejects ZIP64 archives it cannot address', async () => {
    const bytes = await zipOf({ 'manifest.json': { data: '{}' } });
    const eocd = bytes.length - 22; // no comment -> EOCD is the last 22 bytes
    bytes[eocd + 10] = 0xff; // total entries = 0xffff marks ZIP64
    bytes[eocd + 11] = 0xff;
    expect(() => readZipEntries(source(bytes))).toThrow('ZIP64');
  });
});
