import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDefaultSettings,
  savePhotos,
  loadPhotos,
  saveProfile,
  loadProfile,
  saveSettings,
  loadSettings,
  loadAlbums,
  saveUnlockedAlbumIds,
  loadUnlockedAlbumIds,
} from '@/utils/storage';
import type { PhotoEntry } from '@/types';

const photo: PhotoEntry = {
  id: 'photo-1',
  albumId: 'album-1',
  date: '2026-03-09',
  imageUri: 'file:///photo.jpg',
  caption: 'hi',
  capturedAt: '2026-03-09T12:00:00.000Z',
  cameraDirection: 'front',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('storage', () => {
  it('round-trips photos', async () => {
    expect(await loadPhotos()).toEqual([]);
    await savePhotos([photo]);
    expect(await loadPhotos()).toEqual([photo]);
  });

  it('falls back to [] on corrupt photo JSON', async () => {
    await AsyncStorage.setItem('@rewind/photos', 'not-json{{{');
    expect(await loadPhotos()).toEqual([]);
  });

  it('round-trips profile and returns null when missing or corrupt', async () => {
    expect(await loadProfile()).toBeNull();
    const profile = { name: 'Ada', avatarUri: null, joinDate: '2026-03-01' };
    await saveProfile(profile);
    expect(await loadProfile()).toEqual(profile);
    await AsyncStorage.setItem('@rewind/profile', 'corrupt');
    expect(await loadProfile()).toBeNull();
  });

  it('merges stored settings over defaults and resets on corruption', async () => {
    expect(await loadSettings()).toEqual(getDefaultSettings());
    await saveSettings({ ...getDefaultSettings(), mirrorSelfies: false });
    const loaded = await loadSettings();
    expect(loaded.mirrorSelfies).toBe(false);
    expect(loaded.photoQuality).toBe(getDefaultSettings().photoQuality);

    // Partial stored object (e.g. from an older app version) still gets defaults
    await AsyncStorage.setItem('@rewind/settings', JSON.stringify({ mirrorSelfies: false }));
    expect(await loadSettings()).toEqual({ ...getDefaultSettings(), mirrorSelfies: false });

    await AsyncStorage.setItem('@rewind/settings', 'corrupt');
    expect(await loadSettings()).toEqual(getDefaultSettings());
  });

  it('defaults alignFaces to true, including for settings saved before the field existed', async () => {
    expect(getDefaultSettings().alignFaces).toBe(true);
    await AsyncStorage.setItem('@rewind/settings', JSON.stringify({ mirrorSelfies: false, use24hClock: true }));
    expect((await loadSettings()).alignFaces).toBe(true);
  });

  it('returns null for missing albums and survives corruption', async () => {
    expect(await loadAlbums()).toBeNull();
    await AsyncStorage.setItem('@rewind/albums', 'corrupt');
    expect(await loadAlbums()).toBeNull();
  });

  it('round-trips unlocked album ids with corrupt fallback', async () => {
    expect(await loadUnlockedAlbumIds()).toEqual([]);
    await saveUnlockedAlbumIds(['a', 'b']);
    expect(await loadUnlockedAlbumIds()).toEqual(['a', 'b']);
    await AsyncStorage.setItem('@rewind/unlocked-albums', 'corrupt');
    expect(await loadUnlockedAlbumIds()).toEqual([]);
  });
});
