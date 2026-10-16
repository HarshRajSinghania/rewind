import { ImageManipulator } from 'expo-image-manipulator';
import { detectFaceMesh, isFaceMeshAvailable } from '@/modules/face-mesh';
import { scanPhoto, isFaceScanAvailable, needsFaceScan, FACE_SCAN_VERSION } from '@/utils/faceScan';
import { fileStore, deletedUris, resetFileSystemMock } from '../helpers/fileSystemMock';

jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));
jest.mock('@/modules/face-mesh', () => ({ detectFaceMesh: jest.fn(), isFaceMeshAvailable: jest.fn(() => true) }));

const SRC = 'file:///document/photo.jpg';
const TMP = 'file:///cache/ImageManipulator/upright.jpg';

function mockManipulator(size = { width: 1024, height: 2252 }) {
  const ref = { saveAsync: jest.fn(async () => ({ uri: TMP, ...size })), release: jest.fn() };
  const ctx = { resize: jest.fn(), renderAsync: jest.fn(async () => ref), release: jest.fn() };
  ctx.resize.mockReturnValue(ctx);
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(ctx as never);
  fileStore.set(TMP, 'jpeg-bytes');
  return { ctx, ref };
}

function meshAt(width: number, height: number) {
  const landmarks = new Array(478 * 3).fill(0.5);
  const set = (i: number, x: number, y: number) => landmarks.splice(i * 3, 3, x, y, 0);
  set(468, 0.6, 0.3); set(473, 0.4, 0.3);
  set(172, 0.3, 0.5); set(397, 0.7, 0.5);
  set(136, 0.35, 0.6); set(365, 0.65, 0.6);
  set(234, 0.25, 0.4); set(454, 0.75, 0.4);
  return { width, height, landmarks, blendshapes: {}, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
}

beforeEach(() => {
  resetFileSystemMock();
  jest.clearAllMocks();
  jest.mocked(isFaceMeshAvailable).mockReturnValue(true);
});

it('is version 2 and rescans older scans', () => {
  expect(FACE_SCAN_VERSION).toBe(2);
  expect(needsFaceScan({ faceScan: { v: 1, eyes: null, width: 1, height: 1 } })).toBe(true);
  expect(needsFaceScan({ faceScan: { v: 2, eyes: null, width: 1, height: 1, measure: null } })).toBe(false);
});

it('reports unavailable and does no work without the native module', async () => {
  jest.mocked(isFaceMeshAvailable).mockReturnValue(false);
  expect(isFaceScanAvailable()).toBe(false);
  await expect(scanPhoto(SRC)).resolves.toBe('unavailable');
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
});

it('measures an upright 1024px copy and deletes the copy', async () => {
  const { ctx } = mockManipulator();
  jest.mocked(detectFaceMesh).mockResolvedValue(meshAt(1024, 2252));
  const scan = await scanPhoto(SRC);
  expect(ctx.resize).toHaveBeenCalledWith({ width: 1024 });
  expect(detectFaceMesh).toHaveBeenCalledWith(TMP);
  expect(scan).toMatchObject({ v: 2, width: 1024, height: 2252, eyes: { left: { x: 0.4, y: 0.3 }, right: { x: 0.6, y: 0.3 } } });
  expect((scan as { measure: { jaw: number } }).measure.jaw).toBeCloseTo(2, 6);
  expect(deletedUris).toContain(TMP);
});

it('records a scanned photo without a face', async () => {
  mockManipulator();
  jest.mocked(detectFaceMesh).mockResolvedValue(null);
  await expect(scanPhoto(SRC)).resolves.toEqual({ v: 2, eyes: null, width: 1024, height: 2252, measure: null });
  expect(deletedUris).toContain(TMP);
});

it('deletes the copy and rethrows when detection fails', async () => {
  mockManipulator();
  jest.mocked(detectFaceMesh).mockRejectedValue(new Error('decode failed'));
  await expect(scanPhoto(SRC)).rejects.toThrow('decode failed');
  expect(deletedUris).toContain(TMP);
});

describe('native memory', () => {
  it('releases the native image once saved, even if saving fails', async () => {
    // A first-open backfill scans hundreds of photos; each unreleased ImageRef holds a
    // ~5.6MB native bitmap until GC gets around to it.
    const { ref } = mockManipulator();
    jest.mocked(detectFaceMesh).mockResolvedValue(null);
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
    jest.mocked(detectFaceMesh).mockResolvedValue(null);
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
    expect(detectFaceMesh).not.toHaveBeenCalled();
  });
});
