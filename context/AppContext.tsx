import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { File } from 'expo-file-system';
import type { PhotoEntry, UserProfile, AppSettings, Album } from '@/types';
import { savePhotos, loadPhotos, saveProfile, loadProfile, saveSettings, loadSettings, getDefaultSettings, saveAlbums, loadAlbums, clearAllData, saveUnlockedAlbumIds, loadUnlockedAlbumIds } from '@/utils/storage';
import { USE_MOCK_DATA, MOCK_PHOTOS, MOCK_PROFILE, MOCK_SETTINGS } from '@/constants/mockData';
import { cancelAlbumReminder, cancelAllReminders } from '@/utils/notifications';
import { haptics } from '@/utils/haptics';

function fireAndSave(saveFn: () => Promise<void>): Promise<boolean> {
  return enqueueSave(saveFn);
}

let saveQueue = Promise.resolve();

// Serial so writes can't race; the catch keeps the queue alive after a failure and
// surfaces it (log + haptic) instead of leaving an unhandled rejection. Resolves with
// whether this write reached storage.
function enqueueSave(saveFn: () => Promise<void>): Promise<boolean> {
  const done = saveQueue.then(saveFn).then(
    () => true,
    (e) => {
      console.error('Storage write failed:', e);
      haptics.error();
      return false;
    },
  );
  saveQueue = done.then(() => undefined);
  return done;
}

const DEFAULT_ALBUMS: Album[] = [];

interface AppContextValue {
  photos: PhotoEntry[];
  profile: UserProfile;
  settings: AppSettings;
  albums: Album[];
  isLoading: boolean;
  addPhoto: (entry: PhotoEntry) => void;
  addPhotos: (entries: PhotoEntry[]) => { added: number; skipped: number };
  updatePhoto: (id: string, updates: Partial<PhotoEntry>) => void;
  /** Resolves with whether the patch reached storage (e.g. before deleting a replaced file). */
  updatePhotos: (patches: Record<string, Partial<PhotoEntry>>) => Promise<boolean>;
  deletePhoto: (id: string) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  addAlbum: (album: Album) => void;
  updateAlbum: (id: string, updates: Partial<Album>) => void;
  deleteAlbum: (id: string) => void;
  resetAllData: () => Promise<void>;
  seedMockPhotos: (albumId?: string) => void;
  unlockedAlbumIds: Set<string>;
  unlockAlbum: (id: string) => void;
  lockAlbum: (id: string) => void;
  isAlbumUnlocked: (id: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const defaultProfile: UserProfile = {
  name: '',
  avatarUri: null,
  joinDate: new Date().toISOString().split('T')[0],
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [albums, setAlbums] = useState<Album[]>(DEFAULT_ALBUMS);
  const [isLoading, setIsLoading] = useState(true);
  const [unlockedAlbumIds, setUnlockedAlbumIds] = useState<Set<string>>(new Set());
  const didLoad = useRef(false);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    (async () => {
      if (USE_MOCK_DATA) {
        setPhotos(MOCK_PHOTOS);
        setProfile(MOCK_PROFILE);
        setSettings(MOCK_SETTINGS);
        setIsLoading(false);
        return;
      }
      const [loadedPhotos, loadedProfile, loadedSettings, loadedAlbums, loadedUnlocked] = await Promise.all([
        loadPhotos(),
        loadProfile(),
        loadSettings(),
        loadAlbums(),
        loadUnlockedAlbumIds(),
      ]);
      // One-time migration: photos saved before albums existed have no albumId.
      // Assign them to the default album so they stay visible.
      const migrated = loadedPhotos.map(p => p.albumId ? p : { ...p, albumId: 'daily-selfie' });
      const needsMigration = migrated.some((p, i) => p.albumId !== loadedPhotos[i].albumId);
      setPhotos(migrated);
      if (needsMigration) fireAndSave(() => savePhotos(migrated));
      if (loadedProfile) setProfile(loadedProfile);
      setSettings(loadedSettings);
      setAlbums(loadedAlbums);
      setUnlockedAlbumIds(new Set(loadedUnlocked));
      setIsLoading(false);
    })();
  }, []);

  const addPhoto = useCallback((entry: PhotoEntry) => {
    setPhotos(prev => {
      const next = [entry, ...prev];
      fireAndSave(() => savePhotos(next));
      return next;
    });
  }, []);

  const addPhotos = useCallback((entries: PhotoEntry[]): { added: number; skipped: number } => {
    let added = 0;
    let skipped = 0;
    setPhotos(prev => {
      const existing = new Set(prev.map(p => `${p.albumId}:${p.date}`));
      const unique = entries.filter(e => {
        const key = `${e.albumId}:${e.date}`;
        if (existing.has(key)) { skipped++; return false; }
        existing.add(key);
        added++;
        return true;
      });
      if (unique.length === 0) return prev;
      const next = [...unique, ...prev];
      fireAndSave(() => savePhotos(next));
      return next;
    });
    return { added, skipped };
  }, []);

  const updatePhoto = useCallback((id: string, updates: Partial<PhotoEntry>) => {
    setPhotos(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      fireAndSave(() => savePhotos(next));
      return next;
    });
  }, []);

  const updatePhotos = useCallback((patches: Record<string, Partial<PhotoEntry>>): Promise<boolean> => {
    let next: PhotoEntry[] = [];
    setPhotos(prev => {
      next = prev.map(p => patches[p.id] ? { ...p, ...patches[p.id] } : p);
      return next;
    });
    return fireAndSave(() => savePhotos(next));
  }, []);

  const deletePhoto = useCallback((id: string) => {
    setPhotos(prev => {
      const target = prev.find(p => p.id === id);
      const next = prev.filter(p => p.id !== id);
      fireAndSave(() => savePhotos(next));
      if (target?.imageUri?.startsWith('file://')) {
        setImmediate(() => { try { new File(target.imageUri).delete(); } catch {} });
      }
      return next;
    });
  }, []);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      fireAndSave(() => saveProfile(next));
      return next;
    });
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      fireAndSave(() => saveSettings(next));
      return next;
    });
  }, []);

  const addAlbum = useCallback((album: Album) => {
    setAlbums(prev => {
      const next = [...prev, album];
      fireAndSave(() => saveAlbums(next));
      return next;
    });
  }, []);

  const updateAlbum = useCallback((id: string, updates: Partial<Album>) => {
    setAlbums(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      fireAndSave(() => saveAlbums(next));
      return next;
    });
  }, []);

  const deleteAlbum = useCallback((id: string) => {
    if (albums.length <= 1) return;
    setAlbums(prev => {
      const next = prev.filter(a => a.id !== id);
      fireAndSave(() => saveAlbums(next));
      return next;
    });
    cancelAlbumReminder(id);
    setPhotos(prev => {
      const toDelete = prev.filter(p => p.albumId === id);
      const next = prev.filter(p => p.albumId !== id);
      fireAndSave(() => savePhotos(next));
      for (const photo of toDelete) {
        if (photo.imageUri?.startsWith('file://')) {
          setImmediate(() => { try { new File(photo.imageUri).delete(); } catch {} });
        }
      }
      return next;
    });
  }, [albums.length]);

  const resetAllData = useCallback(async () => {
    const localUris = photos.filter(p => p.imageUri?.startsWith('file://')).map(p => p.imageUri);
    await clearAllData();
    // Cancel any scheduled album reminders so notifications stop after a full reset.
    // Failures are ignored so a notifications error cannot block the data wipe.
    try { await cancelAllReminders(); } catch {}
    for (const uri of localUris) {
      try { new File(uri).delete(); } catch {}
    }
    setPhotos([]);
    setProfile(defaultProfile);
    setSettings(getDefaultSettings());
    setAlbums([]);
    setUnlockedAlbumIds(new Set());
  }, [photos]);

  const seedMockPhotos = useCallback((albumId?: string) => {
    // Generate 7 mock photos: today back through last 6 days
    const mockPhotos: PhotoEntry[] = [];
    const MOCK_IMAGES = [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=533&fit=crop',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=533&fit=crop',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=533&fit=crop',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=533&fit=crop',
      'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=533&fit=crop',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=533&fit=crop',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=533&fit=crop',
    ];
    const CAPTIONS = ['Morning light', 'Coffee time', 'Golden hour', 'Rainy day', 'Sunday calm', 'Feeling good', 'Post-workout'];

    // albumId passed as parameter to avoid stale closure over albums state
    const resolvedAlbumId = albumId ?? 'daily-selfie';
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split('T')[0];
      mockPhotos.push({
        id: `mock-${date}-${Date.now()}`,
        albumId: resolvedAlbumId,
        date,
        imageUri: MOCK_IMAGES[i % MOCK_IMAGES.length],
        caption: CAPTIONS[i % CAPTIONS.length],
        capturedAt: d.toISOString(),
      });
    }
    setPhotos(prev => {
      // Don't clobber existing photos for the same album+date
      const existing = new Set(prev.map(p => `${p.albumId}:${p.date}`));
      const unique = mockPhotos.filter(m => !existing.has(`${m.albumId}:${m.date}`));
      const next = [...unique, ...prev];
      fireAndSave(() => savePhotos(next));
      return next;
    });
  }, []);

  const unlockAlbum = useCallback((id: string) => {
    setUnlockedAlbumIds(prev => {
      const next = new Set(prev);
      next.add(id);
      fireAndSave(() => saveUnlockedAlbumIds([...next]));
      return next;
    });
  }, []);

  const lockAlbum = useCallback((id: string) => {
    setUnlockedAlbumIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      fireAndSave(() => saveUnlockedAlbumIds([...next]));
      return next;
    });
  }, []);

  const isAlbumUnlocked = useCallback((id: string) => {
    return unlockedAlbumIds.has(id);
  }, [unlockedAlbumIds]);

  return (
    <AppContext.Provider value={{
      photos,
      profile,
      settings,
      albums,
      isLoading,
      addPhoto,
      addPhotos,
      updatePhoto,
      updatePhotos,
      deletePhoto,
      updateProfile,
      updateSettings,
      addAlbum,
      updateAlbum,
      deleteAlbum,
      resetAllData,
      seedMockPhotos,
      unlockedAlbumIds,
      unlockAlbum,
      lockAlbum,
      isAlbumUnlocked,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
