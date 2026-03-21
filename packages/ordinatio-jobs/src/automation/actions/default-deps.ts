// ===========================================
// DEFAULT ACTION DEPENDENCIES
// ===========================================
// Provides stub implementations that throw when called.
// The app layer must provide real implementations via ActionDependencies.
//
// This file exists so action handlers can call getDependencies()
// and get a consistent interface. If no custom deps are provided,
// all methods throw with a clear message.
// ===========================================

import type {
  ActionDependencies,
  IClientService,
  IContactService,
  ITagService,
  IOrderService,
  IEmailService,
  IEmailProvider,
  ITaskService,
  IScheduledEmailService,
  IActivityService,
} from './types';

// ===========================================
// ERROR CLASSES
// ===========================================
// These are checked by name in action handlers (instanceof checks).

export class ClientNotFoundError extends Error {
  constructor(id: string) {
    super(`Client not found: ${id}`);
    this.name = 'ClientNotFoundError';
  }
}

export class ContactNotFoundError extends Error {
  constructor(id: string) {
    super(`Contact not found: ${id}`);
    this.name = 'ContactNotFoundError';
  }
}

export class ContactExistsError extends Error {
  constructor(email: string) {
    super(`Contact already exists: ${email}`);
    this.name = 'ContactExistsError';
  }
}

export class ContactAlreadyConvertedError extends Error {
  constructor(id: string) {
    super(`Contact already converted: ${id}`);
    this.name = 'ContactAlreadyConvertedError';
  }
}

export class TagNotFoundError extends Error {
  constructor(id: string) {
    super(`Tag not found: ${id}`);
    this.name = 'TagNotFoundError';
  }
}

// ===========================================
// STUB IMPLEMENTATIONS
// ===========================================

function notConfigured(service: string): never {
  throw new Error(
    `${service} not configured. Provide it via ActionDependencies when calling action handlers.`
  );
}

const stubClientService: IClientService = {
  createClient: () => notConfigured('clientService'),
  updateClient: () => notConfigured('clientService'),
  findClientByEmail: () => notConfigured('clientService'),
  findClientById: () => notConfigured('clientService'),
};

const stubContactService: IContactService = {
  createContact: () => notConfigured('contactService'),
  updateContact: () => notConfigured('contactService'),
  convertToClient: () => notConfigured('contactService'),
};

const stubTagService: ITagService = {
  getTagByName: () => notConfigured('tagService'),
  addTagToClient: () => notConfigured('tagService'),
  removeTagFromClient: () => notConfigured('tagService'),
  addTagToContact: () => notConfigured('tagService'),
  removeTagFromContact: () => notConfigured('tagService'),
};

const stubOrderService: IOrderService = {
  findOrderById: () => notConfigured('orderService'),
  updateOrderStatus: () => notConfigured('orderService'),
};

const stubEmailService: IEmailService = {
  getActiveEmailAccount: () => notConfigured('emailService'),
  updateAccountTokens: () => notConfigured('emailService'),
  findEmailById: () => notConfigured('emailService'),
  archiveEmail: () => notConfigured('emailService'),
};

const stubEmailProvider: IEmailProvider = {
  sendEmail: () => notConfigured('emailProvider'),
  sendReply: () => notConfigured('emailProvider'),
  refreshAccessToken: () => notConfigured('emailProvider'),
};

const stubTaskService: ITaskService = {
  findEmailById: () => notConfigured('taskService'),
  findTaskById: () => notConfigured('taskService'),
  createTask: () => notConfigured('taskService'),
  updateTask: () => notConfigured('taskService'),
  assignTask: () => notConfigured('taskService'),
  completeTask: () => notConfigured('taskService'),
  reopenTask: () => notConfigured('taskService'),
  findUserByEmail: () => notConfigured('taskService'),
};

const stubScheduledEmailService: IScheduledEmailService = {
  createScheduledEmail: () => notConfigured('scheduledEmailService'),
  findScheduledEmailById: () => notConfigured('scheduledEmailService'),
  cancelScheduledEmail: () => notConfigured('scheduledEmailService'),
};

const stubActivityService: IActivityService = {
  createActivity: async () => {
    // Activity logging is best-effort — silently skip if not configured
  },
};

const defaultDependencies: Required<ActionDependencies> = {
  clientService: stubClientService,
  contactService: stubContactService,
  tagService: stubTagService,
  orderService: stubOrderService,
  emailService: stubEmailService,
  emailProvider: stubEmailProvider,
  taskService: stubTaskService,
  scheduledEmailService: stubScheduledEmailService,
  activityService: stubActivityService,
};

/**
 * Get action dependencies, merging custom deps over defaults.
 * When no custom deps are provided, stub implementations throw
 * with a clear "not configured" message.
 */
export function getDependencies(
  customDeps?: ActionDependencies
): Required<ActionDependencies> {
  if (!customDeps) {
    return defaultDependencies;
  }
  return {
    ...defaultDependencies,
    ...customDeps,
  };
}
