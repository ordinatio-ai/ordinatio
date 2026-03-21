// ===========================================
// @ordinatio/entities — CONTACT SCHEMAS
// ===========================================

import { z } from 'zod';

export const CreateContactSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().max(255).optional(),
  notes: z.string().max(5000).optional(),
  source: z.enum(['EMAIL_SYNC', 'MANUAL', 'AUTOMATION', 'IMPORT']).default('MANUAL'),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export type CreateContactInput = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

export const ListContactsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  source: z.enum(['EMAIL_SYNC', 'MANUAL', 'AUTOMATION', 'IMPORT']).optional(),
  search: z.string().max(200).optional(),
  excludeConverted: z.enum(['true', 'false']).default('true'),
});

export type ListContactsQueryInput = z.infer<typeof ListContactsQuery>;
