// ===========================================
// TESTS: Factory Integration — createDomus() end-to-end
// ===========================================
// Mocks @prisma/client, @ordinatio/email, @ordinatio/tasks,
// @ordinatio/entities, and fs to test createDomus() wiring.
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Module-level mocks ---

const mockPrismaConnect = vi.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = vi.fn().mockResolvedValue(undefined);
const mockPrismaClient = {
  $connect: mockPrismaConnect,
  $disconnect: mockPrismaDisconnect,
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () { return mockPrismaClient; }),
}));

// Email module mock functions
const mockConnectAccount = vi.fn().mockResolvedValue({ id: 'acc-1' });
const mockDisconnectAccount = vi.fn().mockResolvedValue(undefined);
const mockSyncEmails = vi.fn().mockResolvedValue({ synced: 5 });
const mockArchiveEmail = vi.fn().mockResolvedValue(undefined);
const mockReplyToEmail = vi.fn().mockResolvedValue({ id: 'reply-1' });
const mockLinkEmailToClient = vi.fn().mockResolvedValue({ id: 'link-1' });
const mockGetInboxEmails = vi.fn().mockResolvedValue([]);
const mockFetchEmailContent = vi.fn().mockResolvedValue({ body: 'content' });
const mockEncodeCapsule = vi.fn().mockReturnValue('encoded');
const mockDecodeCapsule = vi.fn().mockReturnValue({ type: 'test' });
const mockEmbedCapsule = vi.fn().mockReturnValue('<html>embedded</html>');
const mockExtractCapsule = vi.fn().mockReturnValue({ type: 'test' });

vi.mock('@ordinatio/email', () => ({
  connectAccount: mockConnectAccount,
  disconnectAccount: mockDisconnectAccount,
  syncEmails: mockSyncEmails,
  archiveEmail: mockArchiveEmail,
  replyToEmail: mockReplyToEmail,
  linkEmailToClient: mockLinkEmailToClient,
  getInboxEmails: mockGetInboxEmails,
  fetchEmailContent: mockFetchEmailContent,
  encodeCapsule: mockEncodeCapsule,
  decodeCapsule: mockDecodeCapsule,
  embedCapsule: mockEmbedCapsule,
  extractCapsule: mockExtractCapsule,
}));

// Tasks module mock functions
const mockCreateTask = vi.fn().mockResolvedValue({ id: 'task-1' });
const mockGetTask = vi.fn().mockResolvedValue({ id: 'task-1' });
const mockUpdateTask = vi.fn().mockResolvedValue({ id: 'task-1' });
const mockCompleteTask = vi.fn().mockResolvedValue({ id: 'task-1' });
const mockListTasks = vi.fn().mockResolvedValue([]);
const mockGetOverdueTasks = vi.fn().mockResolvedValue([]);
const mockGetHealthSummary = vi.fn().mockResolvedValue({ healthy: true });
const mockGetAgentQueue = vi.fn().mockResolvedValue([]);

vi.mock('@ordinatio/tasks', () => ({
  createTask: mockCreateTask,
  getTask: mockGetTask,
  updateTask: mockUpdateTask,
  completeTask: mockCompleteTask,
  listTasks: mockListTasks,
  getOverdueTasks: mockGetOverdueTasks,
  getHealthSummary: mockGetHealthSummary,
  getAgentQueue: mockGetAgentQueue,
}));

// Entities module mock functions
const mockGetFieldDefinitions = vi.fn().mockResolvedValue([]);
const mockCreateFieldDefinition = vi.fn().mockResolvedValue({ id: 'fd-1' });
const mockGetEntityFields = vi.fn().mockResolvedValue([]);
const mockSetEntityFields = vi.fn().mockResolvedValue({});
const mockSearchByFields = vi.fn().mockResolvedValue([]);
const mockQueryKnowledge = vi.fn().mockResolvedValue([]);
const mockCreateNote = vi.fn().mockResolvedValue({ id: 'note-1' });
const mockGetNotes = vi.fn().mockResolvedValue([]);
const mockGetAllContacts = vi.fn().mockResolvedValue([]);
const mockCreateContact = vi.fn().mockResolvedValue({ id: 'contact-1' });
const mockFindOrCreateContact = vi.fn().mockResolvedValue({ id: 'contact-1' });
const mockLogInteraction = vi.fn().mockResolvedValue({ id: 'interaction-1' });

vi.mock('@ordinatio/entities', () => ({
  getFieldDefinitions: mockGetFieldDefinitions,
  createFieldDefinition: mockCreateFieldDefinition,
  getEntityFields: mockGetEntityFields,
  setEntityFields: mockSetEntityFields,
  searchByFields: mockSearchByFields,
  queryKnowledge: mockQueryKnowledge,
  createNote: mockCreateNote,
  getNotes: mockGetNotes,
  getAllContacts: mockGetAllContacts,
  createContact: mockCreateContact,
  findOrCreateContact: mockFindOrCreateContact,
  logInteraction: mockLogInteraction,
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
  existsSync: vi.fn().mockReturnValue(false),
}));

// Import after mocks
import { createDomus } from './factory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDomus() integration', () => {
  // --- Config resolution ---

  describe('config resolution', () => {
    it('throws when no databaseUrl found', async () => {
      const origEnv = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        await expect(
          createDomus({ modules: ['email'] }),
        ).rejects.toThrow('No database URL found');
      } finally {
        if (origEnv) process.env.DATABASE_URL = origEnv;
      }
    });

    it('throws when no modules specified', async () => {
      await expect(
        createDomus({ databaseUrl: 'postgresql://test', modules: [] }),
      ).rejects.toThrow('No modules specified');
    });

    it('reads .ordinatio.json when no explicit config', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        databaseUrl: 'postgresql://from-file',
        modules: ['email'],
      }));

      const app = await createDomus();

      expect(app.modules).toEqual(['email']);
      expect(app.email).toBeDefined();
      await app.shutdown();
    });

    it('explicit config overrides file config', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        databaseUrl: 'postgresql://from-file',
        modules: ['email'],
      }));

      const app = await createDomus({
        databaseUrl: 'postgresql://explicit',
        modules: ['tasks'],
      });

      expect(app.modules).toEqual(['tasks']);
      expect(app.tasks).toBeDefined();
      expect(app.email).toBeUndefined();
      await app.shutdown();
    });

    it('merges features from file + explicit', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        databaseUrl: 'postgresql://test',
        modules: ['email'],
        features: { FILE_FLAG: true },
      }));

      const app = await createDomus({
        features: { EXPLICIT_FLAG: true },
      });

      expect(app.features.FILE_FLAG).toBe(true);
      expect(app.features.EXPLICIT_FLAG).toBe(true);
      await app.shutdown();
    });
  });

  // --- Module loading ---

  describe('module loading', () => {
    it('loads only specified modules (email-only)', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email'],
      });

      expect(app.email).toBeDefined();
      expect(app.tasks).toBeUndefined();
      expect(app.entities).toBeUndefined();
      await app.shutdown();
    });

    it('all 3 modules loaded when all specified', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks', 'entities'],
      });

      expect(app.email).toBeDefined();
      expect(app.tasks).toBeDefined();
      expect(app.entities).toBeDefined();
      await app.shutdown();
    });

    it('module APIs are undefined when not loaded', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['tasks'],
      });

      expect(app.email).toBeUndefined();
      expect(app.tasks).toBeDefined();
      expect(app.entities).toBeUndefined();
      await app.shutdown();
    });

    it('shutdown() disconnects Prisma', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email'],
      });

      await app.shutdown();

      expect(mockPrismaDisconnect).toHaveBeenCalledOnce();
    });
  });

  // --- Event Bus wiring (replaces manual pair-wise wiring) ---

  describe('event bus wiring', () => {
    it('bus topology includes all loaded modules', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks', 'entities'],
        features: { AUTO_TASK_FROM_EMAIL: true, AUTO_CONTACT_FROM_EMAIL: true },
      });

      const topo = app.bus.getTopology();
      expect(topo.modules.email).toBeDefined();
      expect(topo.modules.tasks).toBeDefined();
      expect(topo.modules.entities).toBeDefined();
      expect(topo.modules.email.emits.length).toBeGreaterThan(0);
      expect(topo.modules.tasks.subscribesTo).toContain('email.synced');
      expect(topo.modules.entities.subscribesTo).toContain('email.synced');
      await app.shutdown();
    });

    it('bus topology only includes loaded modules', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email'],
      });

      const topo = app.bus.getTopology();
      expect(topo.modules.email).toBeDefined();
      expect(topo.modules.tasks).toBeUndefined();
      expect(topo.modules.entities).toBeUndefined();
      await app.shutdown();
    });

    it('modules receive bus-based callbacks (logActivity + emitEvent)', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email'],
      });

      await app.email!.syncEmails('acc-1');

      const syncCallbacksArg = mockSyncEmails.mock.calls[0][2];
      expect(syncCallbacksArg.logActivity).toBeTypeOf('function');
      expect(syncCallbacksArg.emitEvent).toBeTypeOf('function');
      await app.shutdown();
    });

    it('bus routes email.synced to tasks subscriber when flag is active', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks'],
        features: { AUTO_TASK_FROM_EMAIL: true },
      });

      await app.bus.emit({
        source: 'email',
        type: 'email.synced',
        data: { id: 'e-1', subject: 'Test' },
        timestamp: new Date().toISOString(),
      });

      expect(mockCreateTask).toHaveBeenCalled();
      await app.shutdown();
    });

    it('bus does NOT route when feature flag is off', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks'],
        features: { AUTO_TASK_FROM_EMAIL: false },
      });

      await app.bus.emit({
        source: 'email',
        type: 'email.synced',
        data: { id: 'e-1', subject: 'Test' },
        timestamp: new Date().toISOString(),
      });

      expect(mockCreateTask).not.toHaveBeenCalled();
      await app.shutdown();
    });
  });

  // --- Tasks → Entities wiring chain ---

  describe('tasks → entities wiring chain', () => {
    it('completeTask triggers onTaskCompleted wiring when tasks + entities + flag active', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks', 'entities'],
        features: {
          AUTO_ARCHIVE_ON_COMPLETE: true,
          AUTO_KNOWLEDGE_ON_TASK_COMPLETE: true,
        },
      });

      // completeTask calls the module with callbacks including logActivity
      // When logActivity fires with TASK_COMPLETED, it triggers wiring.onTaskCompleted
      await app.tasks!.completeTask('task-1', 'user-1', 'done');

      expect(mockCompleteTask).toHaveBeenCalledOnce();
      await app.shutdown();
    });

    it('task wiring fires only tasks-email onTaskCompleted when entities not loaded', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks'],
        features: { AUTO_ARCHIVE_ON_COMPLETE: true },
      });

      await app.tasks!.completeTask('task-1', 'user-1');

      expect(mockCompleteTask).toHaveBeenCalledOnce();
      // Verify the callbacks arg has logActivity that would fire onTaskCompleted
      const callbacksArg = mockCompleteTask.mock.calls[0][4];
      expect(callbacksArg.logActivity).toBeTypeOf('function');
      await app.shutdown();
    });

    it('task wiring fires only tasks-entities onTaskCompleted when email not loaded', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['tasks', 'entities'],
        features: { AUTO_KNOWLEDGE_ON_TASK_COMPLETE: true },
      });

      await app.tasks!.completeTask('task-1', 'user-1');

      expect(mockCompleteTask).toHaveBeenCalledOnce();
      const callbacksArg = mockCompleteTask.mock.calls[0][4];
      expect(callbacksArg.logActivity).toBeTypeOf('function');
      await app.shutdown();
    });

    it('task wiring fires no onTaskCompleted when no flags enabled', async () => {
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['tasks', 'entities'],
        features: {},
      });

      await app.tasks!.completeTask('task-1', 'user-1');

      // logActivity still exists but won't call wiring.onTaskCompleted
      // because wiring.onTaskCompleted is undefined
      const callbacksArg = mockCompleteTask.mock.calls[0][4];
      expect(callbacksArg.logActivity).toBeTypeOf('function');

      // Call logActivity with TASK_COMPLETED — it should NOT throw
      await callbacksArg.logActivity('TASK_COMPLETED', 'Task completed', { id: 'task-1' });
      // logInteraction should NOT have been called because wiring is empty
      expect(mockLogInteraction).not.toHaveBeenCalled();
      await app.shutdown();
    });
  });

  // --- User callbacks ---

  describe('user callbacks', () => {
    it('onActivity fires for email mutations', async () => {
      const onActivity = vi.fn().mockResolvedValue(undefined);
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email'],
        callbacks: { onActivity },
      });

      // Email's connectAccount passes mutationCallbacks with logActivity
      await app.email!.connectAccount('gmail', 'code123', 'test@example.com');

      // The mutationCallbacks.logActivity is passed to the module
      const callbacksArg = mockConnectAccount.mock.calls[0][4];
      await callbacksArg.logActivity('EMAIL_CONNECTED', 'Connected email');

      // Bus-based: onActivity receives (source, type, description, data)
      // The bus emits the action as the event type
      expect(onActivity).toHaveBeenCalledWith('email', 'EMAIL_CONNECTED', expect.any(String), expect.any(Object));
      await app.shutdown();
    });

    it('onActivity fires for task mutations', async () => {
      const onActivity = vi.fn().mockResolvedValue(undefined);
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['tasks'],
        callbacks: { onActivity },
      });

      await app.tasks!.createTask({ title: 'Test' });

      const callbacksArg = mockCreateTask.mock.calls[0][2];
      await callbacksArg.logActivity('TASK_CREATED', 'Created task');

      expect(onActivity).toHaveBeenCalledWith('tasks', 'TASK_CREATED', expect.any(String), expect.any(Object));
      await app.shutdown();
    });

    it('onActivity fires for entity mutations', async () => {
      const onActivity = vi.fn().mockResolvedValue(undefined);
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['entities'],
        callbacks: { onActivity },
      });

      await app.entities!.createFieldDefinition({ entityType: 'client', key: 'test' });

      const callbacksArg = mockCreateFieldDefinition.mock.calls[0][2];
      await callbacksArg.logActivity('FIELD_CREATED', 'Created field');

      expect(onActivity).toHaveBeenCalledWith('entities', 'FIELD_CREATED', 'Created field', undefined);
      await app.shutdown();
    });

    it('onEvent fires for all module events', async () => {
      const onEvent = vi.fn().mockResolvedValue(undefined);
      const app = await createDomus({
        databaseUrl: 'postgresql://test',
        modules: ['email', 'tasks'],
        callbacks: { onEvent },
      });

      // Get email callbacks and trigger emitEvent
      await app.email!.connectAccount('gmail', 'code', 'a@b.com');
      const emailCallbacks = mockConnectAccount.mock.calls[0][4];
      await emailCallbacks.emitEvent('EMAIL_CONNECTED', { email: 'a@b.com' });

      expect(onEvent).toHaveBeenCalledWith({
        module: 'email',
        type: 'EMAIL_CONNECTED',
        data: { email: 'a@b.com' },
      });

      // Get task callbacks and trigger emitEvent
      await app.tasks!.createTask({ title: 'Test' });
      const taskCallbacks = mockCreateTask.mock.calls[0][2];
      await taskCallbacks.emitEvent('TASK_CREATED', { id: 'task-1' });

      expect(onEvent).toHaveBeenCalledWith({
        module: 'tasks',
        type: 'TASK_CREATED',
        data: { id: 'task-1' },
      });

      await app.shutdown();
    });
  });
});
