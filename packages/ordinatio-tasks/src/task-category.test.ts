// ===========================================
// TASK ENGINE — CATEGORY TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  getCategories,
  getCategoriesWithCounts,
  getCategoryById,
  getCategoryByName,
} from './task-category';
import { TaskCategoryNotFoundError, TaskCategoryExistsError } from './types';

function createMockDb() {
  return {
    taskCategory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    task: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: any) => any) =>
      fn({
        taskCategory: {
          update: vi.fn().mockResolvedValue({ id: 'cat-1', name: 'Updated', color: '#000', createdAt: new Date(), updatedAt: new Date() }),
        },
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      })
    ),
  } as any;
}

describe('task-category', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe('createCategory', () => {
    it('creates a new category', async () => {
      db.taskCategory.findUnique.mockResolvedValue(null);
      const created = { id: 'cat-1', name: 'Urgent', color: '#EF4444', createdAt: new Date(), updatedAt: new Date() };
      db.taskCategory.create.mockResolvedValue(created);

      const result = await createCategory(db, { name: 'Urgent', color: '#EF4444' });

      expect(result).toEqual(created);
      expect(db.taskCategory.create).toHaveBeenCalledWith({
        data: { name: 'Urgent', color: '#EF4444' },
      });
    });

    it('throws TaskCategoryExistsError for duplicate name', async () => {
      db.taskCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Urgent' });

      await expect(
        createCategory(db, { name: 'Urgent', color: '#EF4444' })
      ).rejects.toThrow(TaskCategoryExistsError);
    });
  });

  describe('updateCategory', () => {
    it('updates category and returns task count', async () => {
      db.taskCategory.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'Old Name', color: '#000' })
        .mockResolvedValueOnce(null); // No conflict

      const result = await updateCategory(db, 'cat-1', { name: 'Updated', color: '#FFF' });

      expect(result.category.name).toBe('Updated');
      expect(result.tasksUpdated).toBe(2);
    });

    it('throws TaskCategoryNotFoundError when not found', async () => {
      db.taskCategory.findUnique.mockResolvedValue(null);

      await expect(
        updateCategory(db, 'nonexistent', { name: 'New' })
      ).rejects.toThrow(TaskCategoryNotFoundError);
    });

    it('throws TaskCategoryExistsError for name conflict', async () => {
      db.taskCategory.findUnique
        .mockResolvedValueOnce({ id: 'cat-1', name: 'Old Name', color: '#000' })
        .mockResolvedValueOnce({ id: 'cat-2', name: 'Taken Name' }); // Conflict

      await expect(
        updateCategory(db, 'cat-1', { name: 'Taken Name' })
      ).rejects.toThrow(TaskCategoryExistsError);
    });
  });

  describe('deleteCategory', () => {
    it('deletes an existing category', async () => {
      db.taskCategory.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Old' });
      db.taskCategory.delete.mockResolvedValue({});

      await deleteCategory(db, 'cat-1');

      expect(db.taskCategory.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });

    it('throws TaskCategoryNotFoundError when not found', async () => {
      db.taskCategory.findUnique.mockResolvedValue(null);

      await expect(deleteCategory(db, 'nonexistent')).rejects.toThrow(
        TaskCategoryNotFoundError
      );
    });
  });

  describe('getCategories', () => {
    it('returns all categories ordered by name', async () => {
      const categories = [
        { id: 'cat-1', name: 'A', color: '#000' },
        { id: 'cat-2', name: 'B', color: '#FFF' },
      ];
      db.taskCategory.findMany.mockResolvedValue(categories);

      const result = await getCategories(db);

      expect(result).toEqual(categories);
      expect(db.taskCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' }, take: 100 })
      );
    });
  });

  describe('getCategoriesWithCounts', () => {
    it('returns categories with task counts', async () => {
      const categories = [
        { id: 'cat-1', name: 'A', color: '#000', _count: { tasks: 5 } },
      ];
      db.taskCategory.findMany.mockResolvedValue(categories);

      const result = await getCategoriesWithCounts(db);

      expect(result).toEqual(categories);
      expect(db.taskCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { _count: { select: { tasks: true } } },
        })
      );
    });
  });

  describe('getCategoryById', () => {
    it('returns category when found', async () => {
      const category = { id: 'cat-1', name: 'Test', color: '#000' };
      db.taskCategory.findUnique.mockResolvedValue(category);

      const result = await getCategoryById(db, 'cat-1');

      expect(result).toEqual(category);
    });

    it('returns null when not found', async () => {
      db.taskCategory.findUnique.mockResolvedValue(null);

      const result = await getCategoryById(db, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getCategoryByName', () => {
    it('returns category when found by name', async () => {
      const category = { id: 'cat-1', name: 'Urgent', color: '#EF4444' };
      db.taskCategory.findUnique.mockResolvedValue(category);

      const result = await getCategoryByName(db, 'Urgent');

      expect(result).toEqual(category);
      expect(db.taskCategory.findUnique).toHaveBeenCalledWith({
        where: { name: 'Urgent' },
      });
    });
  });
});
