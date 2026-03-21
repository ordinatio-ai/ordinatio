// ===========================================
// ORDINATIO CORE — Governance Proposals Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  canApply,
  addApproval,
  isExpired,
  markApplied,
  rejectProposal,
  type Proposal,
  type ProposalApproval,
} from './proposals';

function makeProposal(overrides?: Partial<Proposal<{ key: string }>>): Proposal<{ key: string }> {
  return {
    id: 'proposal-1',
    type: 'setting_change',
    payload: { key: 'llm_provider' },
    requiredApprovals: 2,
    approvals: [],
    status: 'PROPOSED',
    expiresAt: new Date(Date.now() + 86400000), // 24h from now
    createdBy: 'user-1',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeApproval(id: string, type: 'human' | 'agent' = 'human'): ProposalApproval {
  return {
    approverId: id,
    approverType: type,
    timestamp: new Date(),
  };
}

describe('governance proposals', () => {
  describe('canApply', () => {
    it('returns false for proposal with no approvals', () => {
      expect(canApply(makeProposal())).toBe(false);
    });

    it('returns false for proposal with insufficient approvals', () => {
      const p = makeProposal({ approvals: [makeApproval('user-1')] });
      expect(canApply(p)).toBe(false);
    });

    it('returns true when required approvals are met', () => {
      const p = makeProposal({
        approvals: [makeApproval('user-1'), makeApproval('user-2')],
        status: 'APPROVED',
      });
      expect(canApply(p)).toBe(true);
    });

    it('returns false for expired proposals', () => {
      const p = makeProposal({
        approvals: [makeApproval('user-1'), makeApproval('user-2')],
        status: 'APPROVED',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(canApply(p)).toBe(false);
    });

    it('returns false for rejected proposals', () => {
      const p = makeProposal({
        approvals: [makeApproval('user-1'), makeApproval('user-2')],
        status: 'REJECTED',
      });
      expect(canApply(p)).toBe(false);
    });

    it('returns false for already-applied proposals', () => {
      const p = makeProposal({ status: 'APPLIED' });
      expect(canApply(p)).toBe(false);
    });
  });

  describe('addApproval', () => {
    it('adds approval and keeps PROPOSED status below threshold', () => {
      const p = makeProposal();
      const result = addApproval(p, makeApproval('user-1'));

      expect(result.approvals).toHaveLength(1);
      expect(result.status).toBe('PROPOSED');
    });

    it('transitions to APPROVED when threshold is met', () => {
      const p = makeProposal({ approvals: [makeApproval('user-1')] });
      const result = addApproval(p, makeApproval('user-2'));

      expect(result.approvals).toHaveLength(2);
      expect(result.status).toBe('APPROVED');
    });

    it('prevents duplicate approvals from same approver', () => {
      const p = makeProposal({ approvals: [makeApproval('user-1')] });

      expect(() => addApproval(p, makeApproval('user-1'))).toThrow('already approved');
    });

    it('throws on non-PROPOSED status', () => {
      const p = makeProposal({ status: 'APPROVED' });
      expect(() => addApproval(p, makeApproval('user-3'))).toThrow('Cannot approve');
    });

    it('throws on expired proposal', () => {
      const p = makeProposal({ expiresAt: new Date(Date.now() - 1000) });
      expect(() => addApproval(p, makeApproval('user-1'))).toThrow('expired');
    });

    it('is immutable — does not modify original', () => {
      const p = makeProposal();
      const result = addApproval(p, makeApproval('user-1'));

      expect(p.approvals).toHaveLength(0);
      expect(result.approvals).toHaveLength(1);
    });

    it('supports agent approvers', () => {
      const p = makeProposal({ approvals: [makeApproval('user-1')] });
      const result = addApproval(p, makeApproval('coo-agent', 'agent'));

      expect(result.approvals[1].approverType).toBe('agent');
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('isExpired', () => {
    it('returns false for future expiration', () => {
      expect(isExpired(makeProposal())).toBe(false);
    });

    it('returns true for past expiration', () => {
      expect(isExpired(makeProposal({ expiresAt: new Date(Date.now() - 1000) }))).toBe(true);
    });
  });

  describe('markApplied', () => {
    it('marks proposal as APPLIED', () => {
      const p = makeProposal({
        approvals: [makeApproval('user-1'), makeApproval('user-2')],
        status: 'APPROVED',
      });
      const result = markApplied(p);
      expect(result.status).toBe('APPLIED');
    });

    it('throws if not enough approvals', () => {
      expect(() => markApplied(makeProposal())).toThrow('cannot be applied');
    });
  });

  describe('rejectProposal', () => {
    it('marks proposal as REJECTED', () => {
      const result = rejectProposal(makeProposal());
      expect(result.status).toBe('REJECTED');
    });

    it('throws on non-PROPOSED status', () => {
      expect(() => rejectProposal(makeProposal({ status: 'APPROVED' }))).toThrow('Cannot reject');
    });
  });
});
