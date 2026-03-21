// ===========================================
// EMAIL ENGINE — TYPES
// ===========================================
// Pure TypeScript types, error classes, and callback
// interfaces for the email-engine package.
// No app-specific imports. Prisma injected via `db` param.
// ===========================================

// ===========================================
// ERROR CLASSES
// ===========================================

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AlreadyExistsError extends Error {
  constructor(entity: string, identifier: string) {
    super(`${entity} already exists: ${identifier}`);
    this.name = 'AlreadyExistsError';
  }
}

export class EmailAccountNotFoundError extends Error {
  constructor(id?: string) {
    super(id ? `Email account not found: ${id}` : 'No email account configured');
    this.name = 'EmailAccountNotFoundError';
  }
}

export class EmailAccountExistsError extends Error {
  constructor(email: string) {
    super(`Email account already connected: ${email}`);
    this.name = 'EmailAccountExistsError';
  }
}

export class EmailMessageNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Email message', id);
    this.name = 'EmailMessageNotFoundError';
  }
}

export class ScheduledEmailNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Scheduled email', id);
    this.name = 'ScheduledEmailNotFoundError';
  }
}

export class EmailTemplateNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Email template', id);
    this.name = 'EmailTemplateNotFoundError';
  }
}

export class EmailTemplateDuplicateError extends AlreadyExistsError {
  constructor(name: string) {
    super('Email template', name);
    this.name = 'EmailTemplateDuplicateError';
  }
}

export class DefaultTemplateDeletionError extends Error {
  constructor() {
    super('Cannot delete a default template');
    this.name = 'DefaultTemplateDeletionError';
  }
}

export class ScheduledEmailNotPendingError extends Error {
  constructor(id: string, status: string) {
    super(`Scheduled email ${id} is ${status}, not PENDING`);
    this.name = 'ScheduledEmailNotPendingError';
  }
}

export class ScheduledEmailNotFailedError extends Error {
  constructor(id: string, status: string) {
    super(`Scheduled email ${id} is ${status}, not FAILED`);
    this.name = 'ScheduledEmailNotFailedError';
  }
}

// ===========================================
// CALLBACK INTERFACES
// ===========================================

/** Activity actions the email engine can emit */
export type EmailActivityAction =
  | 'EMAIL_SYNCED'
  | 'EMAIL_SYNC_FAILED'
  | 'EMAIL_ARCHIVED'
  | 'EMAIL_REPLIED'
  | 'EMAIL_LINKED'
  | 'EMAIL_SCHEDULED'
  | 'EMAIL_SCHEDULED_SENT'
  | 'EMAIL_SCHEDULED_FAILED'
  | 'EMAIL_SCHEDULED_CANCELLED'
  | 'EMAIL_TEMPLATE_CREATED'
  | 'EMAIL_TEMPLATE_UPDATED'
  | 'EMAIL_TEMPLATE_DELETED'
  | 'EMAIL_TEMPLATE_RESET'
  | 'EMAIL_ACCOUNT_CONNECTED'
  | 'EMAIL_ACCOUNT_DISCONNECTED';

/** Data attached to an activity log entry */
export interface EmailActivityData {
  action: EmailActivityAction;
  description: string;
  metadata?: Record<string, unknown>;
}

/** Callback for logging an activity */
export type ActivityLogger = (
  action: EmailActivityAction,
  description: string,
  metadata?: Record<string, unknown>
) => Promise<void> | void;

/** Callback for emitting an event (automation triggers) */
export type EventEmitter = (event: {
  eventType: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}) => Promise<void> | void;

/** Callback for resolving/creating a contact during sync */
export type ContactResolver = (
  db: unknown,
  email: string,
  name?: string
) => Promise<{ id: string; clientId?: string | null } | null>;

/** Callback for extracting context from a synced email */
export type EmailContextExtractor = (
  db: unknown,
  email: { id: string; subject: string; bodyText?: string | null; fromEmail: string; clientId?: string | null }
) => Promise<void>;

/** Callback for sanitizing HTML content */
export type HtmlSanitizer = (html: string) => string;

/** Pluggable callbacks for email mutations */
export interface EmailMutationCallbacks {
  onActivity?: ActivityLogger;
  onEvent?: EventEmitter;
}

/** Extended callbacks for email sync operations */
export interface EmailSyncCallbacks extends EmailMutationCallbacks {
  resolveContact?: ContactResolver;
  onEmailSynced?: EmailContextExtractor;
}

/** Extended callbacks for content fetching */
export interface EmailContentCallbacks {
  sanitizeHtml?: HtmlSanitizer;
}

/** OAEM capsule callbacks — injected by the OAEM protocol layer */
export interface OaemCallbacks {
  /** Outgoing: build and inject capsule before sending */
  buildCapsule?: (context: {
    to: string;
    subject: string;
    bodyHtml: string;
    threadId?: string;
    inReplyTo?: string;
  }) => Promise<{ bodyHtml: string; capsuleRaw: string } | null>;

  /** Incoming: parse and verify capsule from received email */
  parseCapsule?: (context: {
    bodyHtml: string;
    fromEmail: string;
    subject: string;
  }) => Promise<{
    found: boolean;
    capsule?: Record<string, unknown>;
    trustTier: number;
    verified: boolean;
    error?: string;
  }>;

  /** After verification: persist results */
  onCapsuleVerified?: (result: {
    emailId: string;
    threadId: string;
    capsule: Record<string, unknown>;
    trustTier: number;
    stateVersion: number;
  }) => Promise<void>;
}

// ===========================================
// INPUT / OUTPUT TYPES
// ===========================================

/** Options for listing inbox emails */
export interface GetInboxOptions {
  limit?: number;
  offset?: number;
  threadId?: string;
}

/** Options for listing inbox threads */
export interface GetThreadsOptions {
  limit?: number;
  offset?: number;
}

/** Options for listing scheduled emails */
export interface GetScheduledEmailsOptions {
  limit?: number;
  offset?: number;
  status?: string;
  createdBy?: string;
  accountId?: string;
}

/** Options for listing email templates */
export interface GetTemplatesOptions {
  category?: string;
  isActive?: boolean;
}

/** Input for scheduling an email */
export interface ScheduleEmailInput {
  accountId: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  scheduledFor: Date;
  createdBy: string;
  inReplyTo?: string;
  threadId?: string;
}

/** Input for creating an email template */
export interface CreateTemplateInput {
  name: string;
  category: string;
  subject: string;
  bodyHtml: string;
  isActive?: boolean;
  sortOrder?: number;
}

/** Input for updating an email template */
export interface UpdateTemplateInput {
  name?: string;
  category?: string;
  subject?: string;
  bodyHtml?: string;
  isActive?: boolean;
  sortOrder?: number;
}

/** Input for connecting an email account */
export interface ConnectAccountInput {
  provider: 'gmail' | 'outlook' | 'imap';
  code: string;
  email: string;
}

/** Input for replying to an email */
export interface ReplyToEmailInput {
  emailId: string;
  bodyHtml: string;
  userId: string;
  autoArchive?: boolean;
}

/** Input for linking an email to a client */
export interface LinkEmailInput {
  emailId: string;
  clientId: string;
  addToAddressBook?: boolean;
}

/** Template variable context for rendering */
export interface TemplateVariables {
  clientName?: string;
  firstName?: string;
  lastName?: string;
  clientEmail?: string;
  clientPhone?: string;
  orderNumber?: string;
  orderStatus?: string;
  fabricCode?: string;
  garmentType?: string;
  deliveryDate?: string;
  companyName?: string;
  clothierName?: string;
  clothierEmail?: string;
  [key: string]: string | undefined;
}

/** Variable category for UI display */
export interface VariableCategory {
  category: string;
  variables: Array<{
    key: string;
    label: string;
    example: string;
  }>;
}

/** Context objects for building template variables */
export interface ClientContext {
  name?: string;
  email?: string;
  phone?: string;
}

export interface OrderContext {
  orderNumber?: string;
  status?: string;
  fabricCode?: string;
  garmentType?: string;
  deliveryDate?: Date | string;
}

export interface ClothierContext {
  name?: string;
  email?: string;
}
