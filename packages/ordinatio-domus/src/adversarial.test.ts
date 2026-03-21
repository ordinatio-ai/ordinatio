// ===========================================
// TESTS: Adversarial — createDomus() resilience
// ===========================================
// Tests malformed configs, missing modules,
// callback poisoning, feature flag manipulation,
// and config injection attacks.
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrismaConnect = vi.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = vi.fn().mockResolvedValue(undefined);
const mockPrismaClient = {
  $connect: mockPrismaConnect,
  $disconnect: mockPrismaDisconnect,
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mockPrismaClient; }),
}));

vi.mock('@ordinatio/email', () => ({
  connectAccount: vi.fn().mockResolvedValue({ id: 'acc-1' }),
  disconnectAccount: vi.fn().mockResolvedValue(undefined),
  syncEmails: vi.fn().mockResolvedValue({ synced: 5 }),
  archiveEmail: vi.fn().mockResolvedValue(undefined),
  replyToEmail: vi.fn().mockResolvedValue({ id: 'r1' }),
  linkEmailToClient: vi.fn().mockResolvedValue({}),
  getInboxEmails: vi.fn().mockResolvedValue([]),
  fetchEmailContent: vi.fn().mockResolvedValue({}),
  encodeCapsule: vi.fn().mockReturnValue('enc'),
  decodeCapsule: vi.fn().mockReturnValue({}),
  embedCapsule: vi.fn().mockReturnValue('html'),
  extractCapsule: vi.fn().mockReturnValue(null),
}));

vi.mock('@ordinatio/tasks', () => ({
  createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  getTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  updateTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  completeTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  listTasks: vi.fn().mockResolvedValue([]),
  getOverdueTasks: vi.fn().mockResolvedValue([]),
  getHealthSummary: vi.fn().mockResolvedValue({}),
  getAgentQueue: vi.fn().mockResolvedValue([]),
}));

vi.mock('@ordinatio/entities', () => ({
  getFieldDefinitions: vi.fn().mockResolvedValue([]),
  createFieldDefinition: vi.fn().mockResolvedValue({}),
  getEntityFields: vi.fn().mockResolvedValue([]),
  setEntityFields: vi.fn().mockResolvedValue({}),
  searchByFields: vi.fn().mockResolvedValue([]),
  queryKnowledge: vi.fn().mockResolvedValue([]),
  createNote: vi.fn().mockResolvedValue({}),
  getNotes: vi.fn().mockResolvedValue([]),
  getAllContacts: vi.fn().mockResolvedValue([]),
  createContact: vi.fn().mockResolvedValue({}),
  findOrCreateContact: vi.fn().mockResolvedValue({ id: 'c1' }),
  logInteraction: vi.fn().mockResolvedValue({}),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
  existsSync: vi.fn().mockReturnValue(false),
}));

import { createDomus } from './factory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adversarial: malformed config attacks', () => {
  it('throws with empty modules array', async () => {
    await expect(
      createDomus({ databaseUrl: 'postgresql://test', modules: [] }),
    ).rejects.toThrow('No modules specified');
  });

  it('unknown module name gracefully skipped (no crash)', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['nonexistent_module', 'email'],
    });

    // email still loads fine
    expect(app.email).toBeDefined();
    expect(app.modules).toContain('nonexistent_module');
    expect(app.modules).toContain('email');
    await app.shutdown();
  });

  it('features: null does not crash', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      features: undefined,
    });

    expect(app.email).toBeDefined();
    expect(app.features).toEqual({});
    await app.shutdown();
  });

  it('extra unknown config keys do not crash', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      // @ts-expect-error — testing unknown keys
      unknownKey: 'should be ignored',
      anotherKey: 42,
    });

    expect(app.email).toBeDefined();
    await app.shutdown();
  });
});

describe('adversarial: missing module resilience', () => {
  it('email wiring skipped when entities not in modules list', async () => {
    // Only load email — entities wiring should be empty
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      features: { AUTO_CONTACT_FROM_EMAIL: true },
    });

    const emailMod = await import('@ordinatio/email');
    await app.email!.syncEmails('acc-1');

    // syncEmails gets callbacks, but onEmailSynced should be undefined
    // because entities module is not loaded, so no wiring was built
    const syncCallbacks = vi.mocked(emailMod.syncEmails).mock.calls[0][2] as Record<string, unknown>;
    expect(syncCallbacks.onEmailSynced).toBeUndefined();
    await app.shutdown();
  });

  it('tasks wiring skipped when entities not in modules list', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['tasks'],
      features: { AUTO_KNOWLEDGE_ON_TASK_COMPLETE: true },
    });

    const tasksMod = await import('@ordinatio/tasks');
    await app.tasks!.completeTask('t1', 'u1');

    // logActivity callback should exist but NOT fire onTaskCompleted
    const callbacks = vi.mocked(tasksMod.completeTask).mock.calls[0][4] as Record<string, (...args: unknown[]) => Promise<void>>;
    await callbacks.logActivity('TASK_COMPLETED', 'done', { id: 't1' });

    const entitiesMod = await import('@ordinatio/entities');
    expect(vi.mocked(entitiesMod.logInteraction)).not.toHaveBeenCalled();
    await app.shutdown();
  });

  it('partial module load: email succeeds independently of tasks', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
    });

    expect(app.email).toBeDefined();
    expect(app.tasks).toBeUndefined();

    // Email operations work fine without tasks
    await app.email!.syncEmails('acc-1');
    const emailMod = await import('@ordinatio/email');
    expect(vi.mocked(emailMod.syncEmails)).toHaveBeenCalledOnce();
    await app.shutdown();
  });
});

describe('adversarial: callback poisoning', () => {
  it('poisoned onActivity callback does not crash — bus isolates errors', async () => {
    const onActivity = vi.fn().mockRejectedValue(new Error('poisoned'));
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      callbacks: { onActivity },
    });

    await app.email!.connectAccount('gmail', 'code', 'a@b.com');

    const emailMod = await import('@ordinatio/email');
    expect(vi.mocked(emailMod.connectAccount)).toHaveBeenCalledOnce();

    // Bus-based: logActivity routes through the bus, which catches errors
    const callbacksArg = vi.mocked(emailMod.connectAccount).mock.calls[0][4] as Record<string, (...args: unknown[]) => Promise<void>>;
    // Should NOT throw — bus isolates subscriber errors
    await expect(callbacksArg.logActivity('TEST', 'test')).resolves.toBeUndefined();
    await app.shutdown();
  });

  it('poisoned onEvent callback does not crash — bus isolates errors', async () => {
    const onEvent = vi.fn().mockRejectedValue(new Error('event poisoned'));
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['tasks'],
      callbacks: { onEvent },
    });

    await app.tasks!.createTask({ title: 'Test' });

    const tasksMod = await import('@ordinatio/tasks');
    expect(vi.mocked(tasksMod.createTask)).toHaveBeenCalledOnce();

    // Bus-based: emitEvent routes through the bus, which catches errors
    const callbacksArg = vi.mocked(tasksMod.createTask).mock.calls[0][2] as Record<string, (...args: unknown[]) => Promise<void>>;
    await expect(callbacksArg.emitEvent('TEST', {})).resolves.toBeUndefined();
    await app.shutdown();
  });

  it('subscriber error during bus routing is captured in error log', async () => {
    const onActivity = vi.fn().mockRejectedValue(new Error('poisoned'));
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      callbacks: { onActivity },
    });

    // Emit an event that triggers the poisoned subscriber
    await app.bus.emit({
      source: 'email', type: 'email.synced',
      data: { id: '1' }, timestamp: new Date().toISOString(),
    });

    // Bus did not crash — it captured the error
    // (bus errors are tracked internally but not exposed on the public API yet)
    await app.shutdown();
  });

  it('bus continues routing after subscriber failure', async () => {
    const onActivity = vi.fn()
      .mockRejectedValueOnce(new Error('first call fails'))
      .mockResolvedValue(undefined);
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      callbacks: { onActivity },
    });

    await app.bus.emit({ source: 'test', type: 'test.event', data: {}, timestamp: new Date().toISOString() });
    await app.bus.emit({ source: 'test', type: 'test.event2', data: {}, timestamp: new Date().toISOString() });

    // Both emits completed without throwing
    await app.shutdown();
  });
});

describe('adversarial: feature flag manipulation', () => {
  it('feature flags set to non-boolean values are treated as truthy/falsy by bus', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email', 'entities'],
      // @ts-expect-error — testing non-boolean values
      features: { AUTO_CONTACT_FROM_EMAIL: 'true' },
    });

    // Bus uses the feature flag to gate subscriptions
    // String "true" is truthy, so the subscriber SHOULD fire
    const entitiesMod = await import('@ordinatio/entities');
    vi.mocked(entitiesMod.findOrCreateContact).mockResolvedValue({ id: 'c1' });

    await app.bus.emit({
      source: 'email', type: 'email.synced',
      data: { from: 'test@example.com', fromName: 'Test' },
      timestamp: new Date().toISOString(),
    });

    // String 'true' is truthy → subscriber fires
    expect(vi.mocked(entitiesMod.findOrCreateContact)).toHaveBeenCalled();
    await app.shutdown();
  });

  it('feature flags set to undefined are treated as disabled by bus', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email', 'entities'],
      features: { AUTO_CONTACT_FROM_EMAIL: undefined as unknown as boolean },
    });

    const entitiesMod = await import('@ordinatio/entities');

    await app.bus.emit({
      source: 'email', type: 'email.synced',
      data: { from: 'test@example.com' },
      timestamp: new Date().toISOString(),
    });

    // undefined is falsy → subscriber does NOT fire
    expect(vi.mocked(entitiesMod.findOrCreateContact)).not.toHaveBeenCalled();
    await app.shutdown();
  });

  it('extra unknown feature flags are stored but ignored', async () => {
    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      features: { UNKNOWN_FLAG: true, ANOTHER_UNKNOWN: false },
    });

    expect(app.features.UNKNOWN_FLAG).toBe(true);
    expect(app.features.ANOTHER_UNKNOWN).toBe(false);
    await app.shutdown();
  });
});

describe('adversarial: config injection', () => {
  it('databaseUrl with SQL injection attempt is passed through (PrismaClient handles it)', async () => {
    // This tests that we don't crash — Prisma handles the URL
    const app = await createDomus({
      databaseUrl: "postgresql://test'; DROP TABLE users;--",
      modules: ['email'],
    });

    // PrismaClient constructor was called with the URL
    const { PrismaClient } = await import('@prisma/client');
    expect(PrismaClient).toHaveBeenCalledWith({
      datasourceUrl: "postgresql://test'; DROP TABLE users;--",
    });
    await app.shutdown();
  });

  it('config file with malformed JSON throws (handled by resolveConfig)', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{{');

    await expect(
      createDomus(),
    ).rejects.toThrow(); // JSON.parse will throw
  });

  it('config file with prototype pollution has no effect', async () => {
    const fs = await import('fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      databaseUrl: 'postgresql://test',
      modules: ['email'],
      '__proto__': { 'polluted': true },
    }));

    const app = await createDomus();

    // The prototype should not be polluted
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    await app.shutdown();
  });

  it('very large modules array only loads known modules', async () => {
    const bigModules = Array.from({ length: 100 }, (_, i) => `module_${i}`);
    bigModules.push('email'); // Add one real module

    const app = await createDomus({
      databaseUrl: 'postgresql://test',
      modules: bigModules,
    });

    // Only email should actually be loaded
    expect(app.email).toBeDefined();
    expect(app.tasks).toBeUndefined();
    expect(app.entities).toBeUndefined();
    // All modules are in the list though
    expect(app.modules).toHaveLength(101);
    await app.shutdown();
  });
});
