import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useFaceScanBackfill, FACE_SCAN_FLUSH_EVERY } from '@/hooks/useFaceScanBackfill';
import { scanPhoto, FACE_SCAN_VERSION } from '@/utils/faceScan';
import type { FaceScan, PhotoEntry } from '@/types';

const mockUpdatePhotos = jest.fn();
jest.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ updatePhotos: mockUpdatePhotos }),
}));
jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('react-native-vision-camera-face-detector', () => ({ detectFaces: jest.fn() }));
jest.mock('@/utils/faceScan', () => ({
  ...jest.requireActual('@/utils/faceScan'),
  scanPhoto: jest.fn(),
}));

const scan = jest.mocked(scanPhoto);
const SCANNED: FaceScan = { v: FACE_SCAN_VERSION, eyes: null, width: 1024, height: 1365 };
const IDLE = { scanning: false, done: 0, total: 0 };

function makePhoto(i: number, faceScan?: FaceScan): PhotoEntry {
  const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
  return {
    id: `photo-${i}`,
    albumId: 'album-1',
    date,
    imageUri: `file:///document/${date}.jpg`,
    caption: '',
    capturedAt: `${date}T12:00:00.000Z`,
    cameraDirection: 'front',
    ...(faceScan ? { faceScan } : {}),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const scannedUris = () => scan.mock.calls.map(([uri]) => uri);

beforeEach(() => {
  jest.resetAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useFaceScanBackfill', () => {
  it('scans only photos that need it and saves in batches', async () => {
    scan.mockResolvedValue(SCANNED);
    const photos = [
      ...Array.from({ length: 25 }, (_, i) => makePhoto(i)),
      makePhoto(25, SCANNED), // current version: skipped
      makePhoto(26, { ...SCANNED, v: FACE_SCAN_VERSION - 1 }), // outdated: rescanned
    ];

    const { result } = await renderHook(() => useFaceScanBackfill(photos, true));

    await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledTimes(2));
    expect(scan).toHaveBeenCalledTimes(26);
    expect(scannedUris()).not.toContain(photos[25].imageUri);
    expect(Object.keys(mockUpdatePhotos.mock.calls[0][0])).toHaveLength(FACE_SCAN_FLUSH_EVERY);
    expect(Object.keys(mockUpdatePhotos.mock.calls[1][0])).toHaveLength(6);
    expect(mockUpdatePhotos.mock.calls[1][0][photos[26].id]).toEqual({ faceScan: SCANNED });
    await waitFor(() => expect(result.current).toEqual(IDLE));
  });

  it('reports progress while scanning', async () => {
    const first = deferred<FaceScan>();
    scan.mockReturnValueOnce(first.promise).mockResolvedValue(SCANNED);
    const photos = [makePhoto(0), makePhoto(1)];

    const { result } = await renderHook(() => useFaceScanBackfill(photos, true));
    await waitFor(() => expect(result.current).toEqual({ scanning: true, done: 0, total: 2 }));

    await act(async () => { first.resolve(SCANNED); });
    await waitFor(() => expect(result.current).toEqual(IDLE));
    expect(mockUpdatePhotos).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockUpdatePhotos.mock.calls[0][0])).toEqual([photos[0].id, photos[1].id]);
  });

  it('stops when unmounted and keeps the in-flight result', async () => {
    const first = deferred<FaceScan>();
    scan.mockReturnValueOnce(first.promise).mockResolvedValue(SCANNED);
    const photos = [makePhoto(0), makePhoto(1), makePhoto(2)];

    const { unmount } = await renderHook(() => useFaceScanBackfill(photos, true));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    await unmount();
    await act(async () => { first.resolve(SCANNED); });

    await waitFor(() =>
      expect(mockUpdatePhotos).toHaveBeenCalledWith({ [photos[0].id]: { faceScan: SCANNED } }),
    );
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('skips a failed photo for the rest of the session', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const photos = [makePhoto(0), makePhoto(1)];
    scan.mockImplementation(async (uri: string) => {
      if (uri === photos[0].imageUri) throw new Error('bad file');
      return SCANNED;
    });

    const { rerender } = await renderHook(
      (p: { photos: PhotoEntry[] }) => useFaceScanBackfill(p.photos, true),
      { initialProps: { photos } },
    );
    await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotos.mock.calls[0][0]).toEqual({ [photos[1].id]: { faceScan: SCANNED } });

    // Today's capture arrives; photo 0 is still unscanned but must not be retried.
    await rerender({ photos: [photos[0], { ...photos[1], faceScan: SCANNED }, makePhoto(2)] });
    await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledTimes(2));
    expect(scannedUris()).toEqual([photos[0].imageUri, photos[1].imageUri, makePhoto(2).imageUri]);
  });

  it('stops at once when the scanner is unavailable', async () => {
    scan.mockResolvedValue('unavailable');
    const photos = [makePhoto(0), makePhoto(1)];

    const { result } = await renderHook(() => useFaceScanBackfill(photos, true));
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    await act(async () => {});
    await waitFor(() => expect(result.current).toEqual(IDLE));
    expect(scan).toHaveBeenCalledTimes(1);
    expect(mockUpdatePhotos).not.toHaveBeenCalled();
  });

  it('does nothing while disabled, stops when toggled off, and resumes without rescanning', async () => {
    const first = deferred<FaceScan>();
    scan.mockReturnValueOnce(first.promise).mockResolvedValue(SCANNED);
    const photos = [makePhoto(0), makePhoto(1), makePhoto(2)];

    const { rerender } = await renderHook(
      (p: { enabled: boolean }) => useFaceScanBackfill(photos, p.enabled),
      { initialProps: { enabled: false } },
    );
    await act(async () => {});
    expect(scan).not.toHaveBeenCalled();

    await rerender({ enabled: true });
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    await rerender({ enabled: false }); // toggled off mid-scan
    await act(async () => { first.resolve(SCANNED); });
    await waitFor(() =>
      expect(mockUpdatePhotos).toHaveBeenCalledWith({ [photos[0].id]: { faceScan: SCANNED } }),
    );
    expect(scan).toHaveBeenCalledTimes(1);

    await rerender({ enabled: true }); // back on: only the rest
    await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledTimes(2));
    expect(scannedUris()).toEqual(photos.map((p) => p.imageUri));
  });

  it('keeps showing progress when toggled off and on mid-scan', async () => {
    // Off->on while photo 0 is in flight starts a second loop; when the first loop
    // finally exits it must not wipe the live loop's progress.
    const first = deferred<FaceScan>();
    const second = deferred<FaceScan>();
    scan.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(SCANNED);
    const photos = [makePhoto(0), makePhoto(1), makePhoto(2)];

    const { result, rerender } = await renderHook(
      (p: { enabled: boolean }) => useFaceScanBackfill(photos, p.enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    await rerender({ enabled: false });
    expect(result.current).toEqual(IDLE); // no badge while alignment is off
    await rerender({ enabled: true });
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(2)); // new loop on photo 1

    await act(async () => { first.resolve(SCANNED); }); // old loop exits
    expect(result.current.scanning).toBe(true);

    await act(async () => { second.resolve(SCANNED); });
    await waitFor(() => expect(result.current).toEqual(IDLE));
  });

  it('follows a narrowed date range mid-scan', async () => {
    const first = deferred<FaceScan>();
    scan.mockReturnValueOnce(first.promise).mockResolvedValue(SCANNED);
    const all = [makePhoto(0), makePhoto(1), makePhoto(2), makePhoto(3)];

    const { rerender } = await renderHook(
      (p: { photos: PhotoEntry[] }) => useFaceScanBackfill(p.photos, true),
      { initialProps: { photos: all } },
    );
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    await rerender({ photos: [all[0], all[3]] }); // range narrowed while photo 0 scans
    await act(async () => { first.resolve(SCANNED); });

    await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalled());
    expect(scannedUris()).toEqual([all[0].imageUri, all[3].imageUri]);
  });
});
