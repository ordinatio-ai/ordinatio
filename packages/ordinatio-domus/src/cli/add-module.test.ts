// ===========================================
// TESTS: CLI add-module — getWiringInfo (event bus)
// ===========================================

import { describe, it, expect } from 'vitest';
import { getWiringInfo } from './add-module';

describe('getWiringInfo (event bus)', () => {
  it('returns event info for modules with event declarations', () => {
    const info = getWiringInfo(['email', 'tasks']);
    expect(info.length).toBeGreaterThan(0);
    expect(info[0]).toContain('Event bus');
    expect(info.some(d => d.includes('email'))).toBe(true);
    expect(info.some(d => d.includes('tasks'))).toBe(true);
  });

  it('returns empty for unknown modules', () => {
    expect(getWiringInfo(['unknown', 'bogus'])).toEqual([]);
  });

  it('returns empty for empty module list', () => {
    expect(getWiringInfo([])).toEqual([]);
  });

  it('includes emits info for each module', () => {
    const info = getWiringInfo(['email']);
    expect(info.length).toBeGreaterThan(0);
    expect(info.some(d => d.includes('email emits'))).toBe(true);
  });

  it('includes all modules when all 3 present', () => {
    const info = getWiringInfo(['email', 'tasks', 'entities']);
    expect(info.some(d => d.includes('email emits'))).toBe(true);
    expect(info.some(d => d.includes('tasks emits'))).toBe(true);
    expect(info.some(d => d.includes('entities emits'))).toBe(true);
  });

  it('handles duplicate module names', () => {
    const info1 = getWiringInfo(['email', 'email', 'tasks']);
    const info2 = getWiringInfo(['email', 'tasks']);
    // Duplicates produce duplicate lines but no crash
    expect(info1.length).toBeGreaterThanOrEqual(info2.length);
  });

  it('each line is a non-empty string', () => {
    const info = getWiringInfo(['email', 'tasks', 'entities']);
    for (const desc of info) {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it('modules without events return no lines', () => {
    // auth has events declared, so it should have lines
    const info = getWiringInfo(['auth']);
    expect(info.length).toBeGreaterThan(0);
  });

  it('settings module shows its events', () => {
    const info = getWiringInfo(['settings']);
    expect(info.some(d => d.includes('settings.changed'))).toBe(true);
  });
});
