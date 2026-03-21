// ===========================================
// TASK ENGINE — TEMPLATE TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  getTemplatesForTrigger,
  instantiateTemplate,
} from './task-templates';
import { TemplateNotFoundError } from './types';

function createMockDb() {
  return {
    taskTemplate: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    task: {
      create: vi.fn(),
    },
    taskDependency: {
      create: vi.fn(),
    },
    taskIntent: {
      create: vi.fn(),
    },
    intentDependency: {
      create: vi.fn(),
    },
  } as any;
}

describe('task-templates', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('createTemplate', () => {
    it('creates a template', async () => {
      db.taskTemplate.create.mockResolvedValue({ id: 'tpl-1', name: 'Onboarding' });

      const result = await createTemplate(db, {
        name: 'Onboarding',
        description: 'Client onboarding workflow',
        category: 'onboarding',
        definition: { tasks: [{ key: 't1', title: 'Welcome call' }] },
        createdBy: 'user-1',
      });

      expect(result.name).toBe('Onboarding');
      expect(db.taskTemplate.create).toHaveBeenCalled();
    });
  });

  describe('updateTemplate', () => {
    it('updates template fields', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({ id: 'tpl-1' });
      db.taskTemplate.update.mockResolvedValue({ id: 'tpl-1', name: 'Updated' });

      const result = await updateTemplate(db, 'tpl-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws TemplateNotFoundError', async () => {
      db.taskTemplate.findUnique.mockResolvedValue(null);
      await expect(updateTemplate(db, 'nope', { name: 'X' })).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('deleteTemplate', () => {
    it('deletes a template', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({ id: 'tpl-1' });
      db.taskTemplate.delete.mockResolvedValue({});

      await deleteTemplate(db, 'tpl-1');
      expect(db.taskTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
    });

    it('throws TemplateNotFoundError', async () => {
      db.taskTemplate.findUnique.mockResolvedValue(null);
      await expect(deleteTemplate(db, 'nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('getTemplate', () => {
    it('returns a template', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', name: 'Test' });
      const result = await getTemplate(db, 'tpl-1');
      expect(result.name).toBe('Test');
    });

    it('throws TemplateNotFoundError', async () => {
      db.taskTemplate.findUnique.mockResolvedValue(null);
      await expect(getTemplate(db, 'nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('getTemplates', () => {
    it('lists templates', async () => {
      db.taskTemplate.findMany.mockResolvedValue([{ id: 'tpl-1' }]);
      const result = await getTemplates(db);
      expect(result).toHaveLength(1);
    });

    it('filters by category', async () => {
      db.taskTemplate.findMany.mockResolvedValue([]);
      await getTemplates(db, { category: 'onboarding' });
      expect(db.taskTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: 'onboarding' } })
      );
    });
  });

  describe('getTemplatesForTrigger', () => {
    it('returns enabled trigger templates', async () => {
      db.taskTemplate.findMany.mockResolvedValue([{ id: 'tpl-1', triggerEntityType: 'Order' }]);
      const result = await getTemplatesForTrigger(db, 'Order');
      expect(result).toHaveLength(1);
      expect(db.taskTemplate.findMany).toHaveBeenCalledWith({
        where: { triggerEntityType: 'Order', triggerEnabled: true },
        take: 20,
      });
    });
  });

  describe('instantiateTemplate', () => {
    it('creates tasks from a template definition', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        definition: {
          tasks: [
            { key: 't1', title: 'Task 1', priority: 'HIGH' },
            { key: 't2', title: 'Task 2', dependsOn: ['t1'] },
          ],
        },
      });

      let taskCounter = 0;
      db.task.create.mockImplementation(() => {
        taskCounter++;
        return Promise.resolve({ id: `task-${taskCounter}`, title: `Task ${taskCounter}` });
      });
      db.taskDependency.create.mockResolvedValue({ id: 'dep-1' });

      const result = await instantiateTemplate(db, 'tpl-1', {
        entityType: 'Client',
        entityId: 'client-1',
        createdBy: 'user-1',
      });

      expect(result.taskIds).toHaveLength(2);
      expect(db.task.create).toHaveBeenCalledTimes(2);
      expect(db.taskDependency.create).toHaveBeenCalledTimes(1);
    });

    it('creates intents and wires dependencies', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        definition: {
          intents: [
            { key: 'i1', title: 'Outcome 1', successCriteria: { done: true } },
            { key: 'i2', title: 'Outcome 2', successCriteria: { sent: true }, dependsOn: ['i1'] },
          ],
          tasks: [{ key: 't1', title: 'Action', intentKey: 'i1' }],
        },
      });

      let intentCounter = 0;
      db.taskIntent.create.mockImplementation(() => {
        intentCounter++;
        return Promise.resolve({ id: `intent-${intentCounter}` });
      });
      db.intentDependency.create.mockResolvedValue({});
      db.task.create.mockResolvedValue({ id: 'task-1' });

      const result = await instantiateTemplate(db, 'tpl-1', { createdBy: 'user-1' });

      expect(result.intentIds).toHaveLength(2);
      expect(db.intentDependency.create).toHaveBeenCalledTimes(1);
      expect(result.taskIds).toHaveLength(1);
    });

    it('applies due date offsets', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        definition: {
          tasks: [{ key: 't1', title: 'Due in 7 days', dueDateOffset: 7 }],
        },
      });
      db.task.create.mockResolvedValue({ id: 'task-1' });

      await instantiateTemplate(db, 'tpl-1', { createdBy: 'user-1' });

      const call = db.task.create.mock.calls[0][0];
      expect(call.data.dueDate).toBeDefined();
      const dueDate = call.data.dueDate as Date;
      const diffDays = Math.round((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(6);
      expect(diffDays).toBeLessThanOrEqual(8);
    });

    it('maps assignee roles to user IDs', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        definition: {
          tasks: [{ key: 't1', title: 'Assigned task', assigneeRole: 'clothier' }],
        },
      });
      db.task.create.mockResolvedValue({ id: 'task-1' });

      await instantiateTemplate(db, 'tpl-1', {
        assigneeMap: { clothier: 'user-42' },
        createdBy: 'user-1',
      });

      const call = db.task.create.mock.calls[0][0];
      expect(call.data.assignedToId).toBe('user-42');
    });

    it('creates subtasks', async () => {
      db.taskTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        definition: {
          tasks: [{
            key: 'parent',
            title: 'Parent',
            subtasks: [{ key: 'child', title: 'Child' }],
          }],
        },
      });

      let counter = 0;
      db.task.create.mockImplementation(() => {
        counter++;
        return Promise.resolve({ id: `task-${counter}` });
      });

      const result = await instantiateTemplate(db, 'tpl-1', { createdBy: 'user-1' });
      expect(result.taskIds).toHaveLength(2);
      // Child should have parentTaskId set
      const childCall = db.task.create.mock.calls[1][0];
      expect(childCall.data.parentTaskId).toBe('task-1');
    });

    it('throws TemplateNotFoundError', async () => {
      db.taskTemplate.findUnique.mockResolvedValue(null);
      await expect(
        instantiateTemplate(db, 'nope', { createdBy: 'user-1' })
      ).rejects.toThrow(TemplateNotFoundError);
    });
  });
});
