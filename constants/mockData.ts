import type { PhotoEntry, UserProfile, AppSettings } from '@/types';

export const USE_MOCK_DATA = process.env.EXPO_PUBLIC_MOCK_DATA === '1';

// 10 Unsplash photo URLs (portrait selfie/lifestyle photos, small size for performance)
const MOCK_IMAGES = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=400&h=533&fit=crop',
  'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=400&h=533&fit=crop',
];

const CAPTIONS = [
  'Morning light through the window',
  'Coffee time',
  'Golden hour glow',
  'Rainy day vibes',
  'Sunday calm',
  'New haircut day',
  'Feeling good today',
  'Post-workout energy',
  'Late afternoon sun',
  'Cozy evening in',
  'Fresh start',
  'Window reflections',
  'Natural light',
  'Just woke up',
  'End of a long day',
  'Peaceful morning',
  'Chasing sunlight',
  'Simple moments',
  'Monday motivation',
  'Weekend mood',
];

function generateMockPhotos(): PhotoEntry[] {
  const photos: PhotoEntry[] = [];
  const startDate = new Date(2025, 10, 3); // Nov 3, 2025

  for (let i = 0; i < 127; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    // Set capture time to ~7-9 AM
    const hour = 7 + (i % 3);
    const minute = (i * 7) % 60;
    const capturedAt = new Date(date);
    capturedAt.setHours(hour, minute, 0, 0);

    photos.push({
      id: `mock-${String(i + 1).padStart(4, '0')}`,
      albumId: 'daily-selfie',
      date: dateStr,
      imageUri: MOCK_IMAGES[i % MOCK_IMAGES.length],
      caption: CAPTIONS[i % CAPTIONS.length],
      capturedAt: capturedAt.toISOString(),
      cameraDirection: i % 3 === 0 ? 'back' : 'front',
    });
  }

  return photos;
}

export const MOCK_PHOTOS: PhotoEntry[] = generateMockPhotos();

export const MOCK_PROFILE: UserProfile = {
  name: 'Alexandra',
  avatarUri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
  joinDate: '2025-11-03',
};

export const MOCK_SETTINGS: AppSettings = {
  photoQuality: 'high',
  cloudBackupEnabled: false,
  mirrorSelfies: true,
  use24hClock: false,
  alignFaces: true,
};
