// ===========================================
// ORDINATIO SETTINGS — Proposals Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SettingsDb } from '../types';
import type { SettingProposalDb, SettingProposal, SettingApproval } from '../proposals';
import {
  proposeSettingChange,
  approveSettingChange,
  applyApprovedChange,
  getActiveProposals,
  requiresApproval,
} from '../proposals';

function createMockProposalDb(): SettingProposalDb & {
  settingProposal: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  settingApproval: {
    create: ReturnType<typeof vi.fn>;
  };
} {
  return {
    settingProposal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    settingApproval: {
      create: vi.fn(),
    },
  };
}

function createMockFullDb() {
  return {
    ...createMockProposalDb(),
    systemSettings: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

const baseProposal: SettingProposal = {
  id: 'prop-1',
  key: 'llm_provider',
  oldValue: 'claude',
  newValue: 'openai',
  reason: 'Testing provider switch',
  requiredApprovals: 2,
  status: 'PROPOSED',
  expiresAt: new Date(Date.now() + 86400000),
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  approvals: [],
};

describe('proposals', () => {
  let db: ReturnType<typeof createMockProposalDb>;

  beforeEach(() => {
    db = createMockProposalDb();
    vi.clearAllMocks();
  });

  describe('proposeSettingChange', () => {
    it('creates a proposal with PROPOSED status', async () => {
      db.settingProposal.create.mockResolvedValue(baseProposal);

      const result = await proposeSettingChange(
        db,
        { key: 'llm_provider', oldValue: 'claude', newValue: 'openai', reason: 'Test' },
        'user-1',
      );

      expect(db.settingProposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'llm_provider',
          oldValue: 'claude',
          newValue: 'openai',
          reason: 'Test',
          status: 'PROPOSED',
          requiredApprovals: 2,
          createdBy: 'user-1',
          expiresAt: expect.any(Date),
        }),
      });
      expect(result).toEqual(baseProposal);
    });

    it('accepts custom required approvals and expiry', async () => {
      db.settingProposal.create.mockResolvedValue(baseProposal);

      await proposeSettingChange(
        db,
        { key: 'llm_provider', oldValue: '', newValue: 'openai', reason: 'Test' },
        'user-1',
        { requiredApprovals: 3, expiryHours: 48 },
      );

      expect(db.settingProposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requiredApprovals: 3,
        }),
      });
    });
  });

  describe('approveSettingChange', () => {
    it('records an approval', async () => {
      db.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        approvals: [],
      });
      db.settingApproval.create.mockResolvedValue({ id: 'appr-1' });

      await approveSettingChange(db, 'prop-1', 'user-2');

      expect(db.settingApproval.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          proposalId: 'prop-1',
          approverId: 'user-2',
          approverType: 'human',
        }),
      });
    });

    it('transitions to APPROVED when threshold met', async () => {
      db.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        approvals: [{ id: 'a1', proposalId: 'prop-1', approverId: 'user-2', approverType: 'human', createdAt: new Date() }],
      });
      db.settingApproval.create.mockResolvedValue({ id: 'appr-2' });
      db.settingProposal.update.mockResolvedValue({ ...baseProposal, status: 'APPROVED' });

      const result = await approveSettingChange(db, 'prop-1', 'user-3');

      expect(db.settingProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: 'APPROVED' },
      });
    });

    it('throws for non-existent proposal', async () => {
      db.settingProposal.findUnique.mockResolvedValue(null);

      await expect(
        approveSettingChange(db, 'nonexistent', 'user-1')
      ).rejects.toThrow('not found');
    });

    it('throws for non-PROPOSED status', async () => {
      db.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        status: 'APPROVED',
      });

      await expect(
        approveSettingChange(db, 'prop-1', 'user-2')
      ).rejects.toThrow('Cannot approve');
    });

    it('throws for expired proposal', async () => {
      db.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        approveSettingChange(db, 'prop-1', 'user-2')
      ).rejects.toThrow('expired');
    });

    it('throws for duplicate approver', async () => {
      db.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        approvals: [{ id: 'a1', proposalId: 'prop-1', approverId: 'user-2', approverType: 'human', createdAt: new Date() }],
      });

      await expect(
        approveSettingChange(db, 'prop-1', 'user-2')
      ).rejects.toThrow('already approved');
    });
  });

  describe('applyApprovedChange', () => {
    it('applies the setting and marks as APPLIED', async () => {
      const fullDb = createMockFullDb();
      fullDb.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        status: 'APPROVED',
        approvals: [
          { id: 'a1', proposalId: 'prop-1', approverId: 'user-2', approverType: 'human', createdAt: new Date() },
          { id: 'a2', proposalId: 'prop-1', approverId: 'user-3', approverType: 'human', createdAt: new Date() },
        ],
      });
      fullDb.systemSettings.findUnique.mockResolvedValue(null); // for old value lookup
      fullDb.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });
      fullDb.settingProposal.update.mockResolvedValue({ ...baseProposal, status: 'APPLIED' });

      await applyApprovedChange(fullDb, 'prop-1');

      expect(fullDb.systemSettings.upsert).toHaveBeenCalled();
      expect(fullDb.settingProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: 'APPLIED' },
      });
    });

    it('throws for non-APPROVED proposal', async () => {
      const fullDb = createMockFullDb();
      fullDb.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        status: 'PROPOSED',
      });

      await expect(
        applyApprovedChange(fullDb, 'prop-1')
      ).rejects.toThrow('must be APPROVED');
    });

    it('expires and throws for expired proposal', async () => {
      const fullDb = createMockFullDb();
      fullDb.settingProposal.findUnique.mockResolvedValue({
        ...baseProposal,
        status: 'APPROVED',
        expiresAt: new Date(Date.now() - 1000),
      });
      fullDb.settingProposal.update.mockResolvedValue({ ...baseProposal, status: 'EXPIRED' });

      await expect(
        applyApprovedChange(fullDb, 'prop-1')
      ).rejects.toThrow('expired');

      expect(fullDb.settingProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: 'EXPIRED' },
      });
    });
  });

  describe('getActiveProposals', () => {
    it('returns active proposals for a key', async () => {
      db.settingProposal.findMany.mockResolvedValue([baseProposal]);

      const result = await getActiveProposals(db, 'llm_provider');

      expect(db.settingProposal.findMany).toHaveBeenCalledWith({
        where: { status: 'PROPOSED', key: 'llm_provider' },
        include: { approvals: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toHaveLength(1);
    });

    it('returns all active proposals when no key specified', async () => {
      db.settingProposal.findMany.mockResolvedValue([]);

      await getActiveProposals(db);

      expect(db.settingProposal.findMany).toHaveBeenCalledWith({
        where: { status: 'PROPOSED' },
        include: { approvals: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('requiresApproval', () => {
    it('returns false for keys without requiresApproval flag', () => {
      expect(requiresApproval('llm_provider')).toBe(false);
      expect(requiresApproval('admin_feed_enabled')).toBe(false);
    });

    it('returns false for unknown keys', () => {
      expect(requiresApproval('nonexistent_key')).toBe(false);
    });
  });
});
