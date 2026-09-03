/**
 * In-memory stand-in for expo-file-system's File/Directory/Paths.
 * Used via jest.mock('expo-file-system', () => require('./fileSystemMock').expoFileSystemMock).
 * Kept in its own module so mock factories can require it without TDZ issues.
 */

export const fileStore = new Map<string, string>();
export const deletedUris: string[] = [];

export function resetFileSystemMock(): void {
  fileStore.clear();
  deletedUris.length = 0;
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

  async base64(): Promise<string> {
    const v = fileStore.get(this.uri);
    if (v === undefined) throw new Error(`missing file: ${this.uri}`);
    return v;
  }

  write(content: string): void {
    fileStore.set(this.uri, content);
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
