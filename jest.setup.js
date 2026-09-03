/* Global mocks for native modules so unit tests run on plain Jest. */

// Enable React's act() environment so state updates flush deterministically.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// expo-localization — default to Sunday week start (matches app fallback)
jest.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday: 1 }],
}));

// expo-haptics — silent stubs; assertions go through these fns
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// expo-crypto — deterministic stand-ins (NOT real crypto).
// NOTE: the real getRandomBytes is synchronous — keep the mock sync too,
// otherwise `Array.from(bytes)` in utils/pin silently yields [].
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn((n) => new Uint8Array(n).fill(7)),
  digestStringAsync: jest.fn(async (_algo, msg) => `stub-hash:${msg}`),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
}));

// AsyncStorage — in-memory mock shipped with the package
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-notifications — controllable mock (real module uses dynamic import,
// which this mock intercepts so success paths are testable)
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));
