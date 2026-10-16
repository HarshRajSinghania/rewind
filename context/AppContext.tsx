import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { File } from 'expo-file-system';
import type { PhotoEntry, UserProfile, AppSettings, Album } from '@/types';
import { savePhotos, loadPhotos, saveProfile, loadProfile, saveSettings, loadSettings, getDefaultSettings, saveAlbums, loadAlbums, clearAllData, saveUnlockedAlbumIds, loadUnlockedAlbumIds } from '@/utils/storage';
import { USE_MOCK_DATA, MOCK_PHOTOS, MOCK_PROFILE, MOCK_SETTINGS } from '@/constants/mockData';
import { cancelAlbumReminder } from '@/utils/notifications';
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
}

const defaultProfile: UserProfile = { name: 'You', avatarUri: null, joinDate: new Date().toISOString().split('T')[0] };

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [settings, setSettings] = useState<AppSettings>(getDefaultSettings());
  const [albums, setAlbums] = useState<Album[]>(DEFAULT_ALBUMS);
  const [isLoading, setIsLoading] = useState(true);
  const [unlockedAlbumIds, setUnlockedAlbumIds] = useState<Set<string>>(new Set());

  // Synchronous mirror of `photos` for event handlers that must compute against
  // current state (e.g. addPhotos dedup counts). setState updaters run
  // asynchronously, so counting inside an updater makes the returned counts
  // depend on React's eager-evaluation timing — this ref is always fresh.
  const photosRef = useRef<PhotoEntry[]>([]);
  photosRef.current = photos;

  const unlockAlbum = useCallback((id: string) => {
    setUnlockedAlbumIds(prev => {
      const next = new Set(prev).add(id);
      enqueueSave(() => saveUnlockedAlbumIds([...next]));
      return next;
    });
  }, []);

  useEffect(() => {
    async function init() {
      try {
          const [photosResult, profileResult, settingsResult, albumsResult, unlockedResult] = await Promise.allSettled([
            loadPhotos(),
            loadProfile(),
            loadSettings(),
            loadAlbums(),
            loadUnlockedAlbumIds(),
          ]);
        const storedPhotos = photosResult.status === 'fulfilled' ? photosResult.value : [];
        const storedProfile = profileResult.status === 'fulfilled' ? profileResult.value : null;
        const storedSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : getDefaultSettings();
        const storedAlbums = albumsResult.status === 'fulfilled' ? albumsResult.value : null;
        const storedUnlockedIds = unlockedResult.status === 'fulfilled' ? unlockedResult.value : [];

        if (storedUnlockedIds.length > 0) {
          setUnlockedAlbumIds(new Set(storedUnlockedIds));
        }

        if (storedPhotos.length > 0) {
          // Migrate legacy photos missing albumId
          const needsMigration = storedPhotos.some(p => !p.albumId);
          const migratedPhotos = needsMigration
            ? storedPhotos.map(p => p.albumId ? p : { ...p, albumId: 'daily-selfie' })
            : storedPhotos;
          if (needsMigration) {
            await savePhotos(migratedPhotos);
          }
          setPhotos(migratedPhotos);
          // Derive joinDate from earliest photo if no stored profile
          const fallbackProfile: UserProfile = storedProfile ?? {
            ...defaultProfile,
            joinDate: [...storedPhotos].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? defaultProfile.joinDate,
          };
          if (!storedProfile) await saveProfile(fallbackProfile);
          setProfile(fallbackProfile);
          setSettings(storedSettings);
        } else if (USE_MOCK_DATA) {
          // Seed with mock data on first launch
          setPhotos(MOCK_PHOTOS);
          setProfile(MOCK_PROFILE);
          setSettings(MOCK_SETTINGS);
          await Promise.all([
            savePhotos(MOCK_PHOTOS),
            saveProfile(MOCK_PROFILE),
            saveSettings(MOCK_SETTINGS),
          ]);
        }

        if (storedAlbums && storedAlbums.length > 0) {
          // Migrate legacy albums missing reminder fields (stored data may lack new fields)
          const raw = storedAlbums as (Album & Record<string, unknown>)[];
          const needsAlbumMigration = raw.some(a => a.reminderEnabled === undefined);
          const migratedAlbums: Album[] = raw.map(a => ({
            id: a.id,
            name: a.name,
            createdAt: a.createdAt,
            reminderEnabled: a.reminderEnabled ?? false,
            reminderTime: a.reminderTime ?? '08:00',
            isLocked: a.isLocked ?? false,
          }));
          if (needsAlbumMigration) {
            await saveAlbums(migratedAlbums);
          }
          setAlbums(migratedAlbums);
        } else if (USE_MOCK_DATA) {
          // Seed default album for mock data mode
          const earliestDate = [...MOCK_PHOTOS].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
          const mockAlbum: Album = {
            id: 'daily-selfie',
            name: 'daily selfie',
            createdAt: earliestDate ? new Date(earliestDate).toISOString() : new Date().toISOString(),
            reminderEnabled: false,
            reminderTime: '08:00',
            isLocked: false,
          };
          setAlbums([mockAlbum]);
          await saveAlbums([mockAlbum]);
        }
      } catch (e) {
        console.error('Failed to load app data:', e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const addPhoto = useCallback((entry: PhotoEntry) => {
    setPhotos(prev => {
      // Replace if same date+album exists
      const filtered = prev.filter(p => !(p.date === entry.date && p.albumId === entry.albumId));
      const next = [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date));
      fireAndSave(() => savePhotos(next));
      return next;
    });
  }, []);

  const addPhotos = useCallback((entries: PhotoEntry[]): { added: number; skipped: number } => {
    // Dedup synchronously against the ref mirror so counts are deterministic.
    // The setPhotos updater re-checks against prev as a guard for batched calls.
    const seen = new Set(photosRef.current.map(p => `${p.albumId}:${p.date}`));
    const toAdd: PhotoEntry[] = [];
    let skipped = 0;
    for (const entry of entries) {
      const key = `${entry.albumId}:${entry.date}`;
      if (seen.has(key)) {
        skipped++;
      } else {
        seen.add(key);
        toAdd.push(entry);
      }
    }
    if (toAdd.length > 0) {
      setPhotos(prev => {
        const prevKeys = new Set(prev.map(p => `${p.albumId}:${p.date}`));
        const fresh = toAdd.filter(e => !prevKeys.has(`${e.albumId}:${e.date}`));
        if (fresh.length === 0) return prev;
        const next = [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
        fireAndSave(() => savePhotos(next));
        return next;
      });
    }
    return { added: toAdd.length, skipped };
  }, []);

  const updatePhoto = useCallback((id: string, updates: Partial<PhotoEntry>) => {
    setPhotos(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      fireAndSave(() => savePhotos(next));
      return next;
    });
  }, []);

  // Batched variant of updatePhoto: one state update + one save for many photos.
  // updatePhoto rewrites the whole array per call, so a 240-photo face-scan backfill
  // through it would mean 240 full writes. Ids not present (e.g. a photo deleted
  // mid-scan) are ignored.
  const updatePhotos = useCallback((patches: Record<string, Partial<PhotoEntry>>): Promise<boolean> => {
    if (Object.keys(patches).length === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      setPhotos(prev => {
        const next = prev.map(p =>
          Object.prototype.hasOwnProperty.call(patches, p.id) ? { ...p, ...patches[p.id] } : p
        );
        // An updater can run twice (StrictMode); the first save to settle answers.
        fireAndSave(() => savePhotos(next)).then(resolve);
        return next;
      });
    });
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

  const handleUpdateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      fireAndSave(() => saveProfile(next));
      return next;
    });
  }, []);

  const handleUpdateSettings = useCallback((updates: Partial<AppSettings>) => {
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
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const capturedAt = new Date(d);
      capturedAt.setHours(8, i * 7, 0, 0);
      mockPhotos.push({
        id: `mock-${Date.now()}-${i}`,
        albumId: resolvedAlbumId,
        date: dateStr,
        imageUri: MOCK_IMAGES[i],
        caption: CAPTIONS[i],
        capturedAt: capturedAt.toISOString(),
        cameraDirection: 'front',
      });
    }

    setPhotos(prev => {
      // Don't overwrite existing photos for same date+album
      const existingDates = new Set(prev.map(p => `${p.date}:${p.albumId}`));
      const newPhotos = mockPhotos.filter(p => !existingDates.has(`${p.date}:${p.albumId}`));
      const next = [...prev, ...newPhotos].sort((a, b) => a.date.localeCompare(b.date));
      fireAndSave(() => savePhotos(next));
      return next;
    });

    const earliest = mockPhotos[mockPhotos.length - 1].date;
    setProfile(prev => {
      if (!prev.joinDate || earliest < prev.joinDate) {
        const next = { ...prev, joinDate: earliest };
        fireAndSave(() => saveProfile(next));
        return next;
      }
      return prev;
    });

    setAlbums(prev => {
      const earliestISO = new Date(earliest + 'T00:00:00').toISOString();
      const updated = prev.map(a => {
        if (a.id === resolvedAlbumId && a.createdAt > earliestISO) {
          return { ...a, createdAt: earliestISO };
        }
        return a;
      });
      if (JSON.stringify(updated) !== JSON.stringify(prev)) {
        fireAndSave(() => saveAlbums(updated));
        return updated;
      }
      return prev;
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
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
        updateProfile: handleUpdateProfile,
        updateSettings: handleUpdateSettings,
        addAlbum,
        updateAlbum,
        deleteAlbum,
        resetAllData,
        seedMockPhotos,
        unlockedAlbumIds,
        unlockAlbum,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
