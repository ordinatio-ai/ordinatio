// ===========================================
// @ordinatio/entities — THE OBSERVER (CONSTRAINTS)
// ===========================================
// Field definitions can declare constraints on other fields.
// Violations emit KNOWLEDGE_DISSONANCE events.
// Advisory only — writes are NOT blocked.
// ===========================================

import type { PrismaClient } from '../types';
import type { FieldConstraint, ConstraintViolation, ObserverCallbacks } from '../types';
import { knowledgeError } from '../errors';

/**
 * Evaluate a single constraint against current entity state.
 */
export function evaluateConstraint(
  constraint: FieldConstraint,
  entityFields: Record<string, unknown>,
): ConstraintViolation | null {
  const targetValue = entityFields[constraint.targetField];
  if (targetValue === undefined || targetValue === null) return null;

  let violated = false;

  switch (constraint.operator) {
    case 'not_in':
      violated = Array.isArray(constraint.values) && constraint.values.includes(targetValue);
      break;
    case 'in':
      violated = Array.isArray(constraint.values) && !constraint.values.includes(targetValue);
      break;
    case 'not_equal':
      violated = targetValue === constraint.value;
      break;
    case 'less_than':
      violated = typeof targetValue === 'number' && typeof constraint.value === 'number'
        && targetValue >= constraint.value;
      break;
    case 'greater_than':
      violated = typeof targetValue === 'number' && typeof constraint.value === 'number'
        && targetValue <= constraint.value;
      break;
    case 'regex':
      if (typeof targetValue === 'string' && constraint.pattern) {
        try {
          violated = !new RegExp(constraint.pattern).test(targetValue);
        } catch (error) {
          const err = knowledgeError('KNOWLEDGE_352', { pattern: constraint.pattern, error: String(error) });
          console.error(`[${err.ref}] ${err.description}`, error);
          return null;
        }
      }
      break;
  }

  if (!violated) return null;

  return {
    fieldKey: constraint.targetField,
    constraintField: constraint.targetField,
    operator: constraint.operator,
    actualValue: targetValue,
    constraintValue: constraint.values ?? constraint.value ?? constraint.pattern,
    message: constraint.message,
    severity: constraint.severity,
  };
}

/**
 * Check all constraints for an entity by reading field definitions with constraints.
 */
export async function checkConstraints(
  db: PrismaClient,
  entityType: string,
  entityId: string,
): Promise<ConstraintViolation[]> {
  try {
    // Get field definitions — filter for constraints in JS (Prisma types may not include column yet)
    const allFieldDefs = await db.entityFieldDefinition.findMany({
      where: {
        entityType,
        isActive: true,
      },
    });

    const fieldDefs = allFieldDefs.filter(
      (fd: Record<string, unknown>) => fd.constraints != null,
    );

    if (fieldDefs.length === 0) return [];

    // Get current entity field values
    const entries = await db.knowledgeLedgerEntry.findMany({
      where: { entityType, entityId, supersededAt: null },
      include: { field: true },
    });

    const entityFields: Record<string, unknown> = {};
    for (const entry of entries) {
      entityFields[entry.field.key] = entry.value;
    }

    const violations: ConstraintViolation[] = [];

    for (const fieldDef of fieldDefs) {
      const constraints = (fieldDef as Record<string, unknown>).constraints as FieldConstraint[] | null;
      if (!constraints || !Array.isArray(constraints)) continue;

      for (const constraint of constraints) {
        const violation = evaluateConstraint(constraint, entityFields);
        if (violation) {
          violations.push(violation);
        }
      }
    }

    return violations;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_350', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    throw error;
  }
}

/**
 * Fire observers after setEntityFields — check constraints and notify.
 * Best-effort: never blocks the original write.
 */
export async function fireObservers(
  db: PrismaClient,
  entityType: string,
  entityId: string,
  writtenFields: string[],
  callbacks?: ObserverCallbacks,
): Promise<ConstraintViolation[]> {
  try {
    const violations = await checkConstraints(db, entityType, entityId);

    if (violations.length > 0 && callbacks?.onConstraintViolation) {
      try {
        await callbacks.onConstraintViolation(entityType, entityId, violations);
      } catch (error) {
        const err = knowledgeError('KNOWLEDGE_351', { entityType, entityId, error: String(error) });
        console.error(`[${err.ref}] ${err.description}`, error);
        // Best-effort — don't propagate
      }
    }

    if (violations.length > 0) {
      try {
        await callbacks?.emitEvent?.('KNOWLEDGE_DISSONANCE', {
          entityType,
          entityId,
          violations,
          triggeredBy: writtenFields,
        });
      } catch {
        // Best-effort
      }
    }

    return violations;
  } catch (error) {
    const err = knowledgeError('KNOWLEDGE_350', { entityType, entityId, error: String(error) });
    console.error(`[${err.ref}] ${err.description}`, error);
    return []; // Don't propagate observer failures
  }
}
