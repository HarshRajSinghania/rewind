import * as Notifications from 'expo-notifications';
import {
  requestNotificationPermission,
  scheduleAlbumReminder,
  cancelAlbumReminder,
  cancelAllReminders,
  syncAllReminders,
} from '@/utils/notifications';
import type { Album } from '@/types';

const album: Album = {
  id: 'album-1',
  name: 'Daily',
  createdAt: '2026-03-01T00:00:00.000Z',
  reminderEnabled: true,
  reminderTime: '08:30',
  isLocked: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('notifications', () => {
  it('returns permission status', async () => {
    expect(await requestNotificationPermission()).toBe(true);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    expect(await requestNotificationPermission()).toBe(false);
  });

  it('schedules a daily album reminder with parsed hour/minute', async () => {
    await scheduleAlbumReminder(album);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('album-reminder-album-1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'album-reminder-album-1',
        trigger: expect.objectContaining({ hour: 8, minute: 30 }),
      })
    );
  });

  it('cancels a single album reminder', async () => {
    await cancelAlbumReminder('album-1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('album-reminder-album-1');
  });

  it('cancels everything, and syncs only enabled albums', async () => {
    const off = { ...album, id: 'album-2', reminderEnabled: false };
    await syncAllReminders([album, off]);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('never throws when the native module fails', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValueOnce(new Error('native down'));
    await expect(cancelAllReminders()).resolves.toBeUndefined();
    await expect(scheduleAlbumReminder(album)).resolves.toBeUndefined();
    await expect(syncAllReminders([album])).resolves.toBeUndefined();
  });
});
