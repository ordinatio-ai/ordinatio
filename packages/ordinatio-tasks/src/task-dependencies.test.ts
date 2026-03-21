// ===========================================
// TASK ENGINE — DEPENDENCY TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addDependency,
  removeDependency,
  getDependencies,
  getDependents,
  checkDependenciesMet,
  getBlockingDependencies,
  detectCircularDependency,
} from './task-dependencies';
import { TaskNotFoundError, CircularDependencyError } from './types';

function createMockDb() {
  return {
    task: {
      findUnique: vi.fn(),
    },
    taskDependency: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    taskHistoryEntry: {
      create: vi.fn(),
    },
  } as any;
}

describe('task-dependencies', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('addDependency', () => {
    it('creates a dependency link', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'task-1' });
      db.taskDependency.create.mockResolvedValue({ id: 'dep-1' });

      const result = await addDependency(db, 'task-a', 'task-b');
      expect(result).toEqual({ id: 'dep-1' });
      expect(db.taskDependency.create).toHaveBeenCalledWith({
        data: {
          dependentTaskId: 'task-a',
          dependencyTaskId: 'task-b',
          type: 'FINISH_START',
        },
      });
    });

    it('accepts custom dependency type', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'x' });
      db.taskDependency.create.mockResolvedValue({ id: 'dep-2' });

      await addDependency(db, 'a', 'b', 'SOFT');
      expect(db.taskDependency.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'SOFT' }),
      });
    });

    it('throws CircularDependencyError for self-reference', async () => {
      await expect(addDependency(db, 'task-1', 'task-1')).rejects.toThrow(CircularDependencyError);
    });

    it('throws TaskNotFoundError when dependent task missing', async () => {
      db.task.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'b' });
      await expect(addDependency(db, 'missing', 'b')).rejects.toThrow(TaskNotFoundError);
    });

    it('throws TaskNotFoundError when dependency task missing', async () => {
      db.task.findUnique.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce(null);
      await expect(addDependency(db, 'a', 'missing')).rejects.toThrow(TaskNotFoundError);
    });

    it('detects circular dependency (A→B, trying to add B→A)', async () => {
      db.task.findUnique.mockResolvedValue({ id: 'x' });
      // A depends on B already — so adding B→A creates cycle
      // detectCircularDependency('task-b', 'task-a') walks from task-a
      // Query: what does task-a depend on? → task-b (cycle found!)
      db.taskDependency.findMany.mockResolvedValueOnce([
        { dependencyTaskId: 'task-b' },
      ]);

      await expect(addDependency(db, 'task-b', 'task-a')).rejects.toThrow(CircularDependencyError);
    });
  });

  describe('removeDependency', () => {
    it('removes a dependency link', async () => {
      db.taskDependency.deleteMany.mockResolvedValue({ count: 1 });
      await removeDependency(db, 'a', 'b');
      expect(db.taskDependency.deleteMany).toHaveBeenCalledWith({
        where: { dependentTaskId: 'a', dependencyTaskId: 'b' },
      });
    });
  });

  describe('getDependencies', () => {
    it('returns tasks this task depends on', async () => {
      const deps = [{ dependencyTask: { id: 'dep-1', title: 'D', status: 'OPEN' } }];
      db.taskDependency.findMany.mockResolvedValue(deps);

      const result = await getDependencies(db, 'task-1');
      expect(result).toEqual(deps);
    });
  });

  describe('getDependents', () => {
    it('returns tasks that depend on this task', async () => {
      const deps = [{ dependentTask: { id: 'child-1', title: 'C', status: 'OPEN' } }];
      db.taskDependency.findMany.mockResolvedValue(deps);

      const result = await getDependents(db, 'task-1');
      expect(result).toEqual(deps);
    });
  });

  describe('checkDependenciesMet', () => {
    it('returns met=true when no dependencies', async () => {
      db.taskDependency.findMany.mockResolvedValue([]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(true);
      expect(result.blocking).toHaveLength(0);
    });

    it('returns met=true when all FINISH_START deps are COMPLETED', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'FINISH_START', dependencyTask: { id: 'd1', title: 'D1', status: 'COMPLETED' } },
      ]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(true);
    });

    it('returns met=false when FINISH_START dep is OPEN', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'FINISH_START', dependencyTask: { id: 'd1', title: 'Blocker', status: 'OPEN' } },
      ]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(false);
      expect(result.blocking).toHaveLength(1);
      expect(result.blocking[0].id).toBe('d1');
    });

    it('ignores SOFT dependencies', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'SOFT', dependencyTask: { id: 'd1', title: 'Soft', status: 'OPEN' } },
      ]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(true);
    });

    it('checks START_START — blocks only when dep is OPEN', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'START_START', dependencyTask: { id: 'd1', title: 'SS', status: 'OPEN' } },
      ]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(false);
    });

    it('START_START passes when dep is IN_PROGRESS', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'START_START', dependencyTask: { id: 'd1', title: 'SS', status: 'IN_PROGRESS' } },
      ]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(true);
    });

    it('FINISH_FINISH blocks when dep is not COMPLETED', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'FINISH_FINISH', dependencyTask: { id: 'd1', title: 'FF', status: 'IN_PROGRESS' } },
      ]);
      const result = await checkDependenciesMet(db, 'task-1');
      expect(result.met).toBe(false);
    });
  });

  describe('getBlockingDependencies', () => {
    it('returns only blocking dependencies', async () => {
      db.taskDependency.findMany.mockResolvedValue([
        { type: 'FINISH_START', dependencyTask: { id: 'd1', title: 'Blocker', status: 'OPEN' } },
        { type: 'SOFT', dependencyTask: { id: 'd2', title: 'Soft', status: 'OPEN' } },
      ]);
      const result = await getBlockingDependencies(db, 'task-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('d1');
    });
  });

  describe('detectCircularDependency', () => {
    it('returns false for no cycle', async () => {
      // newDependencyId has no deps of its own
      db.taskDependency.findMany.mockResolvedValue([]);
      const result = await detectCircularDependency(db, 'a', 'b');
      expect(result).toBe(false);
    });

    it('returns true for direct cycle', async () => {
      // b depends on a → adding a→b creates cycle
      db.taskDependency.findMany.mockResolvedValueOnce([
        { dependencyTaskId: 'a' },
      ]);
      const result = await detectCircularDependency(db, 'a', 'b');
      expect(result).toBe(true);
    });

    it('returns true for transitive cycle', async () => {
      // c→b→a. Adding a→c would create cycle.
      db.taskDependency.findMany
        .mockResolvedValueOnce([{ dependencyTaskId: 'b' }])   // c depends on b
        .mockResolvedValueOnce([{ dependencyTaskId: 'a' }]);  // b depends on a

      const result = await detectCircularDependency(db, 'a', 'c');
      expect(result).toBe(true);
    });
  });
});
