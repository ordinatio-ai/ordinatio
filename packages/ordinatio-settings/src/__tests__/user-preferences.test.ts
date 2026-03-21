// ===========================================
// ORDINATIO SETTINGS — User Preferences Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserPreferenceDb, UserPreference } from '../types';
import {
  getPreferences,
  updatePreferences,
  getReplyLayout,
} from '../user-preferences';

function createMockDb(): UserPreferenceDb & { userPreference: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> } } {
  return {
    userPreference: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

const mockPreferences: UserPreference = {
  id: 'pref-1',
  userId: 'user-1',
  replyLayout: 'MODAL',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('user-preferences', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('returns existing preferences when found', async () => {
      db.userPreference.findUnique.mockResolvedValue(mockPreferences);

      const result = await getPreferences(db, 'user-1');
      expect(result).toEqual(mockPreferences);
      expect(db.userPreference.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(db.userPreference.create).not.toHaveBeenCalled();
    });

    it('creates default preferences when not found', async () => {
      db.userPreference.findUnique.mockResolvedValue(null);
      db.userPreference.create.mockResolvedValue(mockPreferences);

      const result = await getPreferences(db, 'user-1');
      expect(result).toEqual(mockPreferences);
      expect(db.userPreference.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', replyLayout: 'MODAL' },
      });
    });

    it('creates preferences with MODAL as default replyLayout', async () => {
      db.userPreference.findUnique.mockResolvedValue(null);
      db.userPreference.create.mockResolvedValue({ ...mockPreferences, replyLayout: 'MODAL' });

      await getPreferences(db, 'new-user');

      expect(db.userPreference.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ replyLayout: 'MODAL' }),
      });
    });

    it('handles P2002 race condition by falling back to findUnique', async () => {
      // First findUnique returns null (no prefs yet)
      db.userPreference.findUnique
        .mockResolvedValueOnce(null)
        // Second findUnique (after P2002) returns the record another request created
        .mockResolvedValueOnce(mockPreferences);

      // Create throws P2002 (unique constraint violation)
      db.userPreference.create.mockRejectedValue({ code: 'P2002' });

      const result = await getPreferences(db, 'user-1');

      expect(result).toEqual(mockPreferences);
      expect(db.userPreference.create).toHaveBeenCalled();
      expect(db.userPreference.findUnique).toHaveBeenCalledTimes(2);
    });

    it('rethrows non-P2002 errors from create', async () => {
      db.userPreference.findUnique.mockResolvedValue(null);
      db.userPreference.create.mockRejectedValue(new Error('Connection failed'));

      await expect(getPreferences(db, 'user-1')).rejects.toThrow('Connection failed');
    });
  });

  describe('updatePreferences', () => {
    it('updates replyLayout preference', async () => {
      db.userPreference.upsert.mockResolvedValue({ ...mockPreferences, replyLayout: 'SPLIT_HORIZONTAL' });

      const result = await updatePreferences(db, 'user-1', { replyLayout: 'SPLIT_HORIZONTAL' });

      expect(result.replyLayout).toBe('SPLIT_HORIZONTAL');
      expect(db.userPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { replyLayout: 'SPLIT_HORIZONTAL' },
        create: { userId: 'user-1', replyLayout: 'SPLIT_HORIZONTAL' },
      });
    });

    it('supports SPLIT_VERTICAL layout', async () => {
      db.userPreference.upsert.mockResolvedValue({ ...mockPreferences, replyLayout: 'SPLIT_VERTICAL' });

      const result = await updatePreferences(db, 'user-1', { replyLayout: 'SPLIT_VERTICAL' });
      expect(result.replyLayout).toBe('SPLIT_VERTICAL');
    });

    it('supports POPOUT layout', async () => {
      db.userPreference.upsert.mockResolvedValue({ ...mockPreferences, replyLayout: 'POPOUT' });

      const result = await updatePreferences(db, 'user-1', { replyLayout: 'POPOUT' });
      expect(result.replyLayout).toBe('POPOUT');
    });

    it('creates preferences if they do not exist (upsert)', async () => {
      db.userPreference.upsert.mockResolvedValue({ ...mockPreferences, userId: 'new-user', replyLayout: 'MODAL' });

      await updatePreferences(db, 'new-user', { replyLayout: 'MODAL' });

      expect(db.userPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'new-user' },
        update: { replyLayout: 'MODAL' },
        create: { userId: 'new-user', replyLayout: 'MODAL' },
      });
    });

    it('handles empty update (no fields)', async () => {
      db.userPreference.upsert.mockResolvedValue(mockPreferences);

      await updatePreferences(db, 'user-1', {});

      expect(db.userPreference.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: { userId: 'user-1', replyLayout: 'MODAL' },
      });
    });

    it('calls onPreferenceChanged callback', async () => {
      db.userPreference.upsert.mockResolvedValue({ ...mockPreferences, replyLayout: 'POPOUT' });
      const onPreferenceChanged = vi.fn();

      await updatePreferences(db, 'user-1', { replyLayout: 'POPOUT' }, { onPreferenceChanged });

      expect(onPreferenceChanged).toHaveBeenCalledWith('user-1', { replyLayout: 'POPOUT' });
    });
  });

  describe('getReplyLayout', () => {
    it('returns replyLayout from preferences', async () => {
      db.userPreference.findUnique.mockResolvedValue({ ...mockPreferences, replyLayout: 'SPLIT_HORIZONTAL' });

      const result = await getReplyLayout(db, 'user-1');
      expect(result).toBe('SPLIT_HORIZONTAL');
    });

    it('returns default MODAL when preferences do not exist', async () => {
      db.userPreference.findUnique.mockResolvedValue(null);
      db.userPreference.create.mockResolvedValue({ ...mockPreferences, replyLayout: 'MODAL' });

      const result = await getReplyLayout(db, 'user-1');
      expect(result).toBe('MODAL');
    });

    it('handles POPOUT layout', async () => {
      db.userPreference.findUnique.mockResolvedValue({ ...mockPreferences, replyLayout: 'POPOUT' });
      expect(await getReplyLayout(db, 'user-1')).toBe('POPOUT');
    });

    it('handles SPLIT_VERTICAL layout', async () => {
      db.userPreference.findUnique.mockResolvedValue({ ...mockPreferences, replyLayout: 'SPLIT_VERTICAL' });
      expect(await getReplyLayout(db, 'user-1')).toBe('SPLIT_VERTICAL');
    });
  });
});
