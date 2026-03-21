// ===========================================
// EMAIL ENGINE — VALIDATION SCHEMAS
// ===========================================
// Consolidated Zod schemas for email operations.
// Merges email.schema + email-templates.schema.
// ===========================================

import { z } from 'zod';

// ===========================================
// ACCOUNT SCHEMAS
// ===========================================

export const EmailProviderSchema = z.enum(['gmail', 'outlook']);

export const ConnectAccountSchema = z.object({
  provider: EmailProviderSchema,
  code: z.string().min(1, 'Authorization code is required'),
  email: z.string().email('Invalid email format'),
});

// ===========================================
// SCHEDULED EMAIL SCHEMAS
// ===========================================

export const ScheduledEmailStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED',
]);

export const ScheduleEmailSchema = z.object({
  accountId: z.string().cuid({ message: 'accountId must be a valid CUID' }),
  toEmail: z.string().email({ message: 'Invalid email address' }),
  subject: z.string().min(1, 'Subject is required').max(500, 'Subject too long'),
  bodyHtml: z.string().min(1, 'Body is required').max(100000, 'Body too long'),
  scheduledFor: z
    .string()
    .datetime({ message: 'Invalid date format' })
    .transform((val) => new Date(val))
    .refine((date) => date > new Date(), {
      message: 'Scheduled time must be in the future',
    }),
  inReplyTo: z.string().optional(),
  threadId: z.string().optional(),
});

export const GetScheduledEmailsQuerySchema = z.object({
  status: ScheduledEmailStatusSchema.optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default(50),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0))
    .optional()
    .default(0),
});

// ===========================================
// INBOX MESSAGES SCHEMAS
// ===========================================

export const GetInboxMessagesQuerySchema = z.object({
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default(50),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(0))
    .optional()
    .default(0),
});

// ===========================================
// DRAFT SCHEMAS
// ===========================================

export const CreateDraftSchema = z.object({
  toEmail: z.string().email({ message: 'Invalid email address' }),
  subject: z.string().min(1, 'Subject is required').max(500, 'Subject too long'),
  bodyHtml: z.string().min(1, 'Body is required').max(100000, 'Body too long'),
  inReplyTo: z.string().optional(),
  context: z.string().max(5000, 'Context too long').optional(),
});

// ===========================================
// EMAIL TEMPLATE SCHEMAS
// ===========================================

export const CreateEmailTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  category: z.string().min(1, 'Category is required').max(50),
  subject: z.string().min(1, 'Subject is required').max(500),
  bodyHtml: z.string().min(1, 'Body is required'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateEmailTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: z.string().min(1).max(50).optional(),
  subject: z.string().min(1).max(500).optional(),
  bodyHtml: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const RenderEmailTemplateSchema = z.object({
  variables: z.record(z.string(), z.string()).optional().default({}),
});

export const UseEmailTemplateSchema = z.object({
  templateId: z.string().min(1, 'Template ID is required'),
  toEmail: z.string().email('Valid email is required'),
  variables: z.record(z.string(), z.string()).optional().default({}),
  context: z.string().optional(),
});

// ===========================================
// TYPE EXPORTS
// ===========================================

export type EmailProviderType = z.infer<typeof EmailProviderSchema>;
export type ConnectAccountSchemaInput = z.infer<typeof ConnectAccountSchema>;
export type ScheduledEmailStatus = z.infer<typeof ScheduledEmailStatusSchema>;
export type ScheduleEmailSchemaInput = z.infer<typeof ScheduleEmailSchema>;
export type GetScheduledEmailsQuery = z.infer<typeof GetScheduledEmailsQuerySchema>;
export type GetInboxMessagesQuery = z.infer<typeof GetInboxMessagesQuerySchema>;
export type CreateDraftInput = z.infer<typeof CreateDraftSchema>;
export type CreateEmailTemplateSchemaInput = z.infer<typeof CreateEmailTemplateSchema>;
export type UpdateEmailTemplateSchemaInput = z.infer<typeof UpdateEmailTemplateSchema>;
export type RenderEmailTemplateSchemaInput = z.infer<typeof RenderEmailTemplateSchema>;
export type UseEmailTemplateSchemaInput = z.infer<typeof UseEmailTemplateSchema>;
