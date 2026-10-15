import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PhotoEntry, UserProfile, AppSettings, Album } from '@/types';

const KEYS = {
  PHOTOS: '@rewind/photos',
  PROFILE: '@rewind/profile',
  SETTINGS: '@rewind/settings',
  ALBUMS: '@rewind/albums',
  UNLOCKED_ALBUMS: '@rewind/unlocked-albums',
} as const;

export function getDefaultSettings(): AppSettings {
  return {
    photoQuality: 'high',
    cloudBackupEnabled: false,
    mirrorSelfies: true,
    use24hClock: false,
    alignFaces: true,
  };
}

export async function savePhotos(photos: PhotoEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.PHOTOS, JSON.stringify(photos));
}

export async function loadPhotos(): Promise<PhotoEntry[]> {
  const data = await AsyncStorage.getItem(KEYS.PHOTOS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    console.error('loadPhotos: corrupt JSON, resetting to []');
    return [];
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
}

export async function loadProfile(): Promise<UserProfile | null> {
  const data = await AsyncStorage.getItem(KEYS.PROFILE);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    console.error('loadProfile: corrupt JSON, resetting to null');
    return null;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

export async function loadSettings(): Promise<AppSettings> {
  const data = await AsyncStorage.getItem(KEYS.SETTINGS);
  if (!data) return getDefaultSettings();
  try {
    const stored = JSON.parse(data) as Partial<AppSettings>;
    return { ...getDefaultSettings(), ...stored };
  } catch {
    console.error('loadSettings: corrupt JSON, resetting to defaults');
    return getDefaultSettings();
  }
}

export async function saveAlbums(albums: Album[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.ALBUMS, JSON.stringify(albums));
}

export async function loadAlbums(): Promise<Album[] | null> {
  const data = await AsyncStorage.getItem(KEYS.ALBUMS);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    console.error('loadAlbums: corrupt JSON, resetting to null');
    return null;
  }
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.PHOTOS, KEYS.PROFILE, KEYS.SETTINGS, KEYS.ALBUMS, KEYS.UNLOCKED_ALBUMS]);
}

export async function saveUnlockedAlbumIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.UNLOCKED_ALBUMS, JSON.stringify(ids));
}

export async function loadUnlockedAlbumIds(): Promise<string[]> {
  const data = await AsyncStorage.getItem(KEYS.UNLOCKED_ALBUMS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    console.error('loadUnlockedAlbumIds: corrupt JSON, resetting to []');
    return [];
  }
}
