/**
 * Minimal random-access ZIP reader. Reads the central directory from the end of the
 * archive, then each entry on demand — memory stays at one entry, never the whole file.
 * (JSZip needs the entire archive in memory; a year of photos is over a gigabyte.)
 *
 * Supports stored and deflated entries; rejects ZIP64 and encrypted entries.
 */
import { inflateSync, strFromU8 } from 'fflate';

export interface ByteSource {
  size: number;
  read(offset: number, length: number): Uint8Array;
}

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  // Multiply the top byte so the result stays unsigned.
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
}

export function readZipEntries(src: ByteSource): Map<string, ZipEntry> {
  const tailLength = Math.min(src.size, EOCD_MIN + MAX_COMMENT);
  const tail = src.read(src.size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - EOCD_MIN; i >= 0; i--) {
    if (u32(tail, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Invalid backup: not a zip file');

  const count = u16(tail, eocd + 10);
  const directorySize = u32(tail, eocd + 12);
  const directoryOffset = u32(tail, eocd + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('Invalid backup: ZIP64 archives are not supported');
  }

  const directory = src.read(directoryOffset, directorySize);
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (u32(directory, p) !== CENTRAL_SIG) throw new Error('Invalid backup: corrupt zip directory');
    const nameLength = u16(directory, p + 28);
    const name = strFromU8(directory.subarray(p + 46, p + 46 + nameLength));
    entries.set(name, {
      name,
      flags: u16(directory, p + 8),
      method: u16(directory, p + 10),
      compressedSize: u32(directory, p + 20),
      size: u32(directory, p + 24),
      localHeaderOffset: u32(directory, p + 42),
    });
    p += 46 + nameLength + u16(directory, p + 30) + u16(directory, p + 32);
  }
  return entries;
}

export function readZipEntry(src: ByteSource, entry: ZipEntry): Uint8Array {
  if (entry.flags & 1) throw new Error(`Invalid backup: ${entry.name} is encrypted`);
  const header = src.read(entry.localHeaderOffset, 30);
  if (u32(header, 0) !== LOCAL_SIG) throw new Error(`Invalid backup: corrupt entry ${entry.name}`);
  // Sizes come from the central directory; the local header only tells us where data starts.
  const dataStart = entry.localHeaderOffset + 30 + u16(header, 26) + u16(header, 28);
  const raw = src.read(dataStart, entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateSync(raw, { out: new Uint8Array(entry.size) });
  throw new Error(`Invalid backup: unsupported compression in ${entry.name}`);
}
