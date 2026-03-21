// ===========================================
// TASK ENGINE — HISTORY TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordHistory, getTaskHistory } from './task-history';

function createMockDb() {
  return {
    taskHistoryEntry: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

describe('task-history', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('recordHistory', () => {
    it('creates a history entry', async () => {
      db.taskHistoryEntry.create.mockResolvedValue({ id: 'h-1' });

      await recordHistory(db, 'task-1', 'status_changed', 'status', 'OPEN', 'IN_PROGRESS', 'user-1');

      expect(db.taskHistoryEntry.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          action: 'status_changed',
          field: 'status',
          oldValue: 'OPEN',
          newValue: 'IN_PROGRESS',
          userId: 'user-1',
        },
      });
    });

    it('handles null values', async () => {
      db.taskHistoryEntry.create.mockResolvedValue({ id: 'h-2' });

      await recordHistory(db, 'task-1', 'created');

      expect(db.taskHistoryEntry.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          action: 'created',
          field: null,
          oldValue: null,
          newValue: null,
          userId: null,
        },
      });
    });

    it('converts non-string values to strings', async () => {
      db.taskHistoryEntry.create.mockResolvedValue({ id: 'h-3' });

      await recordHistory(db, 'task-1', 'field_updated', 'priority', 'LOW' as any, 'HIGH' as any);

      const call = db.taskHistoryEntry.create.mock.calls[0][0];
      expect(call.data.oldValue).toBe('LOW');
      expect(call.data.newValue).toBe('HIGH');
    });
  });

  describe('getTaskHistory', () => {
    it('returns history entries for a task', async () => {
      const entries = [
        { id: 'h-1', action: 'created', createdAt: new Date() },
        { id: 'h-2', action: 'status_changed', createdAt: new Date() },
      ];
      db.taskHistoryEntry.findMany.mockResolvedValue(entries);

      const result = await getTaskHistory(db, 'task-1');
      expect(result).toEqual(entries);
      expect(db.taskHistoryEntry.findMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('respects limit and offset', async () => {
      await getTaskHistory(db, 'task-1', { limit: 10, offset: 5 });
      expect(db.taskHistoryEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 5 })
      );
    });
  });
});
