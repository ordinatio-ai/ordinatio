// ===========================================
// @ordinatio/entities — NOTES SCHEMAS
// ===========================================
// Generalized from client-notes.schema.ts:
// clientId → entityType + entityId for entity-agnostic notes.
// ===========================================

import { z } from 'zod';

export const AttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().min(1).max(10 * 1024 * 1024), // 10MB
  storagePath: z.string().min(1).max(500),
});

export type AttachmentInput = z.infer<typeof AttachmentSchema>;

export const CreateNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(5000, 'Note content must be 5000 characters or fewer'),
  contentHtml: z.string().max(50000).optional(),
  isDraft: z.boolean().default(false),
  source: z.enum(['MANUAL', 'AGENT', 'SYSTEM']).default('MANUAL'),
  attachments: z.array(AttachmentSchema).max(5, 'Maximum 5 attachments').default([]),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  contentHtml: z.string().max(50000).optional(),
  isDraft: z.boolean().optional(),
  attachments: z.array(AttachmentSchema).max(5).optional(),
});

export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;

export const ListNotesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  isDraft: z.enum(['true', 'false']).optional(),
});

export type ListNotesQueryInput = z.infer<typeof ListNotesQuery>;
