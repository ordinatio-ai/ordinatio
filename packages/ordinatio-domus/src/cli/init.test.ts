// ===========================================
// TESTS: CLI init — buildDefaultFeatures + countModels
// ===========================================

import { describe, it, expect } from 'vitest';
import { buildDefaultFeatures, countModels } from './init';

describe('buildDefaultFeatures', () => {
  it('email + tasks: sets AUTO_TASK_FROM_EMAIL and AUTO_ARCHIVE_ON_COMPLETE', () => {
    const features = buildDefaultFeatures(['email', 'tasks']);
    expect(features.OAEM_PROTOCOL).toBe(true);
    expect(features.EMAIL_TEMPLATES).toBe(true);
    expect(features.EMAIL_MULTI_PROVIDER).toBe(true);
    expect(features.TASK_ENGINE_V2).toBe(true);
    // Cross-module flags not set because entities is not present
    expect(features.AUTO_CONTACT_FROM_EMAIL).toBeUndefined();
    expect(features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE).toBeUndefined();
  });

  it('email + entities: sets AUTO_CONTACT_FROM_EMAIL', () => {
    const features = buildDefaultFeatures(['email', 'entities']);
    expect(features.AUTO_CONTACT_FROM_EMAIL).toBe(false);
    expect(features.ENTITY_KNOWLEDGE).toBe(true);
    // No tasks cross-module flags
    expect(features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE).toBeUndefined();
  });

  it('tasks + entities: sets AUTO_KNOWLEDGE_ON_TASK_COMPLETE', () => {
    const features = buildDefaultFeatures(['tasks', 'entities']);
    expect(features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE).toBe(false);
    expect(features.TASK_ENGINE_V2).toBe(true);
    expect(features.ENTITY_KNOWLEDGE).toBe(true);
    // No email cross-module flags
    expect(features.AUTO_CONTACT_FROM_EMAIL).toBeUndefined();
  });

  it('all 3 modules: sets all 4 cross-module flags', () => {
    const features = buildDefaultFeatures(['email', 'tasks', 'entities']);
    // Module-specific flags
    expect(features.OAEM_PROTOCOL).toBe(true);
    expect(features.TASK_ENGINE_V2).toBe(true);
    expect(features.ENTITY_KNOWLEDGE).toBe(true);
    // Cross-module flags (opt-in, default false)
    expect(features.AUTO_CONTACT_FROM_EMAIL).toBe(false);
    expect(features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE).toBe(false);
  });

  it('single module: only module-specific flags', () => {
    const features = buildDefaultFeatures(['email']);
    expect(features.OAEM_PROTOCOL).toBe(true);
    expect(features.EMAIL_TEMPLATES).toBe(true);
    expect(features.EMAIL_MULTI_PROVIDER).toBe(true);
    // No cross-module flags
    expect(features.AUTO_CONTACT_FROM_EMAIL).toBeUndefined();
    expect(features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE).toBeUndefined();
    expect(features.TASK_ENGINE_V2).toBeUndefined();
    expect(features.ENTITY_KNOWLEDGE).toBeUndefined();
  });

  it('auth module: sets CSRF_PROTECTION and ACCOUNT_LOCKOUT', () => {
    const features = buildDefaultFeatures(['auth']);
    expect(features.CSRF_PROTECTION).toBe(true);
    expect(features.ACCOUNT_LOCKOUT).toBe(true);
  });

  it('no modules: empty features', () => {
    const features = buildDefaultFeatures([]);
    expect(Object.keys(features)).toHaveLength(0);
  });
});

describe('countModels', () => {
  it('returns correct total for all 4 modules', () => {
    expect(countModels(['email', 'tasks', 'entities', 'auth'])).toBe(31); // 8 + 7 + 12 + 4
  });

  it('returns 0 for empty modules', () => {
    expect(countModels([])).toBe(0);
  });

  it('returns correct total for single module', () => {
    expect(countModels(['email'])).toBe(8);
    expect(countModels(['tasks'])).toBe(7);
    expect(countModels(['entities'])).toBe(12);
    expect(countModels(['auth'])).toBe(4);
  });

  it('handles unknown modules gracefully (counts 0)', () => {
    expect(countModels(['unknown'])).toBe(0);
  });
});
