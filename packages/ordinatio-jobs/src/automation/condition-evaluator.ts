// ===========================================
// CONDITION EVALUATOR
// ===========================================
// Evaluates automation conditions against trigger data.
// Supports AND/OR logic via groupIndex pattern:
// - Conditions with same groupIndex are AND'd together
// - Different groups are OR'd together (any group passing = overall pass)
// ===========================================

import { sanitizeTemplateValue, sanitizeForHtml } from './resilience/security';
import type { AutomationDb } from './db-types';
import type { ConditionComparator, ConditionValueType } from './db-types';

export interface ConditionInput {
  id: string;
  groupIndex: number;
  field: string;
  comparator: ConditionComparator;
  value: string;
  valueType: ConditionValueType;
}

export interface ConditionTrace {
  conditionId: string;
  field: string;
  comparator: ConditionComparator;
  expectedValue: string;
  actualValue: unknown;
  passed: boolean;
  error?: string;
}

export interface EvaluationResult {
  passed: boolean;
  trace: ConditionTrace[];
}

/**
 * Evaluate all conditions against the trigger data
 * Uses groupIndex for AND/OR logic
 */
export async function evaluateConditions(
  db: AutomationDb,
  conditions: ConditionInput[],
  data: Record<string, unknown>
): Promise<EvaluationResult> {
  const trace: ConditionTrace[] = [];

  if (conditions.length === 0) {
    return { passed: true, trace };
  }

  // Group conditions by groupIndex
  const groups = new Map<number, ConditionInput[]>();
  for (const condition of conditions) {
    const group = groups.get(condition.groupIndex) ?? [];
    group.push(condition);
    groups.set(condition.groupIndex, group);
  }

  // Evaluate each group (OR logic between groups)
  for (const [, groupConditions] of groups) {
    let groupPassed = true;

    // All conditions in a group must pass (AND logic)
    for (const condition of groupConditions) {
      const result = await evaluateSingleCondition(db, condition, data);
      trace.push(result);

      if (!result.passed) {
        groupPassed = false;
        // Continue to evaluate all conditions for complete trace
      }
    }

    // If any group passes, overall evaluation passes
    if (groupPassed) {
      return { passed: true, trace };
    }
  }

  // No group passed
  return { passed: false, trace };
}

/**
 * Evaluate a single condition
 */
async function evaluateSingleCondition(
  db: AutomationDb,
  condition: ConditionInput,
  data: Record<string, unknown>
): Promise<ConditionTrace> {
  const trace: ConditionTrace = {
    conditionId: condition.id,
    field: condition.field,
    comparator: condition.comparator,
    expectedValue: condition.value,
    actualValue: undefined,
    passed: false,
  };

  try {
    // Get the actual value from data using dot notation
    const actualValue = getNestedValue(data, condition.field);
    trace.actualValue = actualValue;

    // Convert value based on valueType
    const expectedValue = convertValue(condition.value, condition.valueType);

    // Special table lookup comparators
    if (condition.comparator === 'EXISTS_IN_TABLE' || condition.comparator === 'NOT_EXISTS_IN_TABLE') {
      trace.passed = await evaluateTableLookup(
        db,
        condition.comparator,
        actualValue,
        condition.value // value contains table.column reference
      );
      return trace;
    }

    // Standard comparators
    trace.passed = evaluateComparator(
      condition.comparator,
      actualValue,
      expectedValue
    );
  } catch (err) {
    trace.error = err instanceof Error ? err.message : 'Evaluation error';
    trace.passed = false;
  }

  return trace;
}

/**
 * Get nested value from object using dot notation
 * e.g., "email.from" -> data.email.from
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Convert string value to appropriate type
 */
function convertValue(value: string, valueType: ConditionValueType): unknown {
  switch (valueType) {
    case 'NUMBER':
      return parseFloat(value);
    case 'BOOLEAN':
      return value.toLowerCase() === 'true';
    case 'DATE':
      return new Date(value);
    case 'LIST':
      return value.split(',').map((v) => v.trim());
    case 'STRING':
    default:
      return value;
  }
}

/**
 * Evaluate standard comparators
 */
function evaluateComparator(
  comparator: ConditionComparator,
  actual: unknown,
  expected: unknown
): boolean {
  switch (comparator) {
    case 'EQUALS':
      return actual === expected;

    case 'NOT_EQUALS':
      return actual !== expected;

    case 'CONTAINS':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;

    case 'NOT_CONTAINS':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return !actual.toLowerCase().includes(expected.toLowerCase());
      }
      return true;

    case 'STARTS_WITH':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().startsWith(expected.toLowerCase());
      }
      return false;

    case 'ENDS_WITH':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().endsWith(expected.toLowerCase());
      }
      return false;

    case 'REGEX_MATCHES':
      if (typeof actual === 'string' && typeof expected === 'string') {
        try {
          const regex = new RegExp(expected, 'i');
          return regex.test(actual);
        } catch (err) {
          throw new Error(`Invalid regex pattern "${expected}": ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
      return false;

    case 'IS_EMPTY':
      return actual === null || actual === undefined || actual === '';

    case 'IS_NOT_EMPTY':
      return actual !== null && actual !== undefined && actual !== '';

    case 'GREATER_THAN':
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual > expected;
      }
      if (actual instanceof Date && expected instanceof Date) {
        return actual > expected;
      }
      return false;

    case 'LESS_THAN':
      if (typeof actual === 'number' && typeof expected === 'number') {
        return actual < expected;
      }
      if (actual instanceof Date && expected instanceof Date) {
        return actual < expected;
      }
      return false;

    case 'IN_LIST':
      if (Array.isArray(expected)) {
        return expected.includes(actual);
      }
      return false;

    case 'NOT_IN_LIST':
      if (Array.isArray(expected)) {
        return !expected.includes(actual);
      }
      return true;

    default:
      return false;
  }
}

/**
 * Evaluate EXISTS_IN_TABLE / NOT_EXISTS_IN_TABLE comparators
 * Value format: "table.column" (e.g., "clients.email", "contacts.email")
 */
async function evaluateTableLookup(
  db: AutomationDb,
  comparator: 'EXISTS_IN_TABLE' | 'NOT_EXISTS_IN_TABLE',
  actualValue: unknown,
  tableRef: string
): Promise<boolean> {
  if (typeof actualValue !== 'string' || !actualValue) {
    return comparator === 'NOT_EXISTS_IN_TABLE';
  }

  const [table, column] = tableRef.split('.');

  if (!table || !column) {
    throw new Error(`Invalid table reference: ${tableRef}`);
  }

  let exists = false;

  // Query the appropriate table
  switch (table.toLowerCase()) {
    case 'clients': {
      const client = await db.client.findFirst({
        where: { [column]: actualValue },
        select: { id: true },
      });
      exists = client !== null;
      break;
    }

    // Contact queries will work after Contact model is added
    // case 'contacts': {
    //   const contact = await prisma.contact.findFirst({
    //     where: { [column]: actualValue },
    //     select: { id: true },
    //   });
    //   exists = contact !== null;
    //   break;
    // }

    case 'users': {
      const user = await db.user.findFirst({
        where: { [column]: actualValue },
        select: { id: true },
      });
      exists = user !== null;
      break;
    }

    default:
      throw new Error(`Unsupported table for lookup: ${table}`);
  }

  return comparator === 'EXISTS_IN_TABLE' ? exists : !exists;
}

/**
 * Resolve template variables in a string
 * e.g., "Hello {{email.fromName}}" -> "Hello John"
 *
 * Values are sanitized to prevent injection attacks:
 * - Control characters removed
 * - Length limited to 10000 chars
 */
export function resolveTemplateVars(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const value = getNestedValue(data, key.trim());
    return sanitizeTemplateValue(value);
  });
}

/**
 * Resolve template variables with HTML escaping
 * Use this when the output will be rendered as HTML
 */
export function resolveTemplateVarsForHtml(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const value = getNestedValue(data, key.trim());
    return sanitizeForHtml(value);
  });
}
