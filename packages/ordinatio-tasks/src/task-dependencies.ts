// ===========================================
// TASK ENGINE — DEPENDENCIES (WORK GRAPH)
// ===========================================
// Manage task-to-task dependencies with cycle detection.
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { TaskNotFoundError, CircularDependencyError } from './types';
import type { DependencyType, DependencyCheckResult } from './types';
import { recordHistory } from './task-history';

/**
 * Add a dependency: dependentTask depends on dependencyTask.
 * B (dependent) cannot proceed until A (dependency) finishes.
 *
 * @throws {TaskNotFoundError}
 * @throws {CircularDependencyError}
 */
export async function addDependency(
  db: PrismaClient,
  dependentTaskId: string,
  dependencyTaskId: string,
  type: DependencyType = 'FINISH_START'
): Promise<{ id: string }> {
  if (dependentTaskId === dependencyTaskId) {
    throw new CircularDependencyError(dependentTaskId, dependencyTaskId);
  }

  // Verify both tasks exist
  const [dependent, dependency] = await Promise.all([
    db.task.findUnique({ where: { id: dependentTaskId }, select: { id: true } }),
    db.task.findUnique({ where: { id: dependencyTaskId }, select: { id: true } }),
  ]);
  if (!dependent) throw new TaskNotFoundError(dependentTaskId);
  if (!dependency) throw new TaskNotFoundError(dependencyTaskId);

  // Check for circular dependency
  const isCircular = await detectCircularDependency(db, dependentTaskId, dependencyTaskId);
  if (isCircular) {
    throw new CircularDependencyError(dependentTaskId, dependencyTaskId);
  }

  const dep = await db.taskDependency.create({
    data: {
      dependentTaskId,
      dependencyTaskId,
      type,
    },
  });

  await recordHistory(db, dependentTaskId, 'dependency_added', 'dependsOn', null, dependencyTaskId).catch(() => {});

  return { id: dep.id };
}

/**
 * Remove a dependency between two tasks.
 */
export async function removeDependency(
  db: PrismaClient,
  dependentTaskId: string,
  dependencyTaskId: string
): Promise<void> {
  await db.taskDependency.deleteMany({
    where: { dependentTaskId, dependencyTaskId },
  });

  await recordHistory(db, dependentTaskId, 'dependency_removed', 'dependsOn', dependencyTaskId, null).catch(() => {});
}

/**
 * Get all tasks that a task depends on.
 */
export async function getDependencies(db: PrismaClient, taskId: string) {
  return db.taskDependency.findMany({
    where: { dependentTaskId: taskId },
    include: {
      dependencyTask: {
        select: { id: true, title: true, status: true, priority: true },
      },
    },
  });
}

/**
 * Get all tasks that depend on this task.
 */
export async function getDependents(db: PrismaClient, taskId: string) {
  return db.taskDependency.findMany({
    where: { dependencyTaskId: taskId },
    include: {
      dependentTask: {
        select: { id: true, title: true, status: true, priority: true },
      },
    },
  });
}

/**
 * Check if all hard dependencies for a task are satisfied.
 */
export async function checkDependenciesMet(
  db: PrismaClient,
  taskId: string
): Promise<DependencyCheckResult> {
  const deps = await db.taskDependency.findMany({
    where: { dependentTaskId: taskId },
    include: {
      dependencyTask: {
        select: { id: true, title: true, status: true },
      },
    },
  });

  const blocking: DependencyCheckResult['blocking'] = [];

  for (const dep of deps) {
    if (dep.type === 'SOFT') continue; // Soft deps are advisory

    const isComplete = dep.dependencyTask.status === 'COMPLETED';

    if (dep.type === 'FINISH_START' && !isComplete) {
      blocking.push({
        id: dep.dependencyTask.id,
        title: dep.dependencyTask.title,
        status: dep.dependencyTask.status,
        type: dep.type as DependencyType,
      });
    }
    // START_START and FINISH_FINISH: check if dependency has at least started
    if (dep.type === 'START_START' && dep.dependencyTask.status === 'OPEN') {
      blocking.push({
        id: dep.dependencyTask.id,
        title: dep.dependencyTask.title,
        status: dep.dependencyTask.status,
        type: dep.type as DependencyType,
      });
    }
    if (dep.type === 'FINISH_FINISH' && !isComplete) {
      blocking.push({
        id: dep.dependencyTask.id,
        title: dep.dependencyTask.title,
        status: dep.dependencyTask.status,
        type: dep.type as DependencyType,
      });
    }
  }

  return { met: blocking.length === 0, blocking };
}

/**
 * Get blocking dependencies for a task.
 */
export async function getBlockingDependencies(db: PrismaClient, taskId: string) {
  const result = await checkDependenciesMet(db, taskId);
  return result.blocking;
}

/**
 * Detect circular dependency by walking the dependency graph.
 * Returns true if adding (dependentTaskId depends on newDependencyId)
 * would create a cycle.
 */
export async function detectCircularDependency(
  db: PrismaClient,
  dependentTaskId: string,
  newDependencyId: string
): Promise<boolean> {
  // Walk upstream from newDependencyId — if we reach dependentTaskId, it's circular
  const visited = new Set<string>();
  const queue = [newDependencyId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === dependentTaskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find what "current" depends on (current's dependencies)
    const deps = await db.taskDependency.findMany({
      where: { dependentTaskId: current },
      select: { dependencyTaskId: true },
    });

    for (const dep of deps) {
      if (!visited.has(dep.dependencyTaskId)) {
        queue.push(dep.dependencyTaskId);
      }
    }
  }

  return false;
}
