import { createAlbum } from '@/utils/albums';

describe('createAlbum', () => {
  it('creates an album with sane defaults', () => {
    const album = createAlbum('Daily');
    expect(album.id).toMatch(/^album-/);
    expect(album.name).toBe('Daily');
    expect(album.reminderEnabled).toBe(false);
    expect(album.reminderTime).toBe('08:00');
    expect(album.isLocked).toBe(false);
    expect(new Date(album.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('applies overrides', () => {
    const album = createAlbum('Daily', { isLocked: true, reminderTime: '21:30' });
    expect(album.isLocked).toBe(true);
    expect(album.reminderTime).toBe('21:30');
  });

  it('generates unique ids', () => {
    expect(createAlbum('a').id).not.toBe(createAlbum('a').id);
  });
});
