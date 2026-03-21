// ===========================================
// @ordinatio/entities — SHARED TYPES
// ===========================================

import type { PrismaClient } from '@prisma/client';

export type { PrismaClient };

/**
 * Callbacks injected by the consuming app for side effects.
 * All optional — package works without them.
 */
export interface MutationCallbacks {
  logActivity?: (action: string, description: string, data?: Record<string, unknown>) => Promise<void>;
  emitEvent?: (type: string, data: unknown) => Promise<void>;
}

/**
 * Provides seed data for the agent knowledge base.
 * Passed by the app so the package doesn't need app-specific data.
 */
export interface SeedDataProvider {
  getKnowledgeSeedData?: () => Array<{
    entity: string;
    field: string;
    value: string;
    label: string;
    aliases: string[];
    category: string | null;
    metadata: Record<string, unknown> | null;
    sortOrder: number;
    source: string;
  }>;
}

/**
 * Callback for writing structured knowledge fields from notes.
 */
export interface NoteKnowledgeCallbacks extends MutationCallbacks {
  setEntityFields?: (
    entityType: string,
    entityId: string,
    fields: Record<string, unknown>,
    source: string,
    sourceId?: string,
    confidence?: number,
    setBy?: string
  ) => Promise<void>;
}

/**
 * Callback for human-in-the-loop validation of low-confidence writes.
 */
export interface ValidationCallbacks {
  requestValidation?: (
    entityType: string,
    entityId: string,
    field: string,
    value: unknown,
    confidence: number,
    existingValue?: unknown,
    existingConfidence?: number,
  ) => Promise<'accept' | 'reject' | 'defer'>;
}

/**
 * Constraint declared on a field definition.
 * Evaluated after every setEntityFields(). Advisory only — writes not blocked.
 */
export interface FieldConstraint {
  targetField: string;
  operator: 'not_in' | 'in' | 'not_equal' | 'less_than' | 'greater_than' | 'regex';
  values?: unknown[];     // for in/not_in
  value?: unknown;        // for comparison operators
  pattern?: string;       // for regex
  message: string;
  severity: 'warning' | 'error';
}

/**
 * Result of a constraint violation check.
 */
export interface ConstraintViolation {
  fieldKey: string;
  constraintField: string;
  operator: string;
  actualValue: unknown;
  constraintValue: unknown;
  message: string;
  severity: 'warning' | 'error';
}

/**
 * Extended callbacks for observer-aware mutations.
 */
export interface ObserverCallbacks extends MutationCallbacks {
  onConstraintViolation?: (
    entityType: string,
    entityId: string,
    violations: ConstraintViolation[],
  ) => Promise<void>;
}

/**
 * Entity health report — aggregates completeness, freshness, conflicts, truth.
 */
export interface EntityHealthReport {
  entityType: string;
  entityId: string;
  completeness: number;     // 0-1: % approved fields with current values
  freshness: number;        // 0-1: avg recency score (accounting for decay)
  conflictRate: number;     // 0-1: conflicts / total fields
  truthAverage: number;     // 0-1: avg truth score across all fields
  overallScore: number;     // weighted composite
  staleFieldCount: number;
  conflictCount: number;
  filledFieldCount: number;
  totalFieldCount: number;
  warnings: string[];
}

/**
 * Summary of health across all entities of a type.
 */
export interface EntityTypeHealthSummary {
  entityType: string;
  entityCount: number;
  avgCompleteness: number;
  avgFreshness: number;
  avgConflictRate: number;
  avgOverallScore: number;
  worstEntities: Array<{ entityId: string; overallScore: number }>;
  bestEntities: Array<{ entityId: string; overallScore: number }>;
}
