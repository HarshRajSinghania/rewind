import JSZip from 'jszip';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { exportToBackup, exportToPhotoAlbum, shareFile } from '@/utils/export';
import { importFromBackup, createPhotoEntry, pickPhotosFromLibrary } from '@/utils/import';
import { getToday } from '@/utils/dates';
import type { PhotoEntry } from '@/types';
import { fileStore, deletedUris, openedHandles, base64Reads, resetFileSystemMock } from '../helpers/fileSystemMock';

jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAlbumAsync: jest.fn(async () => null),
  createAssetAsync: jest.fn(async () => ({ id: 'asset-1' })),
  createAlbumAsync: jest.fn(async () => ({ id: 'album-1' })),
  addAssetsToAlbumAsync: jest.fn(async () => {}),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true })),
}));

function makePhoto(overrides: Partial<PhotoEntry> = {}): PhotoEntry {
  return {
    id: `photo-${Math.random().toString(36).slice(2, 8)}`,
    albumId: 'album-1',
    date: '2026-03-09',
    imageUri: 'file:///a.jpg',
    caption: '',
    capturedAt: '2026-03-09T12:00:00.000Z',
    cameraDirection: 'front',
    ...overrides,
  };
}

beforeEach(() => {
  resetFileSystemMock();
  jest.clearAllMocks();
});

describe('exportToBackup', () => {
  it('zips local photos with a manifest and reports honest counts', async () => {
    fileStore.set('file:///a.jpg', 'QUJD');
    fileStore.set('file:///b.jpg', 'REVG');
    const photos = [
      makePhoto({ imageUri: 'file:///a.jpg', date: '2026-03-08' }),
      makePhoto({ imageUri: 'file:///b.jpg', date: '2026-03-09' }),
      makePhoto({ imageUri: 'https://remote/x.jpg', date: '2026-03-10' }),
    ];
    const progress: Array<[number, number]> = [];
    const res = await exportToBackup(photos, 'Daily', (c, t) => progress.push([c, t]), {
      cancelled: false,
    });

    expect(res.exported).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.filePath).toMatch(/^file:\/\/\/cache\/rewind-export\/rewind-backup-.*\.rewind$/);
    expect(progress[progress.length - 1]).toEqual([3, 3]);

    // The output is a readable zip with manifest + both images
    const zip = await JSZip.loadAsync(fileStore.get(res.filePath)!, { base64: true });
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.album).toBe('Daily');
    expect(manifest.photos).toHaveLength(2);
    expect(await zip.file('images/2026-03-08.jpg')!.async('base64')).toBe('QUJD');
  });

  it('throws when there is nothing local to export', async () => {
    await expect(
      exportToBackup([makePhoto({ imageUri: 'https://remote/x.jpg' })], 'Daily', () => {}, {
        cancelled: false,
      })
    ).rejects.toThrow('remote');
  });

  it('aborts on cancellation', async () => {
    fileStore.set('file:///a.jpg', 'QUJD');
    await expect(
      exportToBackup([makePhoto()], 'Daily', () => {}, { cancelled: true })
    ).rejects.toThrow('Cancelled');
  });
});

describe('exportToPhotoAlbum', () => {
  it('creates the Rewind album on first export and reuses it', async () => {
    fileStore.set('file:///a.jpg', 'QUJD');
    const res = await exportToPhotoAlbum([makePhoto()], () => {}, { cancelled: false });
    expect(res).toEqual({ exported: 1, skipped: 0 });
    expect(MediaLibrary.createAlbumAsync).toHaveBeenCalledWith('Rewind', expect.anything(), false);

    (MediaLibrary.getAlbumAsync as jest.Mock).mockResolvedValueOnce({ id: 'album-1' });
    await exportToPhotoAlbum([makePhoto()], () => {}, { cancelled: false });
    expect(MediaLibrary.addAssetsToAlbumAsync).toHaveBeenCalled();
  });

  it('throws on denied permission or cancellation', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    await expect(exportToPhotoAlbum([makePhoto()], () => {}, { cancelled: false })).rejects.toThrow(
      'Permission denied'
    );
    await expect(
      exportToPhotoAlbum([makePhoto()], () => {}, { cancelled: true })
    ).rejects.toThrow('Cancelled');
  });
});

describe('shareFile', () => {
  it('shares when available', async () => {
    await shareFile('file:///x.rewind');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///x.rewind');
  });
});

describe('importFromBackup', () => {
  async function seedBackupZip(manifest: unknown, images: Record<string, string>): Promise<string> {
    const zip = new JSZip();
    if (manifest !== null) zip.file('manifest.json', JSON.stringify(manifest));
    for (const [name, b64] of Object.entries(images)) {
      zip.file(name, b64, { base64: true });
    }
    const b64 = await zip.generateAsync({ type: 'base64' });
    fileStore.set('file:///cache/backup.rewind', b64);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.rewind' }],
    });
    return 'file:///cache/backup.rewind';
  }

  it('imports entries, falls back for bad dates, skips missing images', async () => {
    await seedBackupZip(
      {
        photos: [
          { id: 'p1', date: '2026-03-01', caption: 'one', imageFile: 'images/a.jpg' },
          { id: 'p2', date: 'not-a-date', caption: '', imageFile: 'images/b.jpg' },
          { id: 'p3', date: '2026-03-03', caption: '', imageFile: 'images/missing.jpg' },
        ],
      },
      { 'images/a.jpg': 'QUJD', 'images/b.jpg': 'REVG' }
    );
    const progress: Array<[number, number]> = [];
    const photos = await importFromBackup('album-1', (c, t) => progress.push([c, t]), {
      cancelled: false,
    });
    expect(photos).toHaveLength(2);
    expect(photos[0].date).toBe('2026-03-01');
    expect(photos[0].caption).toBe('one');
    expect(photos[1].date).toBe(getToday());
    expect(photos.every((p) => p.albumId === 'album-1')).toBe(true);
    // Progress counts processed entries (the missing image is skipped silently)
    expect(progress[progress.length - 1]).toEqual([2, 3]);
  });

  it('streams the backup through a file handle instead of loading it whole', async () => {
    // The old path base64'd the entire backup into one JS string; a year of photos
    // (1.3 GB) cannot survive that. Reads must stay around one photo in size.
    const photo = () => Buffer.from(Array.from({ length: 60_000 }, (_, i) => (i * 31 + 7) & 0xff)).toString('base64');
    const uri = await seedBackupZip(
      {
        photos: [1, 2, 3].map((d) => ({ id: `p${d}`, date: `2026-03-0${d}`, caption: '', imageFile: `images/${d}.jpg` })),
      },
      { 'images/1.jpg': photo(), 'images/2.jpg': photo(), 'images/3.jpg': photo() },
    );
    const backupSize = Buffer.from(fileStore.get(uri)!, 'base64').length;

    const photos = await importFromBackup('album-1');

    expect(photos).toHaveLength(3);
    expect(base64Reads).not.toContain(uri);
    const handle = openedHandles.find((h) => h.uri === uri)!;
    expect(Math.max(...handle.reads)).toBeLessThan(backupSize / 2);
    expect(handle.closed).toBe(true);
  });

  it('writes each photo byte-for-byte and removes the picked cache copy', async () => {
    const uri = await seedBackupZip(
      { photos: [{ id: 'p1', date: '2026-03-01', caption: '', imageFile: 'images/a.jpg' }] },
      { 'images/a.jpg': 'QUJD' },
    );
    const [entry] = await importFromBackup('album-1');
    expect(fileStore.get(entry.imageUri)).toBe('QUJD');
    expect(deletedUris).toContain(uri);
  });

  it('returns [] when the picker is cancelled', async () => {
    await expect(importFromBackup()).resolves.toEqual([]);
  });

  it('rejects invalid backups', async () => {
    await seedBackupZip(null, { 'images/a.jpg': 'QUJD' });
    await expect(importFromBackup()).rejects.toThrow('no manifest.json');

    await seedBackupZip({ photos: 'nope' }, {});
    await expect(importFromBackup()).rejects.toThrow('manifest.photos');
  });

  it('honors cancellation between entries', async () => {
    await seedBackupZip(
      { photos: [{ id: 'p1', date: '2026-03-01', caption: '', imageFile: 'images/a.jpg' }] },
      { 'images/a.jpg': 'QUJD' }
    );
    await expect(importFromBackup('album-1', undefined, { cancelled: true })).rejects.toThrow(
      'Cancelled'
    );
  });
});

describe('createPhotoEntry', () => {
  it('copies into Documents and builds an entry', async () => {
    fileStore.set('file:///picker/x.jpg', 'QUJD');
    const entry = await createPhotoEntry('file:///picker/x.jpg', '2026-03-09', 'cap', 'album-9');
    expect(entry.albumId).toBe('album-9');
    expect(entry.date).toBe('2026-03-09');
    expect(entry.caption).toBe('cap');
    expect(entry.imageUri).toMatch(/^file:\/\/\/document\/rewind_import_.*\.jpg$/);
    expect(fileStore.get(entry.imageUri)).toBe('QUJD');
  });

  it('throws when the copy fails', async () => {
    await expect(createPhotoEntry('file:///picker/gone.jpg', '2026-03-09')).rejects.toThrow();
  });
});

describe('pickPhotosFromLibrary', () => {
  it('returns [] when cancelled', async () => {
    await expect(pickPhotosFromLibrary()).resolves.toEqual([]);
  });

  it('parses EXIF dates and defaults to today', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', exif: { DateTimeOriginal: '2026:03:09 10:00:00' } },
        { uri: 'file:///b.jpg', exif: null },
      ],
    });
    const res = await pickPhotosFromLibrary();
    expect(res).toEqual([
      { uri: 'file:///a.jpg', date: '2026-03-09' },
      { uri: 'file:///b.jpg', date: getToday() },
    ]);
  });
});
