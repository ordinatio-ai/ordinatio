// ===========================================
// TASK ENGINE — VALIDATION SCHEMAS
// ===========================================
// Zod schemas for validating task API requests.
// ===========================================

import { z } from 'zod';

// ===========================================
// ENUMS
// ===========================================

export const TaskStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']);
export const TaskPrioritySchema = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
export const DependencyTypeSchema = z.enum(['FINISH_START', 'START_START', 'FINISH_FINISH', 'SOFT']);
export const IntentStatusSchema = z.enum(['PROPOSED', 'ACTIVE', 'IN_PROGRESS', 'BLOCKED', 'SATISFIED', 'FAILED']);

// ===========================================
// QUERY SCHEMA (backward compat + extended)
// ===========================================

export const GetTasksQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  assignedToId: z.string().cuid().optional().nullable(),
  categoryId: z.string().cuid().optional().nullable(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
  agentRole: z.string().max(50).optional(),
  tags: z.string().optional(), // comma-separated
  dueBefore: z.string().datetime().optional(),
  overdue: z.string().transform((v) => v === 'true').optional(),
  parentTaskId: z.string().cuid().optional().nullable(),
  templateId: z.string().cuid().optional(),
  intentId: z.string().cuid().optional(),
  hasBlocker: z.string().transform((v) => v === 'true').optional(),
  orderBy: z.enum(['priority', 'dueDate', 'createdAt']).optional(),
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
// CREATE TASK SCHEMAS
// ===========================================

// Legacy: create from email (emailId required)
export const CreateTaskSchema = z.object({
  emailId: z.string().cuid({ message: 'emailId must be a valid CUID' }),
  title: z
    .string()
    .max(500, 'Title must be less than 500 characters')
    .optional()
    .transform((val) => val?.trim()),
  notes: z
    .string()
    .max(5000, 'Notes must be less than 5000 characters')
    .optional()
    .nullable()
    .transform((val) => val?.trim() || null),
  assignedToId: z
    .string()
    .cuid({ message: 'assignedToId must be a valid CUID' })
    .optional()
    .nullable(),
  dueDate: z
    .string()
    .datetime({ message: 'Invalid date format' })
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  categoryId: z
    .string()
    .cuid({ message: 'categoryId must be a valid CUID' })
    .optional()
    .nullable(),
  createdBy: z.string().cuid().optional(),
});

// New: generic entity-agnostic creation
export const CreateGenericTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500, 'Title must be less than 500 characters')
    .transform((val) => val.trim()),
  description: z.string().max(10000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  successCriteria: z.string().max(5000).optional().nullable(),
  priority: TaskPrioritySchema.optional().default('MEDIUM'),
  entityType: z.string().max(50).optional().nullable(),
  entityId: z.string().optional().nullable(),
  emailId: z.string().cuid().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  watchers: z.array(z.string().cuid()).optional().default([]),
  dueDate: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : null)),
  categoryId: z.string().cuid().optional().nullable(),
  parentTaskId: z.string().cuid().optional().nullable(),
  intentId: z.string().cuid().optional().nullable(),
  templateId: z.string().cuid().optional().nullable(),
  tags: z.array(z.string().max(50)).optional().default([]),
  agentRole: z.string().max(50).optional().nullable(),
  context: z.record(z.string(), z.unknown()).optional().nullable(),
});

// ===========================================
// UPDATE TASK SCHEMA
// ===========================================

export const UpdateTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(500, 'Title must be less than 500 characters')
    .transform((val) => val.trim())
    .optional(),
  description: z.string().max(10000).optional().nullable(),
  notes: z
    .string()
    .max(5000, 'Notes must be less than 5000 characters')
    .optional()
    .nullable()
    .transform((val) => val?.trim() || null),
  successCriteria: z.string().max(5000).optional().nullable(),
  priority: TaskPrioritySchema.optional(),
  assignedToId: z
    .string()
    .cuid({ message: 'assignedToId must be a valid CUID' })
    .optional()
    .nullable(),
  dueDate: z
    .string()
    .datetime({ message: 'Invalid date format' })
    .optional()
    .nullable()
    .transform((val) => (val ? new Date(val) : undefined)),
  tags: z.array(z.string().max(50)).optional(),
});

// ===========================================
// TASK ACTION SCHEMA
// ===========================================

export const TaskActionSchema = z.object({
  action: z.enum(['complete', 'reopen', 'start', 'block', 'unblock'], {
    message: 'Action must be one of: complete, reopen, start, block, unblock',
  }),
  userId: z.string().cuid().optional(),
  outcome: z.string().max(5000).optional(),
  outcomeData: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().max(2000).optional(),
  blockerType: z.string().max(50).optional(),
  blockerOwnerId: z.string().cuid().optional(),
});

// ===========================================
// DEPENDENCY SCHEMAS
// ===========================================

export const AddDependencySchema = z.object({
  dependencyTaskId: z.string().cuid({ message: 'dependencyTaskId must be a valid CUID' }),
  type: DependencyTypeSchema.optional().default('FINISH_START'),
});

// ===========================================
// TEMPLATE SCHEMAS
// ===========================================

const TemplateTaskSpecSchema: z.ZodType<{
  key: string;
  title: string;
  description?: string;
  priority?: string;
  successCriteria?: string;
  assigneeRole?: string;
  dueDateOffset?: number;
  tags?: string[];
  subtasks?: unknown[];
  dependsOn?: string[];
  dependencyType?: string;
  intentKey?: string;
}> = z.lazy(() =>
  z.object({
    key: z.string().min(1).max(50),
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    priority: TaskPrioritySchema.optional(),
    successCriteria: z.string().max(5000).optional(),
    assigneeRole: z.string().max(50).optional(),
    dueDateOffset: z.number().int().min(0).max(365).optional(),
    tags: z.array(z.string().max(50)).optional(),
    subtasks: z.array(TemplateTaskSpecSchema).optional(),
    dependsOn: z.array(z.string().max(50)).optional(),
    dependencyType: DependencyTypeSchema.optional(),
    intentKey: z.string().max(50).optional(),
  })
);

const TemplateIntentSpecSchema = z.object({
  key: z.string().min(1).max(50),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  successCriteria: z.record(z.string(), z.unknown()),
  acceptableMethods: z.array(z.string().max(50)).optional(),
  dependsOn: z.array(z.string().max(50)).optional(),
  tasks: z.array(TemplateTaskSpecSchema).optional(),
});

const TemplateDefinitionSchema = z.object({
  intents: z.array(TemplateIntentSpecSchema).optional(),
  tasks: z.array(TemplateTaskSpecSchema),
});

export const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(200).transform((v) => v.trim()),
  description: z.string().max(5000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  definition: TemplateDefinitionSchema,
  triggerEntityType: z.string().max(50).optional().nullable(),
  triggerEnabled: z.boolean().optional().default(false),
});

export const InstantiateTemplateSchema = z.object({
  entityType: z.string().max(50).optional().nullable(),
  entityId: z.string().optional().nullable(),
  assigneeMap: z.record(z.string(), z.string().cuid()).optional(),
});

// ===========================================
// INTENT SCHEMAS
// ===========================================

export const CreateIntentSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500)
    .transform((v) => v.trim()),
  description: z.string().max(10000).optional().nullable(),
  successCriteria: z.record(z.string(), z.unknown()),
  acceptableMethods: z.array(z.string().max(50)).optional().default([]),
  entityType: z.string().max(50).optional().nullable(),
  entityId: z.string().optional().nullable(),
  agentRole: z.string().max(50).optional().nullable(),
  context: z.record(z.string(), z.unknown()).optional().nullable(),
  templateId: z.string().cuid().optional().nullable(),
});

export const SatisfyIntentSchema = z.object({
  verificationData: z.record(z.string(), z.unknown()),
  userId: z.string().cuid().optional(),
});

export const FailIntentSchema = z.object({
  reason: z.string().min(1).max(5000),
  userId: z.string().cuid().optional(),
});

// ===========================================
// BLOCK TASK SCHEMA
// ===========================================

export const BlockTaskSchema = z.object({
  reason: z.string().min(1, 'Block reason is required').max(2000),
  blockerType: z.enum(['waiting_client', 'waiting_vendor', 'missing_data', 'dependency', 'other']).optional(),
  blockerOwnerId: z.string().cuid().optional(),
});

// ===========================================
// TYPE EXPORTS
// ===========================================

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type GetTasksQuery = z.infer<typeof GetTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type CreateGenericTaskInput = z.infer<typeof CreateGenericTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type TaskActionInput = z.infer<typeof TaskActionSchema>;
