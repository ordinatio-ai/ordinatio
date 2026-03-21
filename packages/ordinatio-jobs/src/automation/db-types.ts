// ===========================================
// AUTOMATION PACKAGE TYPES
// ===========================================
// Local type definitions that replace @system-1701/database imports.
// These mirror the Prisma-generated enums and types so the package
// can compile independently.
// ===========================================

// ===========================================
// DATABASE ENUMS (mirrors Prisma schema)
// ===========================================

export type TriggerEventType =
  | 'EMAIL_RECEIVED'
  | 'EMAIL_SENT'
  | 'EMAIL_ARCHIVED'
  | 'CONTACT_CREATED'
  | 'CONTACT_UPDATED'
  | 'CONTACT_TAGGED'
  | 'CONTACT_UNSUBSCRIBED'
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_MEASUREMENTS_UPDATED'
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_PLACED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED'
  | 'TASK_REOPENED'
  | 'TASK_ASSIGNED'
  | 'TASK_OVERDUE'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_BLOCKED'
  | 'TASK_DEPENDENCY_MET';

export type AutomationActionType =
  | 'SEND_EMAIL'
  | 'REPLY_TO_EMAIL'
  | 'ARCHIVE_EMAIL'
  | 'FORWARD_EMAIL'
  | 'LINK_EMAIL_TO_CLIENT'
  | 'SCHEDULE_EMAIL'
  | 'CANCEL_SCHEDULED_EMAIL'
  | 'CREATE_TASK_FROM_EMAIL'
  | 'CREATE_CONTACT'
  | 'UPDATE_CONTACT'
  | 'ADD_TAG_TO_CONTACT'
  | 'REMOVE_TAG_FROM_CONTACT'
  | 'CREATE_CLIENT'
  | 'UPDATE_CLIENT'
  | 'ADD_TAG_TO_CLIENT'
  | 'REMOVE_TAG_FROM_CLIENT'
  | 'CONVERT_CONTACT_TO_CLIENT'
  | 'UPDATE_ORDER_STATUS'
  | 'CREATE_TASK'
  | 'UPDATE_TASK'
  | 'ASSIGN_TASK'
  | 'COMPLETE_TASK'
  | 'REOPEN_TASK'
  | 'CALL_WEBHOOK'
  | 'LOG_ACTIVITY'
  | 'DELAY';

export type ConditionComparator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'NOT_CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'REGEX_MATCHES'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'IN_LIST'
  | 'NOT_IN_LIST'
  | 'EXISTS_IN_TABLE'
  | 'NOT_EXISTS_IN_TABLE';

export type ConditionValueType =
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'LIST';

export type ExecutionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export type AutomationModule =
  | 'EMAIL'
  | 'CONTACTS'
  | 'CLIENTS'
  | 'ORDERS'
  | 'TASKS'
  | 'SYSTEM';

export type OrderStatus =
  | 'DRAFT'
  | 'TO_BE_PLACED'
  | 'PLACED'
  | 'RECEIVED'
  | 'ALTERATIONS'
  | 'ALTERATIONS_FINISHED'
  | 'SHIPPED'
  | 'SECOND_FITTING_MEETING'
  | 'GOOGLE_REVIEW'
  | 'DONE'
  | 'CANCELLED';

export const ORDER_STATUS_VALUES: OrderStatus[] = [
  'DRAFT',
  'TO_BE_PLACED',
  'PLACED',
  'RECEIVED',
  'ALTERATIONS',
  'ALTERATIONS_FINISHED',
  'SHIPPED',
  'SECOND_FITTING_MEETING',
  'GOOGLE_REVIEW',
  'DONE',
  'CANCELLED',
];

// ===========================================
// DATABASE CLIENT INTERFACE
// ===========================================
// Minimal interface for the database client.
// The app layer provides the real Prisma client;
// the package only sees this shape.
// ===========================================

/** Prisma-compatible JSON null sentinel */
export const JsonNull = 'DbNull' as const;

/** Prisma-compatible InputJsonValue */
export type InputJsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: InputJsonValue }
  | InputJsonValue[];

/** Minimal transaction client type */
export type AutomationTxClient = {
  automation: AutomationDb['automation'];
  automationTrigger: { deleteMany(args: { where: { automationId: string } }): Promise<unknown> };
  automationCondition: { deleteMany(args: { where: { automationId: string } }): Promise<unknown> };
  automationAction: { deleteMany(args: { where: { automationId: string } }): Promise<unknown> };
};

/**
 * Minimal database interface for the automation package.
 * The app layer injects a real PrismaClient that satisfies this shape.
 */
export interface AutomationDb {
  automation: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown | null>;
    update(args: unknown): Promise<unknown>;
    delete(args: unknown): Promise<unknown>;
    count(args: unknown): Promise<number>;
  };
  automationExecution: {
    create(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown | null>;
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
    deleteMany(args: unknown): Promise<{ count: number }>;
    count(args: unknown): Promise<number>;
  };
  automationTrigger: {
    deleteMany(args: unknown): Promise<unknown>;
  };
  automationCondition: {
    deleteMany(args: unknown): Promise<unknown>;
  };
  automationAction: {
    deleteMany(args: unknown): Promise<unknown>;
  };
  client: {
    findFirst(args: unknown): Promise<unknown | null>;
    findUnique(args: unknown): Promise<unknown | null>;
  };
  user: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
  emailMessage: {
    update(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: AutomationTxClient) => Promise<T>): Promise<T>;
}

// ===========================================
// CALLBACK INTERFACES
// ===========================================

export type ActivityAction = string;

export interface AutomationCallbacks {
  /** Log an activity event */
  logActivity?(params: {
    action: ActivityAction;
    description: string;
    system?: boolean;
    metadata?: Record<string, unknown> | null;
  }): void;

  /** Log structured messages */
  logger?: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

// ===========================================
// ACTIVITY ACTION CONSTANTS
// ===========================================

export const AUTOMATION_ACTIVITY_ACTIONS = {
  AUTOMATION_TRIGGERED: 'automation.triggered',
  AUTOMATION_COMPLETED: 'automation.completed',
  AUTOMATION_FAILED: 'automation.failed',
  AUTOMATION_DEAD_LETTER: 'automation.dead_letter',
  TASK_CREATED: 'task.created',
} as const;
