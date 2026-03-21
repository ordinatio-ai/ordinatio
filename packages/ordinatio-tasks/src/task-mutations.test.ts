// ===========================================
// TASK ENGINE — MUTATION TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTaskFromEmail,
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
} from './task-mutations';
import {
  completeTaskWithOutcome,
  startTask,
  blockTask,
  unblockTask,
  assignTask,
  addWatcher,
  removeWatcher,
} from './task-mutations-v2';
import {
  TaskNotFoundError,
  EmailNotFoundForTaskError,
  InvalidStatusTransitionError,
  DependencyNotMetError,
} from './types';

function createMockDb() {
  return {
    emailMessage: {
      findUnique: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskHistoryEntry: {
      create: vi.fn(),
    },
    taskDependency: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('task-mutations', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // --- createTaskFromEmail (legacy) ---

  describe('createTaskFromEmail', () => {
    it('creates a task from an email with default title', async () => {
      db.emailMessage.findUnique.mockResolvedValue({
        id: 'email-1',
        subject: 'Test Subject',
        clientId: 'client-1',
      });
      db.task.create.mockResolvedValue({
        id: 'task-1',
        title: 'Test Subject',
        emailId: 'email-1',
        assignedToId: null,
        dueDate: null,
        categoryId: null,
        createdBy: 'user-1',
      });

      const result = await createTaskFromEmail(db, {
        emailId: 'email-1',
        createdBy: 'user-1',
      });

      expect(result).toEqual({
        id: 'task-1',
        title: 'Test Subject',
        assignedToId: null,
        email: { clientId: 'client-1' },
      });
    });

    it('uses provided title over email subject', async () => {
      db.emailMessage.findUnique.mockResolvedValue({
        id: 'email-1',
        subject: 'Email Subject',
        clientId: null,
      });
      db.task.create.mockResolvedValue({
        id: 'task-1',
        title: 'Custom Title',
        emailId: 'email-1',
        assignedToId: 'user-2',
        dueDate: null,
        categoryId: null,
        createdBy: 'user-1',
      });

      await createTaskFromEmail(db, {
        emailId: 'email-1',
        title: 'Custom Title',
        assignedToId: 'user-2',
        createdBy: 'user-1',
      });

      expect(db.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'Custom Title' }),
        })
      );
    });

    it('throws EmailNotFoundForTaskError when email does not exist', async () => {
      db.emailMessage.findUnique.mockResolvedValue(null);

      await expect(
        createTaskFromEmail(db, { emailId: 'nonexistent', createdBy: 'user-1' })
      ).rejects.toThrow(EmailNotFoundForTaskError);
    });

    it('calls onEvent callback', async () => {
      db.emailMessage.findUnique.mockResolvedValue({ id: 'email-1', subject: 'Test', clientId: null });
      db.task.create.mockResolvedValue({
        id: 'task-1', title: 'Test', emailId: 'email-1', assignedToId: null, dueDate: null, categoryId: null, createdBy: 'user-1',
      });

      const onEvent = vi.fn();
      await createTaskFromEmail(db, { emailId: 'email-1', createdBy: 'user-1' }, { onEvent });

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'TASK_CREATED', entityId: 'task-1' })
      );
    });

    it('calls onActivity callback', async () => {
      db.emailMessage.findUnique.mockResolvedValue({ id: 'email-1', subject: 'Test', clientId: 'client-1' });
      db.task.create.mockResolvedValue({
        id: 'task-1', title: 'Test', emailId: 'email-1', assignedToId: null, dueDate: null, categoryId: null, createdBy: 'user-1',
      });

      const onActivity = vi.fn();
      await createTaskFromEmail(db, { emailId: 'email-1', createdBy: 'user-1' }, { onActivity });

      expect(onActivity).toHaveBeenCalledWith(
        'EMAIL_TASK_CREATED',
        expect.stringContaining('Created task'),
        expect.objectContaining({ taskId: 'task-1', emailId: 'email-1' })
      );
    });

    it('works without callbacks', async () => {
      db.emailMessage.findUnique.mockResolvedValue({ id: 'email-1', subject: 'Test', clientId: null });
      db.task.create.mockResolvedValue({
        id: 'task-1', title: 'Test', emailId: 'email-1', assignedToId: null, dueDate: null, categoryId: null, createdBy: 'user-1',
      });

      const result = await createTaskFromEmail(db, { emailId: 'email-1', createdBy: 'user-1' });
      expect(result.id).toBe('task-1');
    });
  });

  // --- createTask (new generic) ---

  describe('createTask', () => {
    it('creates an entity-agnostic task', async () => {
      db.task.create.mockResolvedValue({
        id: 'task-2',
        title: 'Follow up with client',
        entityType: 'Client',
        entityId: 'client-1',
        priority: 'HIGH',
      });

      const result = await createTask(db, {
        title: 'Follow up with client',
        entityType: 'Client',
        entityId: 'client-1',
        priority: 'HIGH',
        createdBy: 'user-1',
      });

      expect(result).toEqual({ id: 'task-2', title: 'Follow up with client' });
      expect(db.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Follow up with client',
            priority: 'HIGH',
            entityType: 'Client',
            entityId: 'client-1',
          }),
        })
      );
    });

    it('emits TASK_CREATED event', async () => {
      db.task.create.mockResolvedValue({ id: 'task-2', title: 'Test', priority: 'MEDIUM', entityType: null, entityId: null, assignedToId: null, createdBy: 'user-1' });

      const onEvent = vi.fn();
      await createTask(db, { title: 'Test', createdBy: 'user-1' }, { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TASK_CREATED' }));
    });

    it('defaults priority to MEDIUM', async () => {
      db.task.create.mockResolvedValue({ id: 'task-3', title: 'Test', priority: 'MEDIUM' });

      await createTask(db, { title: 'Test', createdBy: 'user-1' });

      expect(db.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priority: 'MEDIUM' }),
        })
      );
    });
  });

  // --- updateTask ---

  describe('updateTask', () => {
    it('updates task fields', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Old Title', assignedToId: null, dueDate: null, priority: 'MEDIUM',
        email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      await updateTask(db, 'task-1', { title: 'New Title' });

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { title: 'New Title' },
      });
    });

    it('throws TaskNotFoundError', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(updateTask(db, 'nonexistent', { title: 'X' })).rejects.toThrow(TaskNotFoundError);
    });

    it('calls onActivity with change tracking', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Old', assignedToId: null, dueDate: null, priority: 'MEDIUM',
        email: { clientId: 'client-1' },
      });
      db.task.update.mockResolvedValue({});

      const onActivity = vi.fn();
      await updateTask(db, 'task-1', { title: 'New' }, { userId: 'user-1' }, { onActivity });

      expect(onActivity).toHaveBeenCalledWith(
        'TASK_UPDATED',
        expect.any(String),
        expect.objectContaining({ changes: expect.objectContaining({ title: { from: 'Old', to: 'New' } }) })
      );
    });

    it('skips activity when logActivity is false', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'T', assignedToId: null, dueDate: null, priority: 'MEDIUM',
        email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      const onActivity = vi.fn();
      await updateTask(db, 'task-1', { title: 'X' }, { logActivity: false }, { onActivity });

      expect(onActivity).not.toHaveBeenCalled();
    });
  });

  // --- startTask ---

  describe('startTask', () => {
    it('moves OPEN task to IN_PROGRESS', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', status: 'OPEN' });
      db.task.update.mockResolvedValue({});

      await startTask(db, 'task-1', 'user-1');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('throws TaskNotFoundError', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(startTask(db, 'nope', 'user-1')).rejects.toThrow(TaskNotFoundError);
    });

    it('throws InvalidStatusTransitionError for non-OPEN tasks', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });
      await expect(startTask(db, 'task-1', 'user-1')).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('throws DependencyNotMetError when dependencies unmet', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', status: 'OPEN' });
      // Mock dependency check — unmet dependency
      db.taskDependency.findMany.mockResolvedValue([
        {
          type: 'FINISH_START',
          dependencyTask: { id: 'dep-1', title: 'Dep', status: 'OPEN' },
        },
      ]);

      await expect(startTask(db, 'task-1', 'user-1')).rejects.toThrow(DependencyNotMetError);
    });

    it('emits TASK_STATUS_CHANGED event', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', status: 'OPEN' });
      db.task.update.mockResolvedValue({});

      const onEvent = vi.fn();
      await startTask(db, 'task-1', 'user-1', { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TASK_STATUS_CHANGED' }));
    });
  });

  // --- blockTask ---

  describe('blockTask', () => {
    it('blocks a task with reason', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', status: 'IN_PROGRESS' });
      db.task.update.mockResolvedValue({});

      await blockTask(db, 'task-1', { reason: 'Waiting for vendor', blockerType: 'waiting_vendor' });

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: 'BLOCKED',
          blockerReason: 'Waiting for vendor',
          blockerType: 'waiting_vendor',
        }),
      });
    });

    it('throws on COMPLETED task', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });
      await expect(blockTask(db, 'task-1', { reason: 'x' })).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('emits TASK_BLOCKED event', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', status: 'OPEN' });
      db.task.update.mockResolvedValue({});

      const onEvent = vi.fn();
      await blockTask(db, 'task-1', { reason: 'blocked' }, { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TASK_BLOCKED' }));
    });
  });

  // --- unblockTask ---

  describe('unblockTask', () => {
    it('unblocks a BLOCKED task', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', status: 'BLOCKED' });
      db.task.update.mockResolvedValue({});

      await unblockTask(db, 'task-1', 'user-1');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({ status: 'OPEN', blockerReason: null }),
      });
    });

    it('throws on non-BLOCKED task', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', status: 'OPEN' });
      await expect(unblockTask(db, 'task-1')).rejects.toThrow(InvalidStatusTransitionError);
    });
  });

  // --- assignTask ---

  describe('assignTask', () => {
    it('assigns a task to a user', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', assignedToId: null });
      db.task.update.mockResolvedValue({});

      await assignTask(db, 'task-1', 'user-2', 'user-1');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { assignedToId: 'user-2' },
      });
    });

    it('emits TASK_ASSIGNED event', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T', assignedToId: null });
      db.task.update.mockResolvedValue({});

      const onEvent = vi.fn();
      await assignTask(db, 'task-1', 'user-2', 'user-1', { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TASK_ASSIGNED' }));
    });

    it('throws TaskNotFoundError', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(assignTask(db, 'nope', 'user-2')).rejects.toThrow(TaskNotFoundError);
    });
  });

  // --- completeTask (legacy) ---

  describe('completeTask', () => {
    it('marks task as completed', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Test', status: 'OPEN', emailId: 'email-1', assignedToId: 'user-1',
        email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      await completeTask(db, 'task-1', 'user-1');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({ status: 'COMPLETED', completedBy: 'user-1' }),
      });
    });

    it('throws TaskNotFoundError', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(completeTask(db, 'nonexistent', 'user-1')).rejects.toThrow(TaskNotFoundError);
    });

    it('emits TASK_COMPLETED event', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Test', status: 'OPEN', emailId: 'e-1', assignedToId: 'u-1',
        email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      const onEvent = vi.fn();
      await completeTask(db, 'task-1', 'user-1', { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TASK_COMPLETED' }));
    });
  });

  // --- completeTaskWithOutcome ---

  describe('completeTaskWithOutcome', () => {
    it('completes with structured outcome', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Test', status: 'IN_PROGRESS', email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      await completeTaskWithOutcome(db, 'task-1', {
        userId: 'user-1',
        outcome: 'Invoice sent to client',
        outcomeData: { invoiceId: 'inv-1' },
      });

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          outcome: 'Invoice sent to client',
        }),
      });
    });
  });

  // --- reopenTask ---

  describe('reopenTask', () => {
    it('sets task back to OPEN', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Test', status: 'COMPLETED', emailId: 'email-1',
        email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      await reopenTask(db, 'task-1', 'user-1');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: 'OPEN', completedAt: null, completedBy: null },
      });
    });

    it('throws TaskNotFoundError', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(reopenTask(db, 'nonexistent')).rejects.toThrow(TaskNotFoundError);
    });

    it('emits TASK_REOPENED event', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'T', status: 'COMPLETED', emailId: 'e-1', email: { clientId: null },
      });
      db.task.update.mockResolvedValue({});

      const onEvent = vi.fn();
      await reopenTask(db, 'task-1', 'user-1', { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'TASK_REOPENED' }));
    });
  });

  // --- deleteTask ---

  describe('deleteTask', () => {
    it('deletes the task', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Test', emailId: 'email-1', email: { clientId: 'client-1' },
      });
      db.task.delete.mockResolvedValue({});

      await deleteTask(db, 'task-1', 'user-1');

      expect(db.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    });

    it('throws TaskNotFoundError', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(deleteTask(db, 'nonexistent')).rejects.toThrow(TaskNotFoundError);
    });

    it('logs activity with captured info', async () => {
      db.task.findUnique.mockResolvedValue({
        id: 'task-1', title: 'Deleted Task', emailId: 'email-1', email: { clientId: 'client-1' },
      });
      db.task.delete.mockResolvedValue({});

      const onActivity = vi.fn();
      await deleteTask(db, 'task-1', 'user-1', { onActivity });

      expect(onActivity).toHaveBeenCalledWith(
        'TASK_DELETED',
        expect.stringContaining('Deleted task'),
        expect.objectContaining({ taskTitle: 'Deleted Task', clientId: 'client-1' })
      );
    });
  });

  // --- addWatcher / removeWatcher ---

  describe('watchers', () => {
    it('adds a watcher', async () => {
      db.task.findUnique.mockResolvedValue({ watchers: ['user-1'] });
      db.task.update.mockResolvedValue({});

      await addWatcher(db, 'task-1', 'user-2');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { watchers: { push: 'user-2' } },
      });
    });

    it('skips duplicate watcher', async () => {
      db.task.findUnique.mockResolvedValue({ watchers: ['user-1'] });

      await addWatcher(db, 'task-1', 'user-1');

      expect(db.task.update).not.toHaveBeenCalled();
    });

    it('removes a watcher', async () => {
      db.task.findUnique.mockResolvedValue({ watchers: ['user-1', 'user-2'] });
      db.task.update.mockResolvedValue({});

      await removeWatcher(db, 'task-1', 'user-1');

      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { watchers: ['user-2'] },
      });
    });
  });
});
