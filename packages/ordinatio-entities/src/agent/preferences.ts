// ===========================================
// @ordinatio/entities — AGENT PREFERENCES
// ===========================================
// CRUD for agent preferences (per-org and per-user).
// ===========================================

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '../types';
import { agentKnowledgeError } from '../errors';
import type { GetPreferencesInput, SetPreferenceInput } from './schemas';

/**
 * Get preferences for an entity, optionally filtered by userId.
 * Returns org-wide (userId=null) + user-specific, sorted by priority desc.
 */
export async function getPreferences(db: PrismaClient, input: GetPreferencesInput) {
  const { entity, userId, field } = input;

  const where: Record<string, unknown> = {
    entity,
    isActive: true,
  };

  if (field) where.field = field;

  if (userId) {
    where.OR = [{ userId: null }, { userId }];
  } else {
    where.userId = null;
  }

  return db.agentPreference.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function setPreference(db: PrismaClient, input: SetPreferenceInput) {
  const existing = await db.agentPreference.findFirst({
    where: {
      entity: input.entity,
      field: input.field,
      userId: input.userId ?? null,
    },
  });

  if (existing) {
    return db.agentPreference.update({
      where: { id: existing.id },
      data: {
        value: input.value,
        label: input.label,
        conditions: (input.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        priority: input.priority,
      },
    });
  }

  return db.agentPreference.create({
    data: {
      entity: input.entity,
      field: input.field,
      value: input.value,
      label: input.label,
      conditions: (input.conditions as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      userId: input.userId ?? null,
      priority: input.priority,
    },
  });
}

export async function deletePreference(db: PrismaClient, id: string) {
  const existing = await db.agentPreference.findUnique({ where: { id } });
  if (!existing) {
    throw agentKnowledgeError('AGENTKNOW_408', { id });
  }

  return db.agentPreference.delete({ where: { id } });
}
