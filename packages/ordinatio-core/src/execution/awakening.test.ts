// IHS
import { describe, it, expect } from 'vitest';
import { classifyAwakening, isAwakeningRequired } from './awakening';
import type { ExecutionTrigger } from './types';

describe('classifyAwakening', () => {
  it('classifies cron trigger as temporal', () => {
    const trigger: ExecutionTrigger = { type: 'cron', source: 'nightly-stock-sync', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('temporal');
  });

  it('classifies user trigger as intellectual', () => {
    const trigger: ExecutionTrigger = { type: 'user', source: 'user-123', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('intellectual');
  });

  it('classifies continuation trigger as intellectual', () => {
    const trigger: ExecutionTrigger = { type: 'continuation', source: 'cont-abc', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('intellectual');
  });

  it('classifies system trigger as environmental', () => {
    const trigger: ExecutionTrigger = { type: 'system', source: 'maintenance', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('environmental');
  });

  it('classifies event with structural source as structural', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'schema-migration-v42', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('structural');
  });

  it('classifies event with module source as structural', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'module-admitted', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('structural');
  });

  it('classifies event with email source as environmental', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'email-received', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('environmental');
  });

  it('classifies event with order source as environmental', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'order-placed', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('environmental');
  });

  it('classifies event with knowledge source as intellectual', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'knowledge-updated', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('intellectual');
  });

  it('classifies event with schedule source as temporal', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'cron-daily-report', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('temporal');
  });

  it('defaults unknown event source to environmental', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'unknown-xyz', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('environmental');
  });

  it('handles case-insensitive source matching', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'SCHEMA-UPDATE', metadata: {} };
    expect(classifyAwakening(trigger)).toBe('structural');
  });
});

describe('isAwakeningRequired', () => {
  it('returns true for normal triggers', () => {
    const trigger: ExecutionTrigger = { type: 'event', source: 'order-placed', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(true);
  });

  it('returns false for heartbeat', () => {
    const trigger: ExecutionTrigger = { type: 'system', source: 'heartbeat', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(false);
  });

  it('returns false for ping', () => {
    const trigger: ExecutionTrigger = { type: 'system', source: 'ping', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(false);
  });

  it('returns false for health_check', () => {
    const trigger: ExecutionTrigger = { type: 'system', source: 'health_check', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(false);
  });

  it('returns false for keepalive', () => {
    const trigger: ExecutionTrigger = { type: 'system', source: 'keepalive', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(false);
  });

  it('returns true for cron triggers', () => {
    const trigger: ExecutionTrigger = { type: 'cron', source: '0 6 * * *', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(true);
  });

  it('returns true for user triggers', () => {
    const trigger: ExecutionTrigger = { type: 'user', source: 'user-action', metadata: {} };
    expect(isAwakeningRequired(trigger)).toBe(true);
  });
});
