export interface PhotoEntry {
  id: string;
  albumId: string;
  date: string; // YYYY-MM-DD
  imageUri: string;
  caption: string;
  capturedAt: string; // ISO timestamp
  cameraDirection: 'front' | 'back';
  faceLandmarks?: FaceLandmarks;
  faceScan?: FaceScan;
}

export interface UserProfile {
  name: string;
  avatarUri: string | null;
  joinDate: string; // YYYY-MM-DD
}

export interface AppSettings {
  photoQuality: 'low' | 'medium' | 'high';
  cloudBackupEnabled: boolean;
  mirrorSelfies: boolean;
  use24hClock: boolean;
  alignFaces: boolean;
}

export interface Album {
  id: string;
  name: string;
  createdAt: string;
  reminderEnabled: boolean;
  reminderTime: string; // HH:MM
  isLocked: boolean;
}

export interface AppState {
  photos: PhotoEntry[];
  profile: UserProfile;
  settings: AppSettings;
  isLoading: boolean;
}

export interface FaceLandmarks {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  noseTip: { x: number; y: number };
  faceBounds: { x: number; y: number; width: number; height: number };
  rollAngle: number;
  yawAngle: number;
  isMirrored: boolean;
}

/**
 * Eye positions measured on the saved image itself (not the live preview), used to
 * eye-lock timelapse playback. Absent = not scanned yet.
 */
export interface FaceScan {
  /** Scan algorithm version; entries below FACE_SCAN_VERSION are rescanned. */
  v: number;
  /** Eye centers, normalized 0..1 of the upright scanned image. null = scanned, no face. */
  eyes: { left: { x: number; y: number }; right: { x: number; y: number } } | null;
  /** Upright scanned-image size in px — the aspect source for alignment math. */
  width: number;
  height: number;
}

export type DayStatus = 'captured' | 'missed' | 'upcoming' | 'today-done' | 'today-pending' | 'disabled';

export interface WeekDay {
  date: string;
  dayLabel: string;
  dayNumber: number;
  status: DayStatus;
}
