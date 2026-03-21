// ===========================================
// @ordinatio/entities — ENTITY KNOWLEDGE SCHEMAS
// ===========================================

import { z } from 'zod';

export const ENTITY_TYPES = ['client', 'contact', 'order'] as const;
export const FIELD_DATA_TYPES = ['text', 'number', 'date', 'boolean', 'enum', 'multi-select'] as const;
export const FIELD_STATUSES = ['suggested', 'approved', 'dismissed', 'merged'] as const;
export const LEDGER_SOURCES = ['manual', 'note', 'email', 'agent', 'ai-batch', 'predicted'] as const;
export const SEARCH_SOURCES = ['search_bar', 'agent_chat', 'api'] as const;

// ----- Field Definition Schemas -----

export const CreateFieldDefinitionSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  key: z.string().min(1).max(100).regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase snake_case'),
  label: z.string().min(1).max(200),
  dataType: z.enum(FIELD_DATA_TYPES),
  category: z.string().min(1).max(100),
  enumOptions: z.array(z.string()).optional(),
  extractionHint: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).default(0),
  halfLifeDays: z.number().int().min(1).nullable().optional(),
});

export type CreateFieldDefinitionInput = z.infer<typeof CreateFieldDefinitionSchema>;

export const UpdateFieldDefinitionSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(100).optional(),
  enumOptions: z.array(z.string()).optional(),
  extractionHint: z.string().max(500).optional(),
  status: z.enum(FIELD_STATUSES).optional(),
  mergedIntoId: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  halfLifeDays: z.number().int().min(1).nullable().optional(),
  constraints: z.array(z.object({
    targetField: z.string(),
    operator: z.enum(['not_in', 'in', 'not_equal', 'less_than', 'greater_than', 'regex']),
    values: z.array(z.unknown()).optional(),
    value: z.unknown().optional(),
    pattern: z.string().optional(),
    message: z.string(),
    severity: z.enum(['warning', 'error']),
  })).nullable().optional(),
});

export type UpdateFieldDefinitionInput = z.infer<typeof UpdateFieldDefinitionSchema>;

export const ListFieldDefinitionsQuery = z.object({
  entityType: z.enum(ENTITY_TYPES).optional(),
  status: z.enum(FIELD_STATUSES).optional(),
});

export type ListFieldDefinitionsQueryInput = z.infer<typeof ListFieldDefinitionsQuery>;

// ----- Entity Field Value Schemas -----

export const SetEntityFieldsSchema = z.object({
  fields: z.record(z.string(), z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    'At least one field is required'
  ),
  source: z.enum(LEDGER_SOURCES).default('manual'),
  sourceId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
});

export type SetEntityFieldsInput = z.infer<typeof SetEntityFieldsSchema>;

// ----- Search Schemas -----

export const SearchByFieldsSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  filters: z.record(z.string(), z.unknown()).refine(
    (obj) => Object.keys(obj).length > 0,
    'At least one filter is required'
  ),
  limit: z.number().int().min(1).max(100).default(50),
});

export type SearchByFieldsInput = z.infer<typeof SearchByFieldsSchema>;

// ----- Query Log Schema -----

export const LogSearchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  source: z.enum(SEARCH_SOURCES),
  userId: z.string().optional(),
  entityType: z.enum(ENTITY_TYPES).optional(),
  resultCount: z.number().int().min(0).optional(),
});

export type LogSearchQueryInput = z.infer<typeof LogSearchQuerySchema>;

// ----- History Query -----

export const FieldHistoryQuery = z.object({
  fieldId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type FieldHistoryQueryInput = z.infer<typeof FieldHistoryQuery>;
