import { NativeModules } from 'react-native';
import { ImageManipulator } from 'expo-image-manipulator';
import { detectFaces } from 'react-native-vision-camera-face-detector';
import { scanPhoto, isFaceScanAvailable, needsFaceScan, FACE_SCAN_VERSION } from '@/utils/faceScan';
import { fileStore, deletedUris, resetFileSystemMock } from '../helpers/fileSystemMock';

jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));
jest.mock('react-native-vision-camera-face-detector', () => ({ detectFaces: jest.fn() }));

const SRC = 'file:///document/photo.jpg';
const TMP = 'file:///cache/ImageManipulator/upright.jpg';
const native = NativeModules as Record<string, unknown>;

function mockManipulator(size = { width: 1024, height: 1365 }) {
  const ref = { saveAsync: jest.fn(async () => ({ uri: TMP, ...size })), release: jest.fn() };
  const ctx = { resize: jest.fn(), renderAsync: jest.fn(async () => ref), release: jest.fn() };
  ctx.resize.mockReturnValue(ctx);
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(ctx as never);
  fileStore.set(TMP, 'jpeg-bytes');
  return { ctx, ref };
}

type Pt = { x: number; y: number };
function face(area: number, leftEye?: Pt, rightEye?: Pt) {
  return {
    bounds: { x: 0, y: 0, width: area, height: 1 },
    landmarks: leftEye && rightEye ? { LEFT_EYE: leftEye, RIGHT_EYE: rightEye } : undefined,
  };
}

beforeEach(() => {
  resetFileSystemMock();
  jest.clearAllMocks();
  native.ImageFaceDetector = { detectFaces: jest.fn() };
});

afterEach(() => {
  delete native.ImageFaceDetector;
});

describe('isFaceScanAvailable / scanPhoto without the native module', () => {
  it('reports unavailable and does no work', async () => {
    delete native.ImageFaceDetector;
    expect(isFaceScanAvailable()).toBe(false);
    await expect(scanPhoto(SRC)).resolves.toBe('unavailable');
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });
});

describe('scanPhoto', () => {
  it('scans an upright 1024px copy, keeps the largest face, and deletes the copy', async () => {
    const { ctx } = mockManipulator();
    jest.mocked(detectFaces).mockResolvedValue([
      face(10, { x: 100, y: 100 }, { x: 200, y: 100 }),
      face(500, { x: 512, y: 273 }, { x: 256, y: 273 }),
    ] as never);

    expect(isFaceScanAvailable()).toBe(true);
    const result = await scanPhoto(SRC);

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith(SRC);
    expect(ctx.resize).toHaveBeenCalledWith({ width: 1024 });
    expect(detectFaces).toHaveBeenCalledWith({
      image: TMP,
      options: { performanceMode: 'accurate', landmarkMode: 'all' },
    });
    expect(result).toEqual({
      v: FACE_SCAN_VERSION,
      eyes: { left: { x: 0.5, y: 0.2 }, right: { x: 0.25, y: 0.2 } },
      width: 1024,
      height: 1365,
    });
    expect(deletedUris).toContain(TMP);
  });

  it('records a scan with no eyes when no face is found', async () => {
    mockManipulator();
    jest.mocked(detectFaces).mockResolvedValue([]);
    await expect(scanPhoto(SRC)).resolves.toEqual({ v: FACE_SCAN_VERSION, eyes: null, width: 1024, height: 1365 });
  });

  it('treats missing eye landmarks as no face (Android omits them, iOS reports 0,0)', async () => {
    mockManipulator();
    jest.mocked(detectFaces).mockResolvedValueOnce([face(100)] as never);
    expect(((await scanPhoto(SRC)) as { eyes: unknown }).eyes).toBeNull();

    jest.mocked(detectFaces).mockResolvedValueOnce([face(100, { x: 0, y: 0 }, { x: 300, y: 200 })] as never);
    expect(((await scanPhoto(SRC)) as { eyes: unknown }).eyes).toBeNull();
  });

  it('reports unavailable if the detector resolves nothing, and still cleans up', async () => {
    mockManipulator();
    jest.mocked(detectFaces).mockResolvedValue(undefined as never);
    await expect(scanPhoto(SRC)).resolves.toBe('unavailable');
    expect(deletedUris).toContain(TMP);
  });

  it('propagates a detector error after deleting the temp copy', async () => {
    mockManipulator();
    jest.mocked(detectFaces).mockRejectedValue(new Error('boom'));
    await expect(scanPhoto(SRC)).rejects.toThrow('boom');
    expect(deletedUris).toContain(TMP);
  });

  it('releases the native image once saved, even if saving fails', async () => {
    // A first-open backfill scans hundreds of photos; each unreleased ImageRef holds a
    // ~5.6MB native bitmap until GC gets around to it.
    const { ref } = mockManipulator();
    jest.mocked(detectFaces).mockResolvedValue([]);
    await scanPhoto(SRC);
    expect(ref.release).toHaveBeenCalledTimes(1);

    ref.saveAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(scanPhoto(SRC)).rejects.toThrow('disk full');
    expect(ref.release).toHaveBeenCalledTimes(2);
  });

  it('releases the manipulator context once rendered, even if rendering fails', async () => {
    // The context keeps its own bitmap and, unlike ImageRef, reports no memory
    // pressure to the GC — unreleased, hundreds pile up during a backfill.
    const { ctx } = mockManipulator();
    jest.mocked(detectFaces).mockResolvedValue([]);
    await scanPhoto(SRC);
    expect(ctx.release).toHaveBeenCalledTimes(1);

    ctx.renderAsync.mockRejectedValueOnce(new Error('cannot render'));
    await expect(scanPhoto(SRC)).rejects.toThrow('cannot render');
    expect(ctx.release).toHaveBeenCalledTimes(2);
  });

  it('propagates a manipulator error without calling the detector', async () => {
    jest.mocked(ImageManipulator.manipulate).mockImplementation(() => {
      throw new Error('cannot decode');
    });
    await expect(scanPhoto(SRC)).rejects.toThrow('cannot decode');
    expect(detectFaces).not.toHaveBeenCalled();
  });
});

describe('needsFaceScan', () => {
  const scan = { v: FACE_SCAN_VERSION, eyes: null, width: 1, height: 1 };
  it('is true when unscanned or scanned by an older version, false otherwise', () => {
    expect(needsFaceScan({})).toBe(true);
    expect(needsFaceScan({ faceScan: { ...scan, v: FACE_SCAN_VERSION - 1 } })).toBe(true);
    expect(needsFaceScan({ faceScan: scan })).toBe(false);
  });
});
