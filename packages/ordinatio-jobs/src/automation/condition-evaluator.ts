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
  if (conditions.length === 0) {
    return { passed: true, trace: [] };
  }

  const trace: ConditionTrace[] = [];
  const groups = conditions.reduce((acc, condition) => {
    if (!acc.has(condition.groupIndex)) {
      acc.set(condition.groupIndex, []);
    }
    acc.get(condition.groupIndex)?.push(condition);
    return acc;
  }, new Map<number, ConditionInput[]>());

  // Evaluate each group (OR logic between groups)
  for (const groupConditions of groups.values()) {
    const groupPassed = await groupConditions.every(async (condition) => {
      const result = await evaluateSingleCondition(db, condition, data);
      trace.push(result);
      return result.passed;
    });

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

    // Evaluate condition based on comparator
    trace.passed = evaluateComparator(actualValue, condition.comparator, condition.value, condition.valueType);
  } catch (error) {
    trace.error = "Evaluation failed: " + error.message;
  }

  return trace;
}

// Additional helper to evaluate comparator logic
function evaluateComparator(actual: unknown, comparator: ConditionComparator, expected: string, valueType: ConditionValueType): boolean {
  // Implement the actual comparator logic here
  // Reduced complexity placeholder
  return actual == expected;
}

// Placeholder for getNestedValue function
function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  // Simplified example
  return data[path]; // Replace with actual nested retrieval logic
}
