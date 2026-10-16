import { renderHook, waitFor } from '@testing-library/react-native';
import { usePhotoEncodeBackfill, ENCODE_FLUSH_EVERY } from '@/hooks/usePhotoEncodeBackfill';
import { encodePhoto } from '@/utils/photoEncode';
import type { PhotoEntry } from '@/types';
import { fileStore, resetFileSystemMock } from '../helpers/fileSystemMock';

const mockUpdatePhotos = jest.fn();
jest.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ updatePhotos: mockUpdatePhotos }),
}));
jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('@/utils/photoEncode', () => ({
  ...jest.requireActual('@/utils/photoEncode'),
  encodePhoto: jest.fn(),
}));

const encode = jest.mocked(encodePhoto);

function makePhoto(i: number, extra: Partial<PhotoEntry> = {}): PhotoEntry {
  const date = `2026-01-${String(i + 1).padStart(2, '0')}`;
  return { id: `p${i}`, albumId: 'a', date, imageUri: `file:///document/${date}.jpg`, caption: '', capturedAt: '', cameraDirection: 'front', ...extra };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.resetAllMocks();
  resetFileSystemMock();
  encode.mockImplementation(async (_src, name) => {
    const uri = `file:///document/${name}`;
    fileStore.set(uri, 'cTk1');
    return uri;
  });
});

it('re-encodes local photos once, deleting each original only after its new entry is saved', async () => {
  const photos = [makePhoto(0), makePhoto(1), makePhoto(2, { encoding: 'q95' }), makePhoto(3, { imageUri: 'https://example.com/x.jpg' })];
  for (const p of photos) fileStore.set(p.imageUri, 'b2xk');
  const saved = deferred<boolean>();
  mockUpdatePhotos.mockReturnValue(saved.promise);

  renderHook(() => usePhotoEncodeBackfill(photos, true));

  await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledTimes(1));
  expect(encode.mock.calls.map(([src]) => src)).toEqual([photos[0].imageUri, photos[1].imageUri]);
  expect(mockUpdatePhotos).toHaveBeenCalledWith({
    p0: { imageUri: 'file:///document/2026-01-01_q95.jpg', encoding: 'q95' },
    p1: { imageUri: 'file:///document/2026-01-02_q95.jpg', encoding: 'q95' },
  });
  // Not saved yet: the originals must still be there.
  expect(fileStore.has(photos[0].imageUri)).toBe(true);

  saved.resolve(true);
  await waitFor(() => expect(fileStore.has(photos[0].imageUri)).toBe(false));
  expect(fileStore.has(photos[1].imageUri)).toBe(false);
  expect(fileStore.has('file:///document/2026-01-01_q95.jpg')).toBe(true);
});

it('keeps both files and stops when the save fails', async () => {
  const photos = Array.from({ length: ENCODE_FLUSH_EVERY + 2 }, (_, i) => makePhoto(i));
  for (const p of photos) fileStore.set(p.imageUri, 'b2xk');
  mockUpdatePhotos.mockResolvedValue(false);

  renderHook(() => usePhotoEncodeBackfill(photos, true));

  await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(encode).toHaveBeenCalledTimes(ENCODE_FLUSH_EVERY);
  expect(photos.every((p) => fileStore.has(p.imageUri))).toBe(true);
});

it('skips a photo that fails to encode and carries on', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const photos = [makePhoto(0), makePhoto(1)];
  for (const p of photos) fileStore.set(p.imageUri, 'b2xk');
  encode.mockRejectedValueOnce(new Error('decode failed'));
  mockUpdatePhotos.mockResolvedValue(true);

  renderHook(() => usePhotoEncodeBackfill(photos, true));

  await waitFor(() => expect(mockUpdatePhotos).toHaveBeenCalledWith({ p1: { imageUri: 'file:///document/2026-01-02_q95.jpg', encoding: 'q95' } }));
  expect(fileStore.has(photos[0].imageUri)).toBe(true);
});

it('does nothing while disabled', async () => {
  renderHook(() => usePhotoEncodeBackfill([makePhoto(0)], false));
  await new Promise((r) => setTimeout(r, 20));
  expect(encode).not.toHaveBeenCalled();
});

it('stops reporting pending work once the only photo left has failed this session', async () => {
  // The album screen waits for this before face scanning; a photo that can never be
  // encoded must not hold the scan back forever.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const photos = [makePhoto(0)];
  fileStore.set(photos[0].imageUri, 'b2xk');
  let fail!: () => void;
  encode.mockImplementation(() => new Promise((_, reject) => { fail = () => reject(new Error('corrupt file')); }));
  const { result } = await renderHook(() => usePhotoEncodeBackfill(photos, true));
  expect(result.current.pending).toBe(true);
  fail();
  await waitFor(() => expect(result.current.pending).toBe(false));
});
