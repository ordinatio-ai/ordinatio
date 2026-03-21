// ===========================================
// TASK ENGINE — QUERY TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTasks, getTask, getTaskCounts, getMyTasks, getTasksForEntity, getSubtasks, getAgentQueue, searchTasks } from './task-queries';
import { TaskNotFoundError } from './types';

function createMockDb() {
  return {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('task-queries', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('getTasks', () => {
    it('returns tasks with pagination defaults', async () => {
      const mockTasks = [{ id: 'task-1', title: 'Test task' }];
      db.task.findMany.mockResolvedValue(mockTasks);
      db.task.count.mockResolvedValue(1);

      const result = await getTasks(db);

      expect(result).toEqual({ tasks: mockTasks, total: 1, limit: 50, offset: 0 });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 })
      );
    });

    it('filters by status', async () => {
      await getTasks(db, { status: 'OPEN' });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN' }) })
      );
    });

    it('filters by assignedToId', async () => {
      await getTasks(db, { assignedToId: 'user-1' });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ assignedToId: 'user-1' }) })
      );
    });

    it('filters by categoryId', async () => {
      await getTasks(db, { categoryId: 'cat-1' });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1' }) })
      );
    });

    it('filters by entityType and entityId', async () => {
      await getTasks(db, { entityType: 'Client', entityId: 'client-1' });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ entityType: 'Client', entityId: 'client-1' }) })
      );
    });

    it('filters by priority', async () => {
      await getTasks(db, { priority: 'URGENT' });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ priority: 'URGENT' }) })
      );
    });

    it('filters by tags', async () => {
      await getTasks(db, { tags: ['urgent', 'billing'] });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tags: { hasSome: ['urgent', 'billing'] } }) })
      );
    });

    it('filters overdue tasks', async () => {
      await getTasks(db, { overdue: true });
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.dueDate).toHaveProperty('lt');
      expect(call.where.status).toEqual({ not: 'COMPLETED' });
    });

    it('respects custom limit and offset', async () => {
      const result = await getTasks(db, { limit: 10, offset: 20 });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 })
      );
    });

    it('sorts by priority when requested', async () => {
      await getTasks(db, { orderBy: 'priority' });
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.orderBy[0]).toEqual({ priority: 'asc' });
    });

    it('includes email, assignedTo, and category relations', async () => {
      await getTasks(db);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.include).toHaveProperty('email');
      expect(call.include).toHaveProperty('assignedTo');
      expect(call.include).toHaveProperty('category');
    });
  });

  describe('getTask', () => {
    it('returns a task by ID with full relations', async () => {
      const mockTask = { id: 'task-1', title: 'Test task', email: { client: null } };
      db.task.findUnique.mockResolvedValue(mockTask);

      const result = await getTask(db, 'task-1');
      expect(result).toEqual(mockTask);
    });

    it('includes subtasks, dependencies, and intent', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'T' });
      await getTask(db, 'task-1');
      const call = db.task.findUnique.mock.calls[0][0];
      expect(call.include).toHaveProperty('subtasks');
      expect(call.include).toHaveProperty('dependsOn');
      expect(call.include).toHaveProperty('intent');
    });

    it('throws TaskNotFoundError when task does not exist', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(getTask(db, 'nonexistent')).rejects.toThrow(TaskNotFoundError);
    });
  });

  describe('getTaskCounts', () => {
    it('returns counts for all statuses', async () => {
      db.task.groupBy.mockResolvedValue([
        { status: 'OPEN', _count: 5 },
        { status: 'IN_PROGRESS', _count: 2 },
        { status: 'BLOCKED', _count: 1 },
        { status: 'COMPLETED', _count: 3 },
      ]);

      const result = await getTaskCounts(db);
      expect(result).toEqual({ open: 5, inProgress: 2, blocked: 1, completed: 3, total: 11 });
    });

    it('returns zeros when no tasks exist', async () => {
      db.task.groupBy.mockResolvedValue([]);
      const result = await getTaskCounts(db);
      expect(result).toEqual({ open: 0, inProgress: 0, blocked: 0, completed: 0, total: 0 });
    });

    it('filters by assignedToId', async () => {
      db.task.groupBy.mockResolvedValue([{ status: 'OPEN', _count: 2 }]);
      await getTaskCounts(db, 'user-1');
      expect(db.task.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assignedToId: 'user-1' } })
      );
    });
  });

  describe('getMyTasks', () => {
    it('returns non-completed tasks for user by default', async () => {
      await getMyTasks(db, 'user-1');
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assignedToId: 'user-1', status: { not: 'COMPLETED' } },
          take: 20,
        })
      );
    });

    it('includes completed tasks when requested', async () => {
      await getMyTasks(db, 'user-1', { includeCompleted: true });
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.assignedToId).toBe('user-1');
      expect(call.where.status).toBeUndefined();
    });

    it('respects custom limit', async () => {
      await getMyTasks(db, 'user-1', { limit: 5 });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });

  describe('getTasksForEntity', () => {
    it('returns tasks linked to an entity', async () => {
      await getTasksForEntity(db, 'Client', 'client-1');
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'Client', entityId: 'client-1' }),
        })
      );
    });

    it('filters by status', async () => {
      await getTasksForEntity(db, 'Order', 'order-1', { status: 'OPEN' });
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'OPEN' }),
        })
      );
    });
  });

  describe('getSubtasks', () => {
    it('returns child tasks', async () => {
      await getSubtasks(db, 'parent-1');
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { parentTaskId: 'parent-1' } })
      );
    });
  });

  describe('getAgentQueue', () => {
    it('returns open and in-progress tasks sorted by priority', async () => {
      db.task.findMany.mockResolvedValue([
        { id: 't1', title: 'Low', priority: 'LOW', dueDate: null, createdAt: new Date() },
        { id: 't2', title: 'Urgent', priority: 'URGENT', dueDate: null, createdAt: new Date() },
      ]);

      const result = await getAgentQueue(db);
      expect(result[0].priority).toBe('URGENT');
      expect(result[1].priority).toBe('LOW');
    });

    it('filters by agentRole', async () => {
      db.task.findMany.mockResolvedValue([]);
      await getAgentQueue(db, 'coo');
      expect(db.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ agentRole: 'coo' }) })
      );
    });

    it('prioritizes overdue tasks', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      db.task.findMany.mockResolvedValue([
        { id: 't1', title: 'Future', priority: 'URGENT', dueDate: tomorrow, createdAt: new Date() },
        { id: 't2', title: 'Overdue', priority: 'LOW', dueDate: yesterday, createdAt: new Date() },
      ]);

      const result = await getAgentQueue(db);
      expect(result[0].title).toBe('Overdue');
    });
  });

  describe('searchTasks', () => {
    it('searches across title, description, and notes', async () => {
      await searchTasks(db, 'invoice');
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.OR).toHaveLength(3);
    });
  });
});
