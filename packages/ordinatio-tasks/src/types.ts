// ===========================================
// TASK ENGINE — TYPES
// ===========================================
// Pure TypeScript types for the task engine package.
// No app-specific imports. Prisma types used only via
// generics (db parameter injection).
// ===========================================

// ===========================================
// TASK STATUS & PRIORITY
// ===========================================

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';
export type TaskPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type DependencyType = 'FINISH_START' | 'START_START' | 'FINISH_FINISH' | 'SOFT';
export type IntentStatus = 'PROPOSED' | 'ACTIVE' | 'IN_PROGRESS' | 'BLOCKED' | 'SATISFIED' | 'FAILED';

// ===========================================
// INPUT TYPES
// ===========================================

export interface CreateTaskFromEmailInput {
  emailId: string;
  title?: string;
  notes?: string;
  assignedToId?: string;
  dueDate?: Date;
  categoryId?: string;
  createdBy: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  notes?: string;
  successCriteria?: string;
  priority?: TaskPriority;
  entityType?: string;
  entityId?: string;
  emailId?: string;
  assignedToId?: string;
  watchers?: string[];
  dueDate?: Date;
  categoryId?: string;
  parentTaskId?: string;
  intentId?: string;
  templateId?: string;
  tags?: string[];
  agentRole?: string;
  context?: Record<string, unknown>;
  createdBy: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  notes?: string;
  successCriteria?: string;
  priority?: TaskPriority;
  assignedToId?: string | null;
  dueDate?: Date | null;
  tags?: string[];
}

export interface CompleteTaskWithOutcomeInput {
  userId: string;
  outcome?: string;
  outcomeData?: Record<string, unknown>;
}

export interface BlockTaskInput {
  reason: string;
  blockerType?: string;
  blockerOwnerId?: string;
  userId?: string;
}

export interface AddDependencyInput {
  dependentTaskId: string;
  dependencyTaskId: string;
  type?: DependencyType;
}

export interface GetTasksOptions {
  status?: TaskStatus;
  assignedToId?: string;
  categoryId?: string;
  entityType?: string;
  entityId?: string;
  priority?: TaskPriority;
  agentRole?: string;
  tags?: string[];
  dueBefore?: Date;
  overdue?: boolean;
  parentTaskId?: string;
  templateId?: string;
  intentId?: string;
  hasBlocker?: boolean;
  orderBy?: 'priority' | 'dueDate' | 'createdAt';
  limit?: number;
  offset?: number;
}

export interface GetMyTasksOptions {
  includeCompleted?: boolean;
  limit?: number;
}

// ===========================================
// OUTPUT TYPES
// ===========================================

export interface CreateTaskResult {
  id: string;
  title: string;
  assignedToId: string | null;
  email: { clientId: string | null } | null;
}

export interface TaskCounts {
  open: number;
  inProgress: number;
  blocked: number;
  completed: number;
  total: number;
}

export interface DependencyCheckResult {
  met: boolean;
  blocking: Array<{ id: string; title: string; status: string; type: DependencyType }>;
}

// ===========================================
// HEALTH TYPES
// ===========================================

export type HealthSignalType =
  | 'overdue'
  | 'long_blocked'
  | 'approaching_deadline'
  | 'unassigned'
  | 'no_criteria'
  | 'dependency_risk'
  | 'unsatisfied_intent';

export interface TaskHealthSignal {
  type: HealthSignalType;
  count: number;
  severity: 'info' | 'warning' | 'error';
  tasks?: Array<{ id: string; title: string }>;
}

export interface TaskHealthSummary {
  signals: TaskHealthSignal[];
  totalOpen: number;
  totalOverdue: number;
  totalBlocked: number;
  totalUnsatisfiedIntents: number;
}

// ===========================================
// TEMPLATE TYPES
// ===========================================

export interface TemplateTaskSpec {
  key: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  successCriteria?: string;
  assigneeRole?: string;
  dueDateOffset?: number;
  tags?: string[];
  subtasks?: TemplateTaskSpec[];
  dependsOn?: string[];
  dependencyType?: DependencyType;
  intentKey?: string;
}

export interface TemplateIntentSpec {
  key: string;
  title: string;
  description?: string;
  successCriteria: Record<string, unknown>;
  acceptableMethods?: string[];
  dependsOn?: string[];
  tasks?: TemplateTaskSpec[];
}

export interface TemplateDefinition {
  intents?: TemplateIntentSpec[];
  tasks: TemplateTaskSpec[];
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  definition: TemplateDefinition;
  triggerEntityType?: string;
  triggerEnabled?: boolean;
  createdBy: string;
}

export interface InstantiateTemplateInput {
  entityType?: string;
  entityId?: string;
  assigneeMap?: Record<string, string>; // role → userId
  createdBy: string;
}

// ===========================================
// INTENT TYPES
// ===========================================

export interface CreateIntentInput {
  title: string;
  description?: string;
  successCriteria: Record<string, unknown>;
  acceptableMethods?: string[];
  entityType?: string;
  entityId?: string;
  agentRole?: string;
  context?: Record<string, unknown>;
  templateId?: string;
  createdBy: string;
}

export interface SatisfyIntentInput {
  verificationData: Record<string, unknown>;
  userId?: string;
}

// ===========================================
// CATEGORY TYPES
// ===========================================

export interface CreateCategoryInput {
  name: string;
  color: string;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string;
}

export interface UpdateCategoryResult {
  category: { id: string; name: string; color: string; createdAt: Date; updatedAt: Date };
  tasksUpdated: number;
}

// ===========================================
// CALLBACK TYPES (pluggable — app wires these)
// ===========================================

export type TaskActivityAction =
  | 'EMAIL_TASK_CREATED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_BLOCKED'
  | 'TASK_UNBLOCKED'
  | 'TASK_REOPENED'
  | 'TASK_DELETED'
  | 'TASK_ASSIGNED'
  | 'INTENT_CREATED'
  | 'INTENT_SATISFIED'
  | 'INTENT_FAILED';

export interface TaskActivityData {
  taskId?: string;
  taskTitle?: string;
  emailId?: string | null;
  userId?: string | null;
  clientId?: string | null;
  assignedToId?: string | null;
  previousTitle?: string;
  changes?: Record<string, unknown>;
  intentId?: string;
  intentTitle?: string;
  outcome?: string;
  blockerReason?: string;
}

export type ActivityLogger = (
  action: TaskActivityAction,
  description: string,
  data: TaskActivityData
) => void;

export type TaskEventEmitter = (event: {
  eventType: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}) => void;

export interface MutationCallbacks {
  onActivity?: ActivityLogger;
  onEvent?: TaskEventEmitter;
}

// ===========================================
// ERROR CLASSES
// ===========================================

export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`Task not found: ${id}`);
    this.name = 'TaskNotFoundError';
  }
}

export class EmailNotFoundForTaskError extends Error {
  constructor(id: string) {
    super(`Email not found: ${id}`);
    this.name = 'EmailNotFoundForTaskError';
  }
}

export class TaskCategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Task category not found: ${id}`);
    this.name = 'TaskCategoryNotFoundError';
  }
}

export class TaskCategoryExistsError extends Error {
  constructor(name: string) {
    super(`Task category already exists: ${name}`);
    this.name = 'TaskCategoryExistsError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class CircularDependencyError extends Error {
  constructor(taskId: string, dependencyId: string) {
    super(`Circular dependency detected: task ${taskId} cannot depend on ${dependencyId}`);
    this.name = 'CircularDependencyError';
  }
}

export class DependencyNotMetError extends Error {
  constructor(taskId: string) {
    super(`Cannot start task ${taskId}: unmet dependencies`);
    this.name = 'DependencyNotMetError';
  }
}

export class TemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Task template not found: ${id}`);
    this.name = 'TemplateNotFoundError';
  }
}

export class IntentNotFoundError extends Error {
  constructor(id: string) {
    super(`Task intent not found: ${id}`);
    this.name = 'IntentNotFoundError';
  }
}

export class IntentCriteriaNotMetError extends Error {
  constructor(id: string, details: string) {
    super(`Intent ${id} criteria not met: ${details}`);
    this.name = 'IntentCriteriaNotMetError';
  }
}
