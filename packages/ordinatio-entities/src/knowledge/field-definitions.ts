// ===========================================
// @ordinatio/entities — FIELD DEFINITIONS
// ===========================================
// CRUD for EntityFieldDefinition records.
// ===========================================

import { Prisma } from '@prisma/client';
import type { PrismaClient, MutationCallbacks } from '../types';
import { knowledgeError } from '../errors';
import type { CreateFieldDefinitionInput, UpdateFieldDefinitionInput } from './schemas';

export async function getFieldDefinitions(db: PrismaClient, entityType?: string, status?: string) {
  try {
    const fields = await db.entityFieldDefinition.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(status ? { status } : { status: { not: 'dismissed' } }),
        isActive: true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });

    const grouped: Record<string, typeof fields> = {};
    for (const field of fields) {
      if (!grouped[field.category]) grouped[field.category] = [];
      grouped[field.category].push(field);
    }

    return { fields, grouped };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_300', { entityType, status, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

export async function createFieldDefinition(
  db: PrismaClient,
  input: CreateFieldDefinitionInput,
  callbacks?: MutationCallbacks,
) {
  try {
    const field = await db.entityFieldDefinition.create({
      data: {
        entityType: input.entityType,
        key: input.key,
        label: input.label,
        dataType: input.dataType,
        category: input.category,
        enumOptions: input.enumOptions ?? Prisma.JsonNull,
        extractionHint: input.extractionHint ?? null,
        sortOrder: input.sortOrder ?? 0,
        status: 'approved',
      },
    });

    try {
      await callbacks?.logActivity?.(
        'KNOWLEDGE_FIELD_CREATED',
        `Knowledge field "${input.label}" created for ${input.entityType}`,
      );
    } catch {
      // Best-effort
    }

    return field;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_301', { input, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

export async function updateFieldDefinition(
  db: PrismaClient,
  id: string,
  input: UpdateFieldDefinitionInput,
  callbacks?: MutationCallbacks,
) {
  try {
    const existing = await db.entityFieldDefinition.findUnique({ where: { id } });
    if (!existing) return null;

    const field = await db.entityFieldDefinition.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.enumOptions !== undefined ? { enumOptions: input.enumOptions ?? Prisma.JsonNull } : {}),
        ...(input.extractionHint !== undefined ? { extractionHint: input.extractionHint } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.mergedIntoId !== undefined ? { mergedIntoId: input.mergedIntoId } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    if (input.status && input.status !== existing.status) {
      const actionMap: Record<string, string> = {
        approved: 'KNOWLEDGE_FIELD_APPROVED',
        dismissed: 'KNOWLEDGE_FIELD_DISMISSED',
      };
      const action = actionMap[input.status];
      if (action) {
        try {
          await callbacks?.logActivity?.(action, `Knowledge field "${existing.label}" ${input.status}`);
        } catch {
          // Best-effort
        }
      }
    }

    return field;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_302', { id, input, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

export async function getFieldDefinitionById(db: PrismaClient, id: string) {
  return db.entityFieldDefinition.findUnique({ where: { id } });
}
