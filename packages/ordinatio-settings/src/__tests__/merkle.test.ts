// ===========================================
// ORDINATIO SETTINGS — Merkle Auditing Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SettingsDb } from '../types';
import {
  computeSettingsMerkleRoot,
  verifySettingsIntegrity,
  computeMerkleRootFromPairs,
} from '../merkle';

function createMockDb(): SettingsDb & {
  systemSettings: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
} {
  return {
    systemSettings: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe('merkle', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  describe('computeSettingsMerkleRoot', () => {
    it('produces a 64-char hex hash', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'admin_feed_enabled', value: 'true' },
        { key: 'llm_provider', value: 'claude' },
      ]);

      const root = await computeSettingsMerkleRoot(db);
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces deterministic output (same data → same hash)', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'llm_provider', value: 'claude' },
        { key: 'admin_feed_enabled', value: 'true' },
      ]);

      const root1 = await computeSettingsMerkleRoot(db);

      // Same data in different order
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'admin_feed_enabled', value: 'true' },
        { key: 'llm_provider', value: 'claude' },
      ]);

      const root2 = await computeSettingsMerkleRoot(db);
      expect(root1).toBe(root2);
    });

    it('produces different hash for different values', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'llm_provider', value: 'claude' },
      ]);
      const root1 = await computeSettingsMerkleRoot(db);

      db.systemSettings.findMany.mockResolvedValue([
        { key: 'llm_provider', value: 'openai' },
      ]);
      const root2 = await computeSettingsMerkleRoot(db);

      expect(root1).not.toBe(root2);
    });

    it('handles empty settings', async () => {
      db.systemSettings.findMany.mockResolvedValue([]);

      const root = await computeSettingsMerkleRoot(db);
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verifySettingsIntegrity', () => {
    it('returns valid=true when roots match', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'admin_feed_enabled', value: 'true' },
      ]);

      const expectedRoot = await computeSettingsMerkleRoot(db);
      const result = await verifySettingsIntegrity(db, expectedRoot);

      expect(result.valid).toBe(true);
      expect(result.currentRoot).toBe(expectedRoot);
    });

    it('returns valid=false when roots differ', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'admin_feed_enabled', value: 'true' },
      ]);

      const result = await verifySettingsIntegrity(db, 'wrong-root-hash');

      expect(result.valid).toBe(false);
      expect(result.currentRoot).not.toBe('wrong-root-hash');
    });
  });

  describe('computeMerkleRootFromPairs', () => {
    it('matches computeSettingsMerkleRoot for same data', async () => {
      const pairs = [
        { key: 'admin_feed_enabled', value: 'true' },
        { key: 'llm_provider', value: 'claude' },
      ];
      db.systemSettings.findMany.mockResolvedValue(pairs);

      const fromDb = await computeSettingsMerkleRoot(db);
      const fromPairs = computeMerkleRootFromPairs(pairs);

      expect(fromDb).toBe(fromPairs);
    });

    it('is order-independent', () => {
      const root1 = computeMerkleRootFromPairs([
        { key: 'b', value: '2' },
        { key: 'a', value: '1' },
      ]);
      const root2 = computeMerkleRootFromPairs([
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ]);
      expect(root1).toBe(root2);
    });
  });
});
