// ===========================================
// @ordinatio/entities — CONFIDENCE-BASED BRANCHING
// ===========================================
// Human-in-the-loop when confidence < threshold.
// Low-confidence writes can trigger validation requests.
// ===========================================

import type { PrismaClient, MutationCallbacks } from '../types';
import type { ValidationCallbacks } from '../types';
import { knowledgeError } from '../errors';

/**
 * Should this write be validated?
 * Returns 'validate' when confidence is below threshold
 * AND there's an existing higher-confidence value.
 */
export function shouldBranch(
  newConfidence: number,
  existingConfidence?: number,
  threshold = 0.7,
): 'proceed' | 'validate' {
  if (newConfidence >= threshold) return 'proceed';
  if (existingConfidence != null && existingConfidence > newConfidence) return 'validate';
  return 'proceed';
}

/**
 * Set fields with branching logic.
 * When confidence is low and existing data has higher confidence,
 * requests human validation before writing.
 */
export async function setEntityFieldsWithBranching(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  fields: Record<string, unknown>,
  source: string,
  confidence: number,
  options?: {
    sourceId?: string;
    setBy?: string;
    branchingThreshold?: number;
    callbacks?: MutationCallbacks;
    validationCallbacks?: ValidationCallbacks;
  },
): Promise<{
  written: Array<{ key: string; entryId: string }>;
  skipped: string[];
  deferred: Array<{ key: string; reason: string }>;
  validationRequested: Array<{ key: string; value: unknown; confidence: number }>;
}> {
  const threshold = options?.branchingThreshold ?? 0.7;
  const written: Array<{ key: string; entryId: string }> = [];
  const skipped: string[] = [];
  const deferred: Array<{ key: string; reason: string }> = [];
  const validationRequested: Array<{ key: string; value: unknown; confidence: number }> = [];

  try {
    const fieldKeys = Object.keys(fields);
    const fieldDefs = await db.entityFieldDefinition.findMany({
      where: {
        entityType,
        key: { in: fieldKeys },
        isActive: true,
        status: 'approved',
      },
    });

    const defMap = new Map(fieldDefs.map((d) => [d.key, d]));

    // Get existing current entries for comparison
    const existingEntries = await db.knowledgeLedgerEntry.findMany({
      where: {
        entityType,
        entityId,
        fieldId: { in: fieldDefs.map((d) => d.id) },
        supersededAt: null,
      },
      include: { field: true },
    });

    const existingByKey = new Map(
      existingEntries.map((e) => [e.field.key, { confidence: Number(e.confidence), value: e.value }]),
    );

    for (const [key, value] of Object.entries(fields)) {
      const def = defMap.get(key);
      if (!def) {
        skipped.push(key);
        continue;
      }

      const existing = existingByKey.get(key);
      const decision = shouldBranch(confidence, existing?.confidence, threshold);

      if (decision === 'validate') {
        if (options?.validationCallbacks?.requestValidation) {
          try {
            const verdict = await options.validationCallbacks.requestValidation(
              entityType, entityId, key, value,
              confidence, existing?.value, existing?.confidence,
            );

            if (verdict === 'reject') {
              skipped.push(key);
              continue;
            }
            if (verdict === 'defer') {
              deferred.push({ key, reason: 'Validation deferred by reviewer' });
              validationRequested.push({ key, value, confidence });
              continue;
            }
            // 'accept' — fall through to write
          } catch (error) {
            const err = knowledgeError('KNOWLEDGE_344', { entityType, entityId, key, error: String(error) });
            console.error(`[${err.ref}] ${err.description}`, error);
            deferred.push({ key, reason: 'Validation callback failed' });
            validationRequested.push({ key, value, confidence });
            continue;
          }
        } else {
          // No validation callback — defer
          deferred.push({ key, reason: 'Low confidence, no validator available' });
          validationRequested.push({ key, value, confidence });
          continue;
        }
      }

      // Write the field
      await db.knowledgeLedgerEntry.updateMany({
        where: {
          fieldId: def.id,
          entityType,
          entityId,
          supersededAt: null,
        },
        data: { supersededAt: new Date() },
      });

      const entry = await db.knowledgeLedgerEntry.create({
        data: {
          fieldId: def.id,
          entityType,
          entityId,
          value: value as never,
          confidence,
          source,
          sourceId: options?.sourceId ?? null,
          setBy: options?.setBy ?? null,
        },
      });

      written.push({ key, entryId: entry.id });
    }

    if (written.length > 0) {
      try {
        await options?.callbacks?.logActivity?.(
          'KNOWLEDGE_VALUE_SET',
          `${written.length} knowledge field(s) set on ${entityType} ${entityId}`,
          entityType === 'client' ? { clientId: entityId } : undefined,
        );
      } catch {
        // Best-effort
      }
    }

    return { written, skipped, deferred, validationRequested };
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_343', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}
