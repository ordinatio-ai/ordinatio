// ===========================================
// TASK ENGINE — CATEGORY CRUD
// ===========================================
// Business logic for managing task categories.
// Categories are global (shared across all users).
// Extracted from apps/web/src/services/task-category.service.ts.
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { TaskCategoryNotFoundError, TaskCategoryExistsError } from './types';

interface TaskCategory {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new task category.
 *
 * @throws {TaskCategoryExistsError} If a category with this name already exists
 */
export async function createCategory(db: PrismaClient, params: {
  name: string;
  color: string;
}): Promise<TaskCategory> {
  const { name, color } = params;

  const existing = await db.taskCategory.findUnique({
    where: { name },
  });

  if (existing) {
    throw new TaskCategoryExistsError(name);
  }

  return db.taskCategory.create({
    data: { name, color },
  });
}

/**
 * Update a task category.
 *
 * When the category name changes, all tasks whose title exactly matches
 * the old category name will have their titles updated to the new name.
 *
 * @throws {TaskCategoryNotFoundError} If category doesn't exist
 * @throws {TaskCategoryExistsError} If new name conflicts with existing category
 */
export async function updateCategory(
  db: PrismaClient,
  id: string,
  data: { name?: string; color?: string }
): Promise<{ category: TaskCategory; tasksUpdated: number }> {
  const category = await db.taskCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw new TaskCategoryNotFoundError(id);
  }

  // If name is changing, check for conflicts
  if (data.name && data.name !== category.name) {
    const existing = await db.taskCategory.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new TaskCategoryExistsError(data.name);
    }
  }

  const oldName = category.name;
  const newName = data.name;

  // Update category and tasks in a transaction
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.taskCategory.update({
      where: { id },
      data,
    });

    // If name changed, update tasks whose title matches old name
    let tasksUpdated = 0;
    if (newName && newName !== oldName) {
      const updateResult = await tx.task.updateMany({
        where: {
          categoryId: id,
          title: oldName,
        },
        data: {
          title: newName,
        },
      });
      tasksUpdated = updateResult.count;
    }

    return { category: updated, tasksUpdated };
  });

  return result;
}

/**
 * Delete a task category.
 *
 * Tasks linked to this category will have their categoryId set to null
 * (handled by onDelete: SetNull in schema).
 *
 * @throws {TaskCategoryNotFoundError} If category doesn't exist
 */
export async function deleteCategory(db: PrismaClient, id: string): Promise<void> {
  const category = await db.taskCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw new TaskCategoryNotFoundError(id);
  }

  await db.taskCategory.delete({
    where: { id },
  });
}

/**
 * Get all task categories ordered by name.
 */
export async function getCategories(db: PrismaClient): Promise<TaskCategory[]> {
  return db.taskCategory.findMany({
    take: 100,
    orderBy: { name: 'asc' },
  });
}

/**
 * Get categories with task counts.
 */
export async function getCategoriesWithCounts(db: PrismaClient) {
  return db.taskCategory.findMany({
    take: 100,
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { tasks: true },
      },
    },
  });
}

/**
 * Get a single category by ID.
 */
export async function getCategoryById(db: PrismaClient, id: string): Promise<TaskCategory | null> {
  return db.taskCategory.findUnique({
    where: { id },
  });
}

/**
 * Get a single category by name.
 */
export async function getCategoryByName(db: PrismaClient, name: string): Promise<TaskCategory | null> {
  return db.taskCategory.findUnique({
    where: { name },
  });
}
