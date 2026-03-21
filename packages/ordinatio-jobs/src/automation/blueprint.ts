// ===========================================
// ORDINATIO JOBS v2.0 — Automation Blueprints
// ===========================================
// Reusable templates for common automations.
// Agents and humans pick a blueprint, fill in
// variables, and get a fully configured
// automation with intent, DAG, and recovery.
// ===========================================

import type { AutomationDag } from './dag-types';
import type { AutomationIntent } from './intent-layer';
import type { RecoveryPlan } from '../types';

// ---- Blueprint Definition ----

/**
 * A reusable automation template.
 * Cross-industry — works for any app that provides the right DI services.
 */
export interface AutomationBlueprint {
  /** Unique blueprint identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of what this blueprint does. */
  description: string;
  /** Category for organization. */
  category: string;

  /** The intent template. */
  intent: AutomationIntent;

  /** Trigger template. */
  trigger: {
    eventType: string;
    configTemplate?: Record<string, string>;
  };

  /** Condition templates. */
  conditions?: Array<{
    field: string;
    comparator: string;
    valueTemplate: string;
    groupIndex: number;
  }>;

  /** DAG template (nodes may have {{variable}} placeholders in config). */
  dag: AutomationDag;

  /** Default recovery strategy. */
  recoveryStrategy: RecoveryPlan;

  /** Variables that must be filled in when instantiating. */
  requiredVariables: BlueprintVariable[];
}

export interface BlueprintVariable {
  /** Variable name (e.g., 'tagName', 'notifyEmail'). */
  name: string;
  /** Expected type. */
  type: 'string' | 'number' | 'boolean' | 'email' | 'select';
  /** Human-readable description. */
  description: string;
  /** Default value (optional). */
  defaultValue?: string;
  /** Options for 'select' type. */
  options?: string[];
}

// ---- Blueprint Registry ----

const blueprintRegistry = new Map<string, AutomationBlueprint>();

/**
 * Register a blueprint.
 */
export function registerBlueprint(blueprint: AutomationBlueprint): void {
  blueprintRegistry.set(blueprint.id, blueprint);
}

/**
 * Get a blueprint by ID.
 */
export function getBlueprint(id: string): AutomationBlueprint | undefined {
  return blueprintRegistry.get(id);
}

/**
 * Get all registered blueprints.
 */
export function getAllBlueprints(): AutomationBlueprint[] {
  return [...blueprintRegistry.values()];
}

/**
 * Get blueprints by category.
 */
export function getBlueprintsByCategory(category: string): AutomationBlueprint[] {
  return [...blueprintRegistry.values()].filter(b => b.category === category);
}

/**
 * Clear all blueprints (for testing).
 */
export function clearBlueprints(): void {
  blueprintRegistry.clear();
}

// ---- Blueprint Instantiation ----

/** Result of instantiating a blueprint. */
export interface BlueprintInstance {
  /** Resolved trigger. */
  trigger: { eventType: string; config?: Record<string, unknown> };
  /** Resolved conditions. */
  conditions: Array<{ field: string; comparator: string; value: string; groupIndex: number }>;
  /** Resolved DAG (variables replaced). */
  dag: AutomationDag;
  /** The intent (unchanged). */
  intent: AutomationIntent;
  /** Recovery strategy. */
  recoveryStrategy: RecoveryPlan;
}

/** Validation result for blueprint variables. */
export interface BlueprintValidation {
  valid: boolean;
  missingVariables: string[];
  invalidVariables: string[];
}

/**
 * Validate that all required variables are provided.
 */
export function validateBlueprintVariables(
  blueprint: AutomationBlueprint,
  variables: Record<string, string>,
): BlueprintValidation {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const v of blueprint.requiredVariables) {
    if (!(v.name in variables) && !v.defaultValue) {
      missing.push(v.name);
      continue;
    }

    const value = variables[v.name] ?? v.defaultValue ?? '';

    if (v.type === 'email' && value && !value.includes('@')) {
      invalid.push(`${v.name}: not a valid email`);
    }
    if (v.type === 'number' && value && isNaN(Number(value))) {
      invalid.push(`${v.name}: not a valid number`);
    }
    if (v.type === 'select' && v.options && !v.options.includes(value)) {
      invalid.push(`${v.name}: must be one of ${v.options.join(', ')}`);
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missingVariables: missing,
    invalidVariables: invalid,
  };
}

/**
 * Instantiate a blueprint with the provided variables.
 * Replaces {{variableName}} placeholders in the DAG config.
 */
export function instantiateBlueprint(
  blueprint: AutomationBlueprint,
  variables: Record<string, string>,
): BlueprintInstance {
  // Merge defaults
  const resolved: Record<string, string> = {};
  for (const v of blueprint.requiredVariables) {
    resolved[v.name] = variables[v.name] ?? v.defaultValue ?? '';
  }

  // Resolve trigger config
  const triggerConfig: Record<string, unknown> = {};
  if (blueprint.trigger.configTemplate) {
    for (const [key, template] of Object.entries(blueprint.trigger.configTemplate)) {
      triggerConfig[key] = resolveTemplate(template, resolved);
    }
  }

  // Resolve conditions
  const conditions = (blueprint.conditions ?? []).map(c => ({
    field: c.field,
    comparator: c.comparator,
    value: resolveTemplate(c.valueTemplate, resolved),
    groupIndex: c.groupIndex,
  }));

  // Resolve DAG (deep clone + replace templates in action configs)
  const dag = resolveDAG(blueprint.dag, resolved);

  return {
    trigger: {
      eventType: blueprint.trigger.eventType,
      config: Object.keys(triggerConfig).length > 0 ? triggerConfig : undefined,
    },
    conditions,
    dag,
    intent: blueprint.intent,
    recoveryStrategy: blueprint.recoveryStrategy,
  };
}

// ---- Internal ----

function resolveTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => variables[name] ?? `{{${name}}}`);
}

function resolveDAG(dag: AutomationDag, variables: Record<string, string>): AutomationDag {
  return {
    entryNodeId: dag.entryNodeId,
    edges: dag.edges.map(e => ({ ...e })),
    nodes: dag.nodes.map(node => {
      if (node.type !== 'action' || !node.action) return { ...node };
      return {
        ...node,
        action: {
          ...node.action,
          config: resolveConfig(node.action.config, variables),
        },
      };
    }),
  };
}

function resolveConfig(config: Record<string, unknown>, variables: Record<string, string>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      resolved[key] = resolveTemplate(value, variables);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
