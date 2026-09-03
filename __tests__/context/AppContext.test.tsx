import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { AppProvider, useAppContext } from '@/context/AppContext';
import type { PhotoEntry, Album } from '@/types';
import { fileStore, deletedUris, resetFileSystemMock } from '../helpers/fileSystemMock';

jest.mock('expo-file-system', () => require('../helpers/fileSystemMock').expoFileSystemMock);

type Ctx = ReturnType<typeof useAppContext>;

let ctx: Ctx | null = null;
function Probe() {
  ctx = useAppContext();
  return null;
}

async function renderProvider() {
  ctx = null;
  const utils = await render(
    <AppProvider>
      <Probe />
    </AppProvider>
  );
  await waitFor(() => expect(ctx?.isLoading).toBe(false));
  return utils;
}

function photo(overrides: Partial<PhotoEntry> = {}): PhotoEntry {
  return {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    albumId: 'a1',
    date: '2026-03-09',
    imageUri: 'file:///document/p.jpg',
    caption: '',
    capturedAt: '2026-03-09T12:00:00.000Z',
    cameraDirection: 'front',
    ...overrides,
  };
}

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 'a1',
    name: 'daily',
    createdAt: '2026-03-01T00:00:00.000Z',
    reminderEnabled: false,
    reminderTime: '08:00',
    isLocked: false,
    ...overrides,
  };
}

async function storedPhotos(): Promise<PhotoEntry[]> {
  return JSON.parse((await AsyncStorage.getItem('@rewind/photos')) ?? '[]');
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetFileSystemMock();
  jest.clearAllMocks();
});

describe('AppContext', () => {
  it('loads persisted photos/profile/settings/albums on mount', async () => {
    await AsyncStorage.multiSet([
      ['@rewind/photos', JSON.stringify([photo({ id: 'p1' })])],
      ['@rewind/profile', JSON.stringify({ name: 'Ada', avatarUri: null, joinDate: '2026-03-01' })],
      ['@rewind/settings', JSON.stringify({ mirrorSelfies: false })],
      ['@rewind/albums', JSON.stringify([album()])],
      ['@rewind/unlocked-albums', JSON.stringify(['a1'])],
    ]);
    const { unmount } = await renderProvider();
    expect(ctx!.photos).toHaveLength(1);
    expect(ctx!.profile.name).toBe('Ada');
    expect(ctx!.settings.mirrorSelfies).toBe(false);
    expect(ctx!.albums).toHaveLength(1);
    expect(ctx!.unlockedAlbumIds.has('a1')).toBe(true);
    await unmount();
  });

  it('migrates legacy photos missing albumId', async () => {
    const legacy = { ...photo(), albumId: undefined };
    await AsyncStorage.setItem('@rewind/photos', JSON.stringify([legacy]));
    const { unmount } = await renderProvider();
    expect(ctx!.photos[0].albumId).toBe('daily-selfie');
    // Migration is written back to storage
    await waitFor(async () => {
      expect((await storedPhotos())[0].albumId).toBe('daily-selfie');
    });
    await unmount();
  });

  it('addPhoto replaces the same date+album and persists', async () => {
    const { unmount } = await renderProvider();
    const first = photo({ id: 'p1', date: '2026-03-09' });
    const replacement = photo({ id: 'p2', date: '2026-03-09' });
    await act(async () => {
      ctx!.addPhoto(first);
      ctx!.addPhoto(replacement);
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(1));
    expect(ctx!.photos[0].id).toBe('p2');
    await waitFor(async () => {
      expect(await storedPhotos()).toHaveLength(1);
    });
    await unmount();
  });

  it('addPhotos dedups on album+date and reports honest counts', async () => {
    const { unmount } = await renderProvider();
    let r1: { added: number; skipped: number } = { added: -1, skipped: -1 };
    let r2: { added: number; skipped: number } = { added: -1, skipped: -1 };
    await act(async () => {
      r1 = ctx!.addPhotos([photo({ id: 'p1', date: '2026-03-08' }), photo({ id: 'p2', date: '2026-03-09' })]);
    });
    expect(r1).toEqual({ added: 2, skipped: 0 });
    await act(async () => {
      r2 = ctx!.addPhotos([photo({ id: 'p3', date: '2026-03-09' }), photo({ id: 'p4', date: '2026-03-10' })]);
    });
    expect(r2).toEqual({ added: 1, skipped: 1 });
    await waitFor(() => expect(ctx!.photos).toHaveLength(3));
    await unmount();
  });

  it('deletePhoto removes state, storage, and the local file (not remote)', async () => {
    fileStore.set('file:///document/p.jpg', 'QUJD');
    const { unmount } = await renderProvider();
    await act(async () => {
      ctx!.addPhoto(photo({ id: 'p1', date: '2026-03-09', imageUri: 'file:///document/p.jpg' }));
      ctx!.addPhoto(photo({ id: 'p2', date: '2026-03-10', imageUri: 'https://remote/x.jpg' }));
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(2));

    await act(async () => {
      ctx!.deletePhoto('p1');
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(1));
    await act(async () => {
      await new Promise((r) => setImmediate(r)); // file deletion is deferred
    });
    expect(deletedUris).toContain('file:///document/p.jpg');

    await act(async () => {
      ctx!.deletePhoto('p2');
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(0));
    await act(async () => {
      await new Promise((r) => setImmediate(r));
    });
    expect(deletedUris).not.toContain('https://remote/x.jpg');
    await unmount();
  });

  it('updatePhoto / updateProfile / updateSettings persist', async () => {
    const { unmount } = await renderProvider();
    await act(async () => {
      ctx!.addPhoto(photo({ id: 'p1', caption: 'old' }));
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(1));
    await act(async () => {
      ctx!.updatePhoto('p1', { caption: 'new' });
      ctx!.updateProfile({ name: 'Grace' });
      ctx!.updateSettings({ use24hClock: true });
    });
    await waitFor(() => expect(ctx!.photos[0].caption).toBe('new'));
    expect(ctx!.profile.name).toBe('Grace');
    expect(ctx!.settings.use24hClock).toBe(true);
    await waitFor(async () => {
      expect((await storedPhotos())[0].caption).toBe('new');
    });
    await unmount();
  });

  it('manages albums: add/update/delete with single-album guard', async () => {
    const { unmount } = await renderProvider();
    await act(async () => {
      ctx!.addAlbum(album({ id: 'a1' }));
      ctx!.addAlbum(album({ id: 'a2', name: 'two' }));
    });
    await waitFor(() => expect(ctx!.albums).toHaveLength(2));

    await act(async () => {
      ctx!.updateAlbum('a2', { name: 'TWO' });
    });
    await waitFor(() => expect(ctx!.albums.find((a) => a.id === 'a2')!.name).toBe('TWO'));

    await act(async () => {
      ctx!.addPhoto(photo({ id: 'p1', albumId: 'a2' }));
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(1));
    await act(async () => {
      ctx!.deleteAlbum('a2');
    });
    await waitFor(() => expect(ctx!.albums).toHaveLength(1));
    await waitFor(() => expect(ctx!.photos).toHaveLength(0));
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('album-reminder-a2');

    // Last album is protected
    await act(async () => {
      ctx!.deleteAlbum('a1');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(ctx!.albums).toHaveLength(1);
    await unmount();
  });

  it('unlockAlbum persists across mounts', async () => {
    const first = await renderProvider();
    await act(async () => {
      ctx!.addAlbum(album({ id: 'a1', isLocked: true }));
    });
    await waitFor(() => expect(ctx!.albums).toHaveLength(1));
    await act(async () => {
      ctx!.unlockAlbum('a1');
    });
    await waitFor(() => expect(ctx!.unlockedAlbumIds.has('a1')).toBe(true));
    await waitFor(async () => {
      expect(JSON.parse((await AsyncStorage.getItem('@rewind/unlocked-albums')) ?? '[]')).toEqual([
        'a1',
      ]);
    });
    await first.unmount();

    // Remount reads the persisted unlock
    const second = await renderProvider();
    expect(ctx!.unlockedAlbumIds.has('a1')).toBe(true);
    await second.unmount();
  });

  it('resetAllData clears state, storage, and local files', async () => {
    fileStore.set('file:///document/p.jpg', 'QUJD');
    const { unmount } = await renderProvider();
    await act(async () => {
      ctx!.addAlbum(album({ id: 'a1' }));
      ctx!.addPhoto(photo({ id: 'p1', imageUri: 'file:///document/p.jpg' }));
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(1));

    await act(async () => {
      await ctx!.resetAllData();
    });
    expect(ctx!.photos).toEqual([]);
    expect(ctx!.albums).toEqual([]);
    expect(await AsyncStorage.getItem('@rewind/photos')).toBeNull();
    expect(deletedUris).toContain('file:///document/p.jpg');
    await unmount();
  });

  it('seedMockPhotos generates a 7-day run without clobbering', async () => {
    const { unmount } = await renderProvider();
    await act(async () => {
      ctx!.seedMockPhotos('a1');
    });
    await waitFor(() => expect(ctx!.photos).toHaveLength(7));
    const dates = new Set(ctx!.photos.map((p) => p.date));
    expect(dates.size).toBe(7);
    // Seeding twice does not duplicate
    await act(async () => {
      ctx!.seedMockPhotos('a1');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(ctx!.photos).toHaveLength(7);
    await unmount();
  });
});
