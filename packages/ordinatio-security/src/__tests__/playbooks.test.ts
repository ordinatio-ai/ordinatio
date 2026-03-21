// ===========================================
// Playbooks Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  getPlaybookForAlert,
  getAllPlaybooks,
  getPlaybookById,
  SECURITY_PLAYBOOKS,
} from '../policy/playbooks';

describe('SECURITY_PLAYBOOKS', () => {
  it('has 5 built-in playbooks', () => {
    expect(SECURITY_PLAYBOOKS).toHaveLength(5);
  });

  it('each playbook has required fields', () => {
    for (const pb of SECURITY_PLAYBOOKS) {
      expect(pb.id).toBeTruthy();
      expect(pb.name).toBeTruthy();
      expect(pb.trigger).toBeTruthy();
      expect(pb.steps.length).toBeGreaterThan(0);
    }
  });

  it('each step has action, params, description', () => {
    for (const pb of SECURITY_PLAYBOOKS) {
      for (const step of pb.steps) {
        expect(step.action).toBeTruthy();
        expect(step.params).toBeDefined();
        expect(step.description).toBeTruthy();
      }
    }
  });
});

describe('getPlaybookForAlert', () => {
  it('returns matching playbook', () => {
    expect(getPlaybookForAlert('replay_attack')?.name).toBe('Replay Attack Response');
    expect(getPlaybookForAlert('brute_force')?.name).toBe('Brute Force Response');
    expect(getPlaybookForAlert('data_exfiltration')?.name).toBe('Data Exfiltration Response');
    expect(getPlaybookForAlert('account_takeover')?.name).toBe('Account Takeover Response');
    expect(getPlaybookForAlert('suspicious_capsule')?.name).toBe('Suspicious Capsule Response');
  });

  it('returns null for unknown alert type', () => {
    expect(getPlaybookForAlert('unknown_type')).toBeNull();
  });
});

describe('getAllPlaybooks', () => {
  it('returns all playbooks', () => {
    const all = getAllPlaybooks();
    expect(all).toHaveLength(5);
  });

  it('returns a copy (not a reference)', () => {
    const all = getAllPlaybooks();
    all.pop();
    expect(getAllPlaybooks()).toHaveLength(5);
  });
});

describe('getPlaybookById', () => {
  it('finds playbook by ID', () => {
    expect(getPlaybookById('playbook-brute-force')?.trigger).toBe('brute_force');
  });

  it('returns null for unknown ID', () => {
    expect(getPlaybookById('nonexistent')).toBeNull();
  });
});
