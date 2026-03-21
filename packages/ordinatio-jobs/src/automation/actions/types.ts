// ===========================================
// ACTION DEPENDENCY TYPES
// ===========================================
// Type definitions for dependency injection in automation actions.
// Enables SaaS extraction by decoupling actions from service implementations.
//
// IMPORTANT: This file defines INTERFACES only. No concrete service imports.
// This allows the automation engine to be extracted as a standalone SaaS
// by providing different implementations of these interfaces.
// ===========================================
// DEPENDS ON: None (pure type definitions)
// USED BY: All action files (clients, contacts, orders, email, tasks, system)
// ===========================================

// ===========================================
// ENTITY TYPE STUBS
// ===========================================
// Minimal shapes for entity types. The app layer provides
// the real Prisma model types; the package only needs these fields.

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  clientType: string;
  [key: string]: unknown;
}

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  [key: string]: unknown;
}

export interface Tag {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface Order {
  id: string;
  status: string;
  orderNumber: string;
  [key: string]: unknown;
}

export interface EmailMessage {
  id: string;
  providerId: string;
  subject: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  threadId: string | null;
  emailDate: Date;
  [key: string]: unknown;
}

export interface EmailTask {
  id: string;
  title: string;
  status: string;
  [key: string]: unknown;
}

// ===========================================
// ERROR TYPE INTERFACES
// ===========================================
// These define the shape of errors that action handlers expect.
// Implementations must throw errors with these names for proper handling.

export interface ServiceError extends Error {
  readonly name: string;
}

/**
 * Error names that action handlers check for.
 * Service implementations must throw errors with these names.
 */
export type KnownErrorName =
  | 'ClientNotFoundError'
  | 'ContactNotFoundError'
  | 'ContactExistsError'
  | 'ContactAlreadyConvertedError'
  | 'TagNotFoundError';

// ===========================================
// CLIENT SERVICE INTERFACE
// ===========================================

export interface CreateClientInput {
  name: string;
  email: string | null;
  phone: string | null;
  clientType: 'VIRTUAL' | 'IN_PERSON';
  weddingDate: Date | null;
  notes: string | null;
}

export interface UpdateClientInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  clientType?: 'VIRTUAL' | 'IN_PERSON';
  archetype?: string | null;
}

export interface IClientService {
  createClient(data: CreateClientInput): Promise<Client>;
  updateClient(clientId: string, data: UpdateClientInput): Promise<Client>;
  findClientByEmail(email: string): Promise<Pick<Client, 'id' | 'name' | 'email'> | null>;
  findClientById(clientId: string): Promise<Pick<Client, 'id' | 'name' | 'email'> | null>;
}

// ===========================================
// CONTACT SERVICE INTERFACE
// ===========================================

export interface CreateContactInput {
  email: string;
  name: string | null;
  notes: string | null;
  source: 'EMAIL_SYNC' | 'MANUAL' | 'AUTOMATION' | 'IMPORT';
}

export interface UpdateContactInput {
  name?: string | null;
  notes?: string | null;
}

export interface ConvertToClientOptions {
  name?: string;
  phone?: string | null;
  clientType?: 'VIRTUAL' | 'IN_PERSON';
  notes?: string | null;
}

export interface IContactService {
  createContact(data: CreateContactInput): Promise<Contact>;
  updateContact(contactId: string, data: UpdateContactInput): Promise<Contact>;
  convertToClient(
    contactId: string,
    userId: string,
    options?: ConvertToClientOptions
  ): Promise<Client>;
}

// ===========================================
// TAG SERVICE INTERFACE
// ===========================================

export interface TagAssignmentResult {
  tag: Pick<Tag, 'id' | 'name'>;
}

export interface ITagService {
  getTagByName(name: string): Promise<Tag | null>;
  addTagToClient(clientId: string, tagId: string): Promise<TagAssignmentResult>;
  removeTagFromClient(clientId: string, tagId: string): Promise<{ success: boolean }>;
  addTagToContact(contactId: string, tagId: string): Promise<TagAssignmentResult>;
  removeTagFromContact(contactId: string, tagId: string): Promise<{ success: boolean }>;
}

// ===========================================
// ORDER SERVICE INTERFACE
// ===========================================

export interface IOrderService {
  findOrderById(orderId: string): Promise<Pick<Order, 'id' | 'status' | 'orderNumber'> | null>;
  updateOrderStatus(orderId: string, status: string): Promise<Order>;
}

// ===========================================
// EMAIL SERVICE INTERFACE
// ===========================================

export interface SendEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
}

export interface SendReplyParams {
  inReplyTo: string;
  bodyHtml: string;
  threadId?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  expiresAt: Date;
}

export interface IEmailProvider {
  sendEmail(accessToken: string, params: SendEmailParams): Promise<string>;
  sendReply(accessToken: string, params: SendReplyParams): Promise<string>;
  refreshAccessToken(refreshToken: string): Promise<TokenRefreshResult>;
}

export interface EmailAccountData {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export interface IEmailService {
  getActiveEmailAccount(): Promise<EmailAccountData | null>;
  updateAccountTokens(accountId: string, accessToken: string, expiresAt: Date): Promise<void>;
  findEmailById(
    emailId: string
  ): Promise<(EmailMessage & { account: EmailAccountData }) | null>;
  archiveEmail(emailId: string, archivedBy: string): Promise<void>;
}

// ===========================================
// TASK SERVICE INTERFACE
// ===========================================

export interface CreateTaskInput {
  emailId: string;
  title: string;
  notes: string | null;
  categoryId?: string;
  assignedToId?: string;
  dueDate?: Date | null;
  createdBy: string;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  categoryId?: string;
  dueDate?: Date;
}

export interface ITaskService {
  findEmailById(emailId: string): Promise<Pick<EmailMessage, 'id' | 'subject' | 'fromEmail' | 'fromName' | 'snippet'> | null>;
  findTaskById(taskId: string): Promise<EmailTask | null>;
  createTask(data: CreateTaskInput): Promise<EmailTask>;
  updateTask(taskId: string, data: UpdateTaskInput): Promise<EmailTask>;
  assignTask(taskId: string, assignedToId: string): Promise<EmailTask>;
  completeTask(taskId: string): Promise<EmailTask>;
  reopenTask(taskId: string): Promise<EmailTask>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
}

// ===========================================
// SCHEDULED EMAIL SERVICE INTERFACE
// ===========================================

export interface CreateScheduledEmailInput {
  accountId: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  scheduledFor: Date;
  createdBy: string;
}

export interface IScheduledEmailService {
  createScheduledEmail(data: CreateScheduledEmailInput): Promise<{ id: string }>;
  findScheduledEmailById(id: string): Promise<{ id: string; status: string } | null>;
  cancelScheduledEmail(id: string): Promise<void>;
}

// ===========================================
// ACTIVITY SERVICE INTERFACE
// ===========================================

export interface CreateActivityInput {
  action: string;
  description: string;
  orderId: string | null;
  clientId: string | null;
  system: boolean;
  metadata?: Record<string, unknown>;
}

export interface IActivityService {
  createActivity(data: CreateActivityInput): Promise<void>;
}

// ===========================================
// COMBINED DEPENDENCIES TYPE
// ===========================================

/**
 * All dependencies that can be injected into action handlers.
 * Each dependency is optional to allow partial injection.
 */
export interface ActionDependencies {
  clientService?: IClientService;
  contactService?: IContactService;
  tagService?: ITagService;
  orderService?: IOrderService;
  emailService?: IEmailService;
  emailProvider?: IEmailProvider;
  taskService?: ITaskService;
  scheduledEmailService?: IScheduledEmailService;
  activityService?: IActivityService;
}
