// ===========================================
// TASK ENGINE — HISTORY (AUDIT TRAIL)
// ===========================================
// Records every field change on tasks for full auditability.
// ===========================================

import type { PrismaClient } from '@prisma/client';

/**
 * Record a history entry for a task.
 * Called from within mutations — non-critical (catch errors silently).
 */
export async function recordHistory(
  db: PrismaClient,
  taskId: string,
  action: string,
  field?: string,
  oldValue?: string | null,
  newValue?: string | null,
  userId?: string
): Promise<void> {
  await db.taskHistoryEntry.create({
    data: {
      taskId,
      action,
      field: field ?? null,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      userId: userId ?? null,
    },
  });
}

/**
 * Get the history of a task, ordered by most recent first.
 */
export async function getTaskHistory(
  db: PrismaClient,
  taskId: string,
  options?: { limit?: number; offset?: number }
) {
  return db.taskHistoryEntry.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}
