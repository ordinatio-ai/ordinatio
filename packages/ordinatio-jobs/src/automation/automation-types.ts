// ===========================================
// AUTOMATION TYPES
// ===========================================
// Type definitions for automation CRUD operations.
// Shared between automation-queries.ts and automation-crud.ts.
// ===========================================
// DEPENDS ON: ./types (local package types)
// USED BY: automation-queries.ts, automation-crud.ts
// ===========================================

import type {
  AutomationModule,
  TriggerEventType,
  ConditionComparator,
  ConditionValueType,
  AutomationActionType,
} from './db-types';

export interface CreateTriggerInput {
  eventType: TriggerEventType;
  config?: Record<string, unknown>;
}

export interface CreateConditionInput {
  groupIndex?: number;
  field: string;
  comparator: ConditionComparator;
  value: string;
  valueType?: ConditionValueType;
  sortOrder?: number;
}

export interface CreateActionInput {
  actionType: AutomationActionType;
  sortOrder?: number;
  config?: Record<string, unknown>;
  useOutputFrom?: number | null;
  continueOnError?: boolean;
}

export interface CreateAutomationInput {
  name: string;
  description?: string | null;
  sourceModule: AutomationModule;
  isActive?: boolean;
  priority?: number;
  maxExecutionsPerHour?: number | null;
  cooldownSeconds?: number;
  createdBy: string;
  trigger?: CreateTriggerInput;
  conditions?: CreateConditionInput[];
  actions?: CreateActionInput[];
}

export interface UpdateAutomationInput {
  name?: string;
  description?: string | null;
  sourceModule?: AutomationModule;
  isActive?: boolean;
  priority?: number;
  maxExecutionsPerHour?: number | null;
  cooldownSeconds?: number;
  trigger?: CreateTriggerInput;
  conditions?: CreateConditionInput[];
  actions?: CreateActionInput[];
}

export interface AutomationListItem {
  id: string;
  name: string;
  description: string | null;
  sourceModule: AutomationModule;
  isActive: boolean;
  priority: number;
  maxExecutionsPerHour: number | null;
  cooldownSeconds: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  trigger: {
    id: string;
    eventType: TriggerEventType;
    config: unknown;
  } | null;
  _count: {
    conditions: number;
    actions: number;
    executions: number;
  };
}

export interface AutomationListResult {
  automations: AutomationListItem[];
  total: number;
}
