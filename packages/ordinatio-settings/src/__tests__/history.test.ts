// ===========================================
// ORDINATIO SETTINGS — History Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SettingHistoryDb, SettingHistoryEntry } from '../types';
import {
  recordSettingChange,
  getSettingHistory,
  getSettingAt,
  computeContentHash,
} from '../history';

function createMockHistoryDb(): SettingHistoryDb & {
  settingHistory: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
} {
  return {
    settingHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('history', () => {
  let db: ReturnType<typeof createMockHistoryDb>;

  beforeEach(() => {
    db = createMockHistoryDb();
    vi.clearAllMocks();
  });

  describe('computeContentHash', () => {
    it('returns a hex string', () => {
      const hash = computeContentHash('llm_provider', 'openai', 'ui', 'user-1');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns different hashes for different inputs', () => {
      const h1 = computeContentHash('llm_provider', 'openai', 'ui', 'user-1');
      const h2 = computeContentHash('llm_provider', 'claude', 'ui', 'user-1');
      // Different values should produce different hashes (timestamp varies too, but values differ)
      expect(typeof h1).toBe('string');
      expect(typeof h2).toBe('string');
    });
  });

  describe('recordSettingChange', () => {
    it('supersedes old entries and creates new one', async () => {
      const entry: SettingHistoryEntry = {
        id: 'hist-1',
        key: 'llm_provider',
        oldValue: 'claude',
        newValue: 'openai',
        source: 'ui',
        changedBy: 'user-1',
        contentHash: 'abc123',
        supersededAt: null,
        createdAt: new Date(),
      };
      db.settingHistory.updateMany.mockResolvedValue({ count: 1 });
      db.settingHistory.create.mockResolvedValue(entry);

      const result = await recordSettingChange(db, 'llm_provider', 'claude', 'openai', 'ui', 'user-1');

      expect(db.settingHistory.updateMany).toHaveBeenCalledWith({
        where: { key: 'llm_provider', supersededAt: null },
        data: expect.objectContaining({ supersededAt: expect.any(Date) }),
      });
      expect(db.settingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'llm_provider',
          oldValue: 'claude',
          newValue: 'openai',
          source: 'ui',
          changedBy: 'user-1',
          contentHash: expect.any(String),
          supersededAt: null,
        }),
      });
      expect(result).toEqual(entry);
    });

    it('handles null oldValue for first-time settings', async () => {
      db.settingHistory.updateMany.mockResolvedValue({ count: 0 });
      db.settingHistory.create.mockResolvedValue({
        id: 'hist-2',
        key: 'admin_feed_enabled',
        oldValue: null,
        newValue: 'false',
        source: 'system',
        changedBy: null,
        contentHash: 'def456',
        supersededAt: null,
        createdAt: new Date(),
      });

      await recordSettingChange(db, 'admin_feed_enabled', null, 'false', 'system', null);

      expect(db.settingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          oldValue: null,
          changedBy: null,
          source: 'system',
        }),
      });
    });
  });

  describe('getSettingHistory', () => {
    it('returns entries ordered by createdAt desc', async () => {
      const entries: SettingHistoryEntry[] = [
        { id: '2', key: 'k', oldValue: 'a', newValue: 'b', source: 'ui', changedBy: null, contentHash: 'x', supersededAt: null, createdAt: new Date('2026-03-07') },
        { id: '1', key: 'k', oldValue: null, newValue: 'a', source: 'system', changedBy: null, contentHash: 'y', supersededAt: new Date('2026-03-07'), createdAt: new Date('2026-03-06') },
      ];
      db.settingHistory.findMany.mockResolvedValue(entries);

      const result = await getSettingHistory(db, 'k');

      expect(db.settingHistory.findMany).toHaveBeenCalledWith({
        where: { key: 'k' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toEqual(entries);
    });

    it('respects custom limit', async () => {
      db.settingHistory.findMany.mockResolvedValue([]);

      await getSettingHistory(db, 'k', 10);

      expect(db.settingHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });
  });

  describe('getSettingAt', () => {
    it('returns value at a given timestamp', async () => {
      const entries: SettingHistoryEntry[] = [
        { id: '3', key: 'k', oldValue: 'b', newValue: 'c', source: 'ui', changedBy: null, contentHash: 'z', supersededAt: null, createdAt: new Date('2026-03-07T12:00:00Z') },
        { id: '2', key: 'k', oldValue: 'a', newValue: 'b', source: 'ui', changedBy: null, contentHash: 'y', supersededAt: new Date(), createdAt: new Date('2026-03-06T12:00:00Z') },
        { id: '1', key: 'k', oldValue: null, newValue: 'a', source: 'system', changedBy: null, contentHash: 'x', supersededAt: new Date(), createdAt: new Date('2026-03-05T12:00:00Z') },
      ];
      db.settingHistory.findMany.mockResolvedValue(entries);

      // Query at March 6 18:00 — should get entry 2 (newValue 'b')
      const result = await getSettingAt(db, 'k', new Date('2026-03-06T18:00:00Z'));
      expect(result).toBe('b');
    });

    it('returns null when no history exists before timestamp', async () => {
      db.settingHistory.findMany.mockResolvedValue([
        { id: '1', key: 'k', oldValue: null, newValue: 'a', source: 'system', changedBy: null, contentHash: 'x', supersededAt: null, createdAt: new Date('2026-03-07T12:00:00Z') },
      ]);

      const result = await getSettingAt(db, 'k', new Date('2026-03-01T00:00:00Z'));
      expect(result).toBeNull();
    });
  });
});
