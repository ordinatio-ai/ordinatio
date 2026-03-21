// ===========================================
// @ordinatio/entities — AGENT KNOWLEDGE SCHEMAS
// ===========================================

import { z } from 'zod';

// ===========================================
// KNOWLEDGE SCHEMAS
// ===========================================

export const QueryKnowledgeSchema = z.object({
  entity: z.string().min(1).max(50),
  field: z.string().min(1).max(100).optional(),
  search: z.string().min(1).optional(),
  category: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type QueryKnowledgeInput = z.infer<typeof QueryKnowledgeSchema>;

export const CreateKnowledgeEntrySchema = z.object({
  entity: z.string().min(1).max(50),
  field: z.string().min(1).max(100),
  value: z.string().min(1),
  label: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  category: z.string().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().default(0),
});

export type CreateKnowledgeEntryInput = z.infer<typeof CreateKnowledgeEntrySchema>;

export const UpdateKnowledgeEntrySchema = z.object({
  label: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).optional(),
  category: z.string().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateKnowledgeEntryInput = z.infer<typeof UpdateKnowledgeEntrySchema>;

// ===========================================
// PREFERENCE SCHEMAS
// ===========================================

export const GetPreferencesSchema = z.object({
  entity: z.string().min(1).max(50),
  userId: z.string().optional(),
  field: z.string().min(1).max(100).optional(),
});

export type GetPreferencesInput = z.infer<typeof GetPreferencesSchema>;

export const SetPreferenceSchema = z.object({
  entity: z.string().min(1).max(50),
  field: z.string().min(1).max(100),
  value: z.string().min(1),
  label: z.string().min(1),
  conditions: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().optional(),
  priority: z.number().int().default(0),
});

export type SetPreferenceInput = z.infer<typeof SetPreferenceSchema>;
