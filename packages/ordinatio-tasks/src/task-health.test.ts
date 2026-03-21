// ===========================================
// TASK ENGINE — HEALTH TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOverdueTasks,
  getLongBlockedTasks,
  getApproachingDeadlines,
  getUnassignedTasks,
  getTasksWithoutCriteria,
  getDependencyRisks,
  getHealthSignals,
  getHealthSummary,
} from './task-health';

function createMockDb() {
  return {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    taskIntent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
}

describe('task-health', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('getOverdueTasks', () => {
    it('queries for past-due non-completed tasks', async () => {
      await getOverdueTasks(db);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.dueDate).toHaveProperty('lt');
      expect(call.where.status).toEqual({ not: 'COMPLETED' });
    });

    it('respects limit', async () => {
      await getOverdueTasks(db, { limit: 10 });
      expect(db.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });
  });

  describe('getLongBlockedTasks', () => {
    it('queries for tasks blocked > N days', async () => {
      await getLongBlockedTasks(db, 5);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('BLOCKED');
      expect(call.where.updatedAt).toHaveProperty('lt');
    });

    it('defaults to 3 days', async () => {
      await getLongBlockedTasks(db);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('BLOCKED');
    });
  });

  describe('getApproachingDeadlines', () => {
    it('queries for tasks due within N days', async () => {
      await getApproachingDeadlines(db, 7);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.dueDate).toHaveProperty('gte');
      expect(call.where.dueDate).toHaveProperty('lte');
    });
  });

  describe('getUnassignedTasks', () => {
    it('queries for tasks with no assignee', async () => {
      await getUnassignedTasks(db);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.assignedToId).toBeNull();
    });
  });

  describe('getTasksWithoutCriteria', () => {
    it('queries for tasks with null successCriteria', async () => {
      await getTasksWithoutCriteria(db);
      const call = db.task.findMany.mock.calls[0][0];
      expect(call.where.successCriteria).toBeNull();
    });
  });

  describe('getDependencyRisks', () => {
    it('returns tasks with incomplete deps approaching deadline', async () => {
      db.task.findMany.mockResolvedValue([
        {
          id: 't1',
          title: 'At risk',
          dueDate: new Date(),
          dependsOn: [
            { dependencyTask: { id: 'd1', title: 'Blocker', status: 'OPEN' } },
            { dependencyTask: { id: 'd2', title: 'Done', status: 'COMPLETED' } },
          ],
        },
      ]);

      const result = await getDependencyRisks(db);
      expect(result).toHaveLength(1);
      expect(result[0].blockingDependencies).toHaveLength(1);
      expect(result[0].blockingDependencies[0].id).toBe('d1');
    });
  });

  describe('getHealthSignals', () => {
    it('returns empty signals when all is healthy', async () => {
      const result = await getHealthSignals(db);
      expect(result).toHaveLength(0);
    });

    it('includes overdue signal', async () => {
      // First call is overdue
      db.task.findMany
        .mockResolvedValueOnce([{ id: 't1', title: 'Overdue' }]) // overdue
        .mockResolvedValueOnce([])  // longBlocked
        .mockResolvedValueOnce([])  // approaching
        .mockResolvedValueOnce([])  // unassigned
        .mockResolvedValueOnce([])  // noCriteria
        .mockResolvedValueOnce([]); // depRisks

      const result = await getHealthSignals(db);
      expect(result.some((s) => s.type === 'overdue')).toBe(true);
    });

    it('includes unsatisfied_intent signal', async () => {
      db.taskIntent.findMany.mockResolvedValue([{ id: 'i1', title: 'Unsatisfied' }]);

      const result = await getHealthSignals(db);
      expect(result.some((s) => s.type === 'unsatisfied_intent')).toBe(true);
    });
  });

  describe('getHealthSummary', () => {
    it('returns aggregate health metrics', async () => {
      const result = await getHealthSummary(db);
      expect(result).toHaveProperty('signals');
      expect(result).toHaveProperty('totalOpen');
      expect(result).toHaveProperty('totalOverdue');
      expect(result).toHaveProperty('totalBlocked');
      expect(result).toHaveProperty('totalUnsatisfiedIntents');
    });
  });
});
