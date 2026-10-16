/**
 * In-memory stand-in for expo-file-system's File/Directory/Paths.
 * Used via jest.mock('expo-file-system', () => require('./fileSystemMock').expoFileSystemMock).
 * Kept in its own module so mock factories can require it without TDZ issues.
 */

/** Contents are base64 strings (the convention every test seeds with). */
export const fileStore = new Map<string, string>();
export const deletedUris: string[] = [];
/** Every handle from File#open(), with the length of each read made through it. */
export const openedHandles: { uri: string; reads: number[]; closed: boolean }[] = [];
/** URIs whose whole contents were read with File#base64(). */
export const base64Reads: string[] = [];

export function resetFileSystemMock(): void {
  fileStore.clear();
  deletedUris.length = 0;
  openedHandles.length = 0;
  base64Reads.length = 0;
}

function joinUri(parts: unknown[]): string {
  const segs = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri));
  // Join on '/' without touching the scheme's '://'
  return segs
    .map((s, i) => (i === 0 ? s.replace(/\/+$/, '') : s.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

export class MockFile {
  uri: string;

  constructor(first: unknown, ...rest: unknown[]) {
    this.uri = joinUri([first, ...rest]);
  }

  get exists(): boolean {
    return fileStore.has(this.uri);
  }

  get size(): number {
    const v = fileStore.get(this.uri);
    return v === undefined ? 0 : Buffer.from(v, 'base64').length;
  }

  async base64(): Promise<string> {
    const v = fileStore.get(this.uri);
    if (v === undefined) throw new Error(`missing file: ${this.uri}`);
    base64Reads.push(this.uri);
    return v;
  }

  write(content: string | Uint8Array): void {
    fileStore.set(this.uri, typeof content === 'string' ? content : Buffer.from(content).toString('base64'));
  }

  /** Random-access handle like expo-file-system's FileHandle (reads from `offset`). */
  open() {
    const v = fileStore.get(this.uri);
    if (v === undefined) throw new Error(`missing file: ${this.uri}`);
    const bytes = Buffer.from(v, 'base64');
    const record = { uri: this.uri, reads: [] as number[], closed: false };
    openedHandles.push(record);
    return {
      offset: 0 as number | null,
      size: bytes.length as number | null,
      readBytes(length: number): Uint8Array {
        const start = this.offset ?? 0;
        record.reads.push(length);
        this.offset = start + length;
        return new Uint8Array(bytes.subarray(start, start + length));
      },
      writeBytes(): void {
        throw new Error('read-only in tests');
      },
      close(): void {
        record.closed = true;
      },
    };
  }

  async copy(dest: MockFile): Promise<void> {
    const v = fileStore.get(this.uri);
    if (v === undefined) throw new Error(`copy failed, missing: ${this.uri}`);
    fileStore.set(dest.uri, v);
  }

  async move(dest: MockFile): Promise<void> {
    await this.copy(dest);
    this.delete();
  }

  delete(): void {
    deletedUris.push(this.uri);
    fileStore.delete(this.uri);
  }
}

export class MockDirectory {
  uri: string;

  constructor(first: unknown, ...rest: unknown[]) {
    this.uri = joinUri([first, ...rest]);
  }

  get exists(): boolean {
    return true;
  }

  create(): void {}

  delete(): void {}

  async copy(): Promise<void> {}

  async move(): Promise<void> {}

  list(): unknown[] {
    return [];
  }
}

export const MockPaths = {
  document: 'file:///document',
  cache: 'file:///cache',
};

export const expoFileSystemMock = {
  File: MockFile,
  Directory: MockDirectory,
  Paths: MockPaths,
};
