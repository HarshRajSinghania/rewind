import { ImageManipulator } from 'expo-image-manipulator';
import { encodePhoto, encodedName, needsEncoding, PHOTO_ENCODING } from '@/utils/photoEncode';
import { fileStore, resetFileSystemMock } from '../helpers/fileSystemMock';

jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

const TMP = 'file:///cache/ImageManipulator/out.jpg';

function mockManipulator({ renderFails = false } = {}) {
  const ref = { saveAsync: jest.fn(async () => { fileStore.set(TMP, 'cTk1'); return { uri: TMP, width: 2448, height: 3264 }; }), release: jest.fn() };
  const ctx = {
    renderAsync: jest.fn(async () => { if (renderFails) throw new Error('decode failed'); return ref; }),
    release: jest.fn(),
  };
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(ctx as never);
  return { ctx, ref };
}

beforeEach(() => {
  resetFileSystemMock();
  jest.clearAllMocks();
});

describe('encodePhoto', () => {
  it('re-encodes at q95 into Documents and frees the native images', async () => {
    const { ctx, ref } = mockManipulator();
    const uri = await encodePhoto('file:///cache/camera.jpg', 'rewind_1.jpg');
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///cache/camera.jpg');
    expect(ref.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.95 });
    expect(uri).toBe('file:///document/rewind_1.jpg');
    expect(fileStore.get(uri)).toBe('cTk1');
    expect(fileStore.has(TMP)).toBe(false);
    expect(ctx.release).toHaveBeenCalled();
    expect(ref.release).toHaveBeenCalled();
  });

  it('replaces a leftover file from an interrupted run', async () => {
    mockManipulator();
    fileStore.set('file:///document/a_q95.jpg', 'b2xk');
    await expect(encodePhoto('file:///document/a.jpg', 'a_q95.jpg')).resolves.toBe('file:///document/a_q95.jpg');
    expect(fileStore.get('file:///document/a_q95.jpg')).toBe('cTk1');
  });

  it('frees the native context when decoding fails', async () => {
    const { ctx } = mockManipulator({ renderFails: true });
    await expect(encodePhoto('file:///document/a.jpg', 'a_q95.jpg')).rejects.toThrow('decode failed');
    expect(ctx.release).toHaveBeenCalled();
  });
});

describe('encodedName', () => {
  it('names the q95 copy after the original', () => {
    expect(encodedName('file:///document/rewind_import_17_3_2025-04-23.jpg')).toBe('rewind_import_17_3_2025-04-23_q95.jpg');
    expect(PHOTO_ENCODING).toBe('q95');
  });
});

describe('needsEncoding', () => {
  const base = { id: 'p', albumId: 'a', date: '2026-01-01', caption: '', capturedAt: '', cameraDirection: 'front' as const };
  it('is true only for local photos not yet stored as q95', () => {
    expect(needsEncoding({ ...base, imageUri: 'file:///document/a.jpg' })).toBe(true);
    expect(needsEncoding({ ...base, imageUri: 'file:///document/a_q95.jpg', encoding: 'q95' })).toBe(false);
    expect(needsEncoding({ ...base, imageUri: 'https://example.com/a.jpg' })).toBe(false);
  });
});
