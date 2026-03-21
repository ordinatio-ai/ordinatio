// ===========================================
// ORDINATIO DOMUS — Factory
// ===========================================
// `createDomus(config?)` — creates DB client,
// loads selected modules, wires callbacks.
// ===========================================

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { DomusConfig, DomusConfigFile, DomusCallbacks } from './types';
import { createEventBus } from './events/event-bus';
import type { EventBus } from './events/event-bus';
import type { EventBusApi } from './events/event-types';
import { getModule } from './wiring/registry';

/**
 * The domus instance — the pre-wired application object.
 * Access module APIs via `app.email`, `app.tasks`, etc.
 */
export interface DomusInstance {
  /** The Prisma client, connected to the domus database. */
  db: unknown;
  /** Email module API (only if 'email' module is active). */
  email?: DomusEmailApi;
  /** Tasks module API (only if 'tasks' module is active). */
  tasks?: DomusTasksApi;
  /** Entities module API (only if 'entities' module is active). */
  entities?: DomusEntitiesApi;
  /** Auth module API (only if 'auth' module is active). */
  auth?: DomusAuthApi;
  /** Activities module API (only if 'activities' module is active). */
  activities?: DomusActivitiesApi;
  /** Settings module API (only if 'settings' module is active). */
  settings?: DomusSettingsApi;
  /** Security module API (only if 'security' module is active). */
  security?: DomusSecurityApi;
  /** Jobs module API (only if 'jobs' module is active). */
  jobs?: DomusJobsApi;
  /** Agent module API (only if 'agent' module is active). */
  agent?: DomusAgentApi;
  /** The event bus — emit events and inspect topology. */
  bus: EventBusApi;
  /** Active module names. */
  modules: string[];
  /** Feature flags. */
  features: Record<string, boolean>;
  /** Disconnect the database client. */
  shutdown: () => Promise<void>;
}

/**
 * Email module API surface exposed through the domus.
 * Wraps @ordinatio/email functions with pre-injected db and callbacks.
 */
export interface DomusEmailApi {
  /** Connect an email account (OAuth or IMAP/SMTP). */
  connectAccount: (provider: string, code: string, email: string) => Promise<unknown>;
  /** Disconnect an email account. */
  disconnectAccount: (accountId: string) => Promise<void>;
  /** Sync emails for an account. */
  syncEmails: (accountId: string) => Promise<unknown>;
  /** Archive an email. */
  archiveEmail: (emailId: string) => Promise<void>;
  /** Reply to an email. */
  replyToEmail: (emailId: string, bodyHtml: string) => Promise<unknown>;
  /** Link an email to a client. */
  linkEmailToClient: (emailId: string, clientId: string, userId: string) => Promise<unknown>;
  /** Get inbox emails. */
  getInboxEmails: (accountId: string, options?: Record<string, unknown>) => Promise<unknown>;
  /** Fetch full email content. */
  fetchEmailContent: (emailId: string) => Promise<unknown>;
  /** OAEM: encode a capsule. */
  encodeCapsule: (payload: unknown) => string;
  /** OAEM: decode a capsule. */
  decodeCapsule: (encoded: string) => unknown;
  /** OAEM: embed capsule in HTML. */
  embedCapsule: (html: string, encoded: string) => string;
  /** OAEM: extract capsule from HTML. */
  extractCapsule: (html: string) => unknown;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Tasks module API surface exposed through the domus.
 * Wraps @ordinatio/tasks functions with pre-injected db and callbacks.
 */
export interface DomusTasksApi {
  /** Create a task. */
  createTask: (input: Record<string, unknown>) => Promise<unknown>;
  /** Get a task by ID. */
  getTask: (id: string) => Promise<unknown>;
  /** Update a task. */
  updateTask: (id: string, input: Record<string, unknown>, userId: string) => Promise<unknown>;
  /** Complete a task. */
  completeTask: (id: string, userId?: string, outcome?: string) => Promise<unknown>;
  /** List tasks with optional filters. */
  listTasks: (filters?: Record<string, unknown>) => Promise<unknown>;
  /** Get overdue tasks. */
  getOverdueTasks: () => Promise<unknown>;
  /** Get task health summary. */
  getHealthSummary: () => Promise<unknown>;
  /** Get the agent work queue. */
  getAgentQueue: (agentRole?: string) => Promise<unknown>;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Auth module API surface exposed through the domus.
 * Wraps @ordinatio/auth pure functions. No db required — auth uses in-memory stores.
 */
export interface DomusAuthApi {
  /** Check if an account is locked out. */
  checkLockout: (email: string) => import('@ordinatio/auth').AccountLockoutStatus;
  /** Record a login attempt. */
  recordAttempt: (attempt: import('@ordinatio/auth').LoginAttempt) => void;
  /** Unlock an account. */
  unlockAccount: (email: string, resetLevel?: boolean) => void;
  /** Validate password strength. */
  validatePassword: (password: string, context?: { username?: string; email?: string }) => import('@ordinatio/auth').PasswordStrengthResult;
  /** Check session validity. */
  checkSession: (session: import('@ordinatio/auth').Session) => import('@ordinatio/auth').SessionValidityResult;
  /** Detect suspicious activity. */
  detectSuspicious: (session: import('@ordinatio/auth').Session, ip: string, options?: { country?: string; userAgent?: string; timezone?: string }) => import('@ordinatio/auth').SuspiciousActivityResult;
  /** Generate a CSRF token. */
  generateCsrfToken: (secret: string) => string;
  /** Validate CSRF tokens. */
  validateCsrf: (requestToken: string | null, cookieToken: string | null, secret: string) => import('@ordinatio/auth').CsrfValidationResult;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Entities module API surface exposed through the domus.
 * Wraps @ordinatio/entities functions with pre-injected db and callbacks.
 */
export interface DomusEntitiesApi {
  /** Get field definitions for an entity type. */
  getFieldDefinitions: (entityType?: string, status?: string) => Promise<unknown>;
  /** Create a field definition. */
  createFieldDefinition: (input: Record<string, unknown>) => Promise<unknown>;
  /** Get entity knowledge fields. */
  getEntityFields: (entityType: string, entityId: string) => Promise<unknown>;
  /** Set entity knowledge fields. */
  setEntityFields: (entityType: string, entityId: string, fields: Record<string, unknown>, source: string) => Promise<unknown>;
  /** Search entities by field values. */
  searchByFields: (entityType: string, filters: Record<string, unknown>, limit?: number) => Promise<unknown>;
  /** Query the agent knowledge base. */
  queryKnowledge: (input: Record<string, unknown>) => Promise<unknown>;
  /** Create a note. */
  createNote: (input: Record<string, unknown>) => Promise<unknown>;
  /** Get notes for an entity. */
  getNotes: (options: Record<string, unknown>) => Promise<unknown>;
  /** Get all contacts. */
  getAllContacts: (options?: Record<string, unknown>) => Promise<unknown>;
  /** Create a contact. */
  createContact: (input: Record<string, unknown>) => Promise<unknown>;
  /** Find or create a contact by email. */
  findOrCreateContact: (email: string, name?: string, source?: string) => Promise<unknown>;
  /** Log an agent interaction. */
  logInteraction: (input: Record<string, unknown>) => Promise<unknown>;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Activities module API surface exposed through the domus.
 * Wraps @ordinatio/activities functions with pre-injected db and callbacks.
 */
export interface DomusActivitiesApi {
  /** Create an activity (with auto-resolution of sticky items). */
  createActivity: (input: Record<string, unknown>) => Promise<unknown>;
  /** Get activities with sticky items separated. */
  getActivitiesWithSticky: (options?: Record<string, unknown>) => Promise<unknown>;
  /** Manually resolve a sticky activity. */
  resolveActivity: (activityId: string, resolvedBy: string) => Promise<unknown>;
  /** Get activities for a specific order. */
  getOrderActivities: (orderId: string, limit?: number) => Promise<unknown>;
  /** Get activities for a specific client. */
  getClientActivities: (clientId: string, limit?: number) => Promise<unknown>;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Settings module API surface exposed through the domus.
 * Wraps @ordinatio/settings functions with pre-injected db.
 */
export interface DomusSettingsApi {
  /** Get a setting value by key. */
  getSetting: (key: string) => Promise<string>;
  /** Get a boolean setting. */
  getBooleanSetting: (key: string) => Promise<boolean>;
  /** Set a setting value. */
  setSetting: (key: string, value: string, description?: string) => Promise<void>;
  /** Set a boolean setting. */
  setBooleanSetting: (key: string, value: boolean, description?: string) => Promise<void>;
  /** Get all settings as key-value object. */
  getAllSettings: () => Promise<Record<string, string>>;
  /** Get AI settings with masked keys for UI. */
  getAISettings: () => Promise<unknown>;
  /** Get user preferences. */
  getPreferences: (userId: string) => Promise<unknown>;
  /** Update user preferences. */
  updatePreferences: (userId: string, data: Record<string, unknown>) => Promise<unknown>;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Security module API surface exposed through the domus.
 * Wraps @ordinatio/security functions with pre-injected db and callbacks.
 */
export interface DomusSecurityApi {
  /** Log a security event. */
  logEvent: (input: Record<string, unknown>) => Promise<unknown>;
  /** Get security events with filters. */
  getEvents: (options?: Record<string, unknown>) => Promise<unknown>;
  /** Get event statistics. */
  getEventStats: (hours?: number) => Promise<unknown>;
  /** Create a security alert. */
  createAlert: (input: Record<string, unknown>) => Promise<unknown>;
  /** Get active alerts. */
  getActiveAlerts: () => Promise<unknown>;
  /** Acknowledge an alert. */
  acknowledgeAlert: (alertId: string, acknowledgedBy: string) => Promise<unknown>;
  /** Resolve an alert. */
  resolveAlert: (alertId: string, resolvedBy: string, notes?: string) => Promise<unknown>;
  /** Check security patterns for an event. */
  checkPatterns: (event: unknown) => Promise<unknown>;
  /** Get the full security posture. */
  getPosture: (options?: Record<string, unknown>) => Promise<unknown>;
  /** Evaluate trust for an operation. */
  evaluateTrust: (input: Record<string, unknown>) => unknown;
  /** Get security headers. */
  getHeaders: () => Record<string, string>;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Jobs module API surface exposed through the domus.
 * Wraps @ordinatio/jobs functions. No db required — jobs use Redis.
 */
export interface DomusJobsApi {
  /** Register a job type with its metadata. */
  registerJobType: (definition: Record<string, unknown>) => void;
  /** Get all registered job type names. */
  getRegisteredTypes: () => string[];
  /** Check if a job type is registered. */
  isRegisteredType: (type: string) => boolean;
  /** Register a cron job. */
  registerCron: (registration: Record<string, unknown>) => unknown;
  /** Start the cron scheduler. */
  startScheduler: (callbacks?: Record<string, unknown>) => void;
  /** Stop the cron scheduler. */
  stopScheduler: () => void;
  /** Get cron scheduler status. */
  getSchedulerStatus: () => { running: boolean; jobs: unknown[] };
  /** Manually trigger a cron by name. */
  triggerCron: (name: string) => Promise<boolean>;
  /** Create a BullMQ-backed queue client. */
  createQueueClient: (config: Record<string, unknown>) => unknown;
  /** Compute queue health metrics. */
  computeQueueHealth: (client: unknown, stuckThresholdMs?: number) => Promise<unknown>;
  /** Check if a queue needs attention. */
  queueNeedsAttention: (health: unknown, waitingThreshold?: number) => boolean;
  /** Summarize queue health for LLM context. */
  summarizeHealth: (health: unknown) => string;
  /** Test Redis connectivity. */
  testRedisConnection: (config: Record<string, unknown>) => Promise<void>;
  /** Access the raw module for advanced usage. */
  raw: unknown;
}

/**
 * Agent module API surface exposed through the domus.
 * Wraps @ordinatio/agent functions. Tools and roles are registered by the app.
 */
export interface DomusAgentApi {
  /** Register a role. */
  registerRole: (role: Record<string, unknown>) => void;
  /** Register tools. */
  registerTools: (tools: Record<string, unknown>[]) => void;
  /** Get a role by ID. */
  getRole: (id: string) => unknown;
  /** Get all registered roles. */
  getAllRoles: () => unknown[];
  /** Get a tool by name. */
  getTool: (name: string) => unknown;
  /** Get all registered tools. */
  getAllTools: () => unknown[];
  /** Create a memory. */
  createMemory: (input: Record<string, unknown>) => Promise<unknown>;
  /** Recall memories with filters. */
  recallMemories: (filters: Record<string, unknown>) => Promise<unknown>;
  /** Delete a memory. */
  deleteMemory: (id: string) => Promise<boolean>;
  /** Run a chat conversation through the orchestrator. */
  chat: (request: Record<string, unknown>, sessionToken: string) => Promise<unknown>;
  /** Clear provider cache (called on settings change). */
  clearProviderCache: () => void;
  /** Check provider health. */
  isProviderHealthy: (providerId: string) => boolean;
  /** Access the raw module. */
  raw: unknown;
}

/**
 * Create a Domus instance. The main entry point for using Ordinatio.
 *
 * Resolves configuration from (in priority order):
 * 1. Explicit `config` argument
 * 2. `.ordinatio.json` in the current directory
 * 3. `DATABASE_URL` environment variable (modules must be specified)
 */
export async function createDomus(config?: Partial<DomusConfig>): Promise<DomusInstance> {
  const resolved = resolveConfig(config);

  // 1. Create Prisma client
  // Prisma 7 ESM may export PrismaClient on .default — cast to handle both
  const prismaImport = await import('@prisma/client') as Record<string, unknown>;
  const PrismaClient = (prismaImport.PrismaClient ?? (prismaImport.default as Record<string, unknown>)?.PrismaClient) as
    new (opts: { datasourceUrl: string }) => unknown;
  const db = new PrismaClient({ datasourceUrl: resolved.databaseUrl! });
  await (db as { $connect: () => Promise<void> }).$connect();

  // 2. Load selected modules
  const loadedModules: Record<string, unknown> = {};
  if (resolved.modules.includes('email')) {
    loadedModules.email = await import('@ordinatio/email');
  }
  if (resolved.modules.includes('tasks')) {
    loadedModules.tasks = await import('@ordinatio/tasks');
  }
  if (resolved.modules.includes('entities')) {
    loadedModules.entities = await import('@ordinatio/entities');
  }
  if (resolved.modules.includes('auth')) {
    loadedModules.auth = await import('@ordinatio/auth');
  }
  if (resolved.modules.includes('activities')) {
    loadedModules.activities = await import('@ordinatio/activities');
  }
  if (resolved.modules.includes('settings')) {
    loadedModules.settings = await import('@ordinatio/settings');
  }
  if (resolved.modules.includes('security')) {
    loadedModules.security = await import('@ordinatio/security');
  }
  if (resolved.modules.includes('jobs')) {
    loadedModules.jobs = await import('@ordinatio/jobs');
  }
  if (resolved.modules.includes('agent')) {
    loadedModules.agent = await import('@ordinatio/agent');
  }

  // 3. Create event bus and wire all modules automatically
  const bus = createEventBus();
  bus.setFeatureFlags(resolved.features ?? {});

  // Register each loaded module's event declarations
  for (const moduleName of resolved.modules) {
    const def = getModule(moduleName);
    if (def?.events) {
      bus.register(moduleName, def.events, db, loadedModules);
    }
  }

  // 4. Wire user-supplied callbacks into the bus
  const userCallbacks = resolved.callbacks ?? {};
  if (userCallbacks.onActivity) {
    bus.subscribe('*', async (event) => {
      await userCallbacks.onActivity!(event.source, event.type, `[${event.source}] ${event.type}`, event.data as Record<string, unknown>);
    }, '_user_activity');
  }
  if (userCallbacks.onEvent) {
    bus.subscribe('*', async (event) => {
      await userCallbacks.onEvent!({ module: event.source, type: event.type, data: event.data });
    }, '_user_event');
  }

  // 5. Build emit helper that modules use to publish events
  const makeEmitCallback = (source: string) => ({
    logActivity: async (action: string, description: string, data?: Record<string, unknown>) => {
      await bus.emit({ source, type: action, data: data ?? {}, timestamp: new Date().toISOString() });
    },
    emitEvent: async (type: string, data: unknown) => {
      await bus.emit({ source, type, data: (data ?? {}) as Record<string, unknown>, timestamp: new Date().toISOString() });
    },
  });

  // 6. Build module APIs (using bus-based callbacks instead of manual wiring)
  const email = loadedModules.email
    ? buildEmailApi(db, loadedModules.email, {}, userCallbacks, makeEmitCallback('email'))
    : undefined;

  const tasks = loadedModules.tasks
    ? buildTasksApi(db, loadedModules.tasks, {}, userCallbacks, makeEmitCallback('tasks'))
    : undefined;

  const entities = loadedModules.entities
    ? buildEntitiesApi(db, loadedModules.entities, userCallbacks)
    : undefined;

  const auth = loadedModules.auth
    ? buildAuthApi(loadedModules.auth, userCallbacks)
    : undefined;

  const activities = loadedModules.activities
    ? buildActivitiesApi(db, loadedModules.activities, userCallbacks)
    : undefined;

  const settings = loadedModules.settings
    ? buildSettingsApi(db, loadedModules.settings, userCallbacks)
    : undefined;

  const security = loadedModules.security
    ? buildSecurityApi(db, loadedModules.security, userCallbacks)
    : undefined;

  const jobs = loadedModules.jobs
    ? buildJobsApi(loadedModules.jobs, userCallbacks)
    : undefined;

  const agent = loadedModules.agent
    ? buildAgentApi(db, loadedModules.agent, userCallbacks)
    : undefined;

  return {
    db,
    email,
    tasks,
    entities,
    auth,
    activities,
    settings,
    security,
    jobs,
    agent,
    bus: {
      emit: (event) => bus.emit(event),
      getTopology: () => bus.getTopology(),
    },
    modules: resolved.modules,
    features: resolved.features ?? {},
    shutdown: async () => {
      bus.shutdown();
      await (db as { $disconnect: () => Promise<void> }).$disconnect();
    },
  };
}

// --- Internal helpers ---

function resolveConfig(partial?: Partial<DomusConfig>): DomusConfig {
  // Try .ordinatio.json
  const configPath = resolve(process.cwd(), '.ordinatio.json');
  let fileConfig: DomusConfigFile | null = null;
  if (existsSync(configPath)) {
    fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  }

  const databaseUrl = partial?.databaseUrl
    ?? fileConfig?.databaseUrl
    ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'No database URL found. Set DATABASE_URL env var, pass it to createDomus(), or run `npx ordinatio init`.'
    );
  }

  const modules = partial?.modules
    ?? fileConfig?.modules
    ?? [];

  if (modules.length === 0) {
    throw new Error(
      'No modules specified. Pass modules to createDomus() or run `npx ordinatio init`.'
    );
  }

  return {
    databaseUrl,
    modules,
    features: { ...fileConfig?.features, ...partial?.features },
    callbacks: partial?.callbacks,
  };
}

function buildEmailApi(
  db: unknown,
  emailModule: unknown,
  _wiring: Record<string, (...args: unknown[]) => Promise<unknown>>,
  userCallbacks: DomusCallbacks,
  busCallbacks?: { logActivity: (action: string, description: string, data?: Record<string, unknown>) => Promise<void>; emitEvent: (type: string, data: unknown) => Promise<void> },
): DomusEmailApi {
  const mod = emailModule as Record<string, (...args: unknown[]) => Promise<unknown>>;

  const mutationCallbacks = busCallbacks ?? {
    logActivity: async (action: string, description: string, data?: Record<string, unknown>) => {
      await userCallbacks.onActivity?.('email', action, description, data);
    },
    emitEvent: async (type: string, data: unknown) => {
      await userCallbacks.onEvent?.({ module: 'email', type, data });
    },
  };

  const syncCallbacks = {
    ...mutationCallbacks,
  };

  return {
    connectAccount: (provider, code, email) =>
      mod.connectAccount(db, provider, code, email, mutationCallbacks),
    disconnectAccount: (accountId) =>
      mod.disconnectAccount(db, accountId, mutationCallbacks) as Promise<void>,
    syncEmails: (accountId) =>
      mod.syncEmails(db, accountId, syncCallbacks),
    archiveEmail: (emailId) =>
      mod.archiveEmail(db, emailId, mutationCallbacks) as Promise<void>,
    replyToEmail: (emailId, bodyHtml) =>
      mod.replyToEmail(db, emailId, bodyHtml, mutationCallbacks),
    linkEmailToClient: (emailId, clientId, userId) =>
      mod.linkEmailToClient(db, emailId, clientId, userId, mutationCallbacks),
    getInboxEmails: (accountId, options) =>
      mod.getInboxEmails(db, accountId, options),
    fetchEmailContent: (emailId) =>
      mod.fetchEmailContent(db, emailId),
    encodeCapsule: (payload) =>
      (emailModule as Record<string, (...args: unknown[]) => string>).encodeCapsule(payload),
    decodeCapsule: (encoded) =>
      (emailModule as Record<string, (...args: unknown[]) => unknown>).decodeCapsule(encoded),
    embedCapsule: (html, encoded) =>
      (emailModule as Record<string, (...args: unknown[]) => string>).embedCapsule(html, encoded),
    extractCapsule: (html) =>
      (emailModule as Record<string, (...args: unknown[]) => unknown>).extractCapsule(html),
    raw: emailModule,
  };
}

function buildTasksApi(
  db: unknown,
  tasksModule: unknown,
  _wiring: Record<string, (...args: unknown[]) => Promise<void>>,
  userCallbacks: DomusCallbacks,
  busCallbacks?: { logActivity: (action: string, description: string, data?: Record<string, unknown>) => Promise<void>; emitEvent: (type: string, data: unknown) => Promise<void> },
): DomusTasksApi {
  const mod = tasksModule as Record<string, (...args: unknown[]) => Promise<unknown>>;

  const callbacks = busCallbacks ?? {
    logActivity: async (action: string, description: string, data?: Record<string, unknown>) => {
      await userCallbacks.onActivity?.('tasks', action, description, data);
    },
    emitEvent: async (type: string, data: unknown) => {
      await userCallbacks.onEvent?.({ module: 'tasks', type, data });
    },
  };

  return {
    createTask: (input) =>
      mod.createTask(db, input, callbacks),
    getTask: (id) =>
      mod.getTask(db, id),
    updateTask: (id, input, userId) =>
      mod.updateTask(db, id, input, userId, callbacks),
    completeTask: (id, userId, outcome) =>
      mod.completeTask(db, id, userId, outcome, callbacks),
    listTasks: (filters) =>
      mod.listTasks(db, filters),
    getOverdueTasks: () =>
      mod.getOverdueTasks(db),
    getHealthSummary: () =>
      mod.getHealthSummary(db),
    getAgentQueue: (agentRole) =>
      mod.getAgentQueue(db, agentRole),
    raw: tasksModule,
  };
}

function buildEntitiesApi(
  db: unknown,
  entitiesModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusEntitiesApi {
  const mod = entitiesModule as Record<string, (...args: unknown[]) => Promise<unknown>>;

  const callbacks = {
    logActivity: async (action: string, description: string, data?: Record<string, unknown>) => {
      await userCallbacks.onActivity?.('entities', action, description, data);
    },
    emitEvent: async (type: string, data: unknown) => {
      await userCallbacks.onEvent?.({ module: 'entities', type, data });
    },
  };

  return {
    getFieldDefinitions: (entityType, status) =>
      mod.getFieldDefinitions(db, entityType, status),
    createFieldDefinition: (input) =>
      mod.createFieldDefinition(db, input, callbacks),
    getEntityFields: (entityType, entityId) =>
      mod.getEntityFields(db, entityType, entityId),
    setEntityFields: (entityType, entityId, fields, source) =>
      mod.setEntityFields(db, entityType, entityId, fields, source, undefined, 1.0, undefined, callbacks),
    searchByFields: (entityType, filters, limit) =>
      mod.searchByFields(db, entityType, filters, limit),
    queryKnowledge: (input) =>
      mod.queryKnowledge(db, input),
    createNote: (input) =>
      mod.createNote(db, input, callbacks),
    getNotes: (options) =>
      mod.getNotes(db, options),
    getAllContacts: (options) =>
      mod.getAllContacts(db, options),
    createContact: (input) =>
      mod.createContact(db, input, callbacks),
    findOrCreateContact: (email, name, source) =>
      mod.findOrCreateContact(db, email, name, source),
    logInteraction: (input) =>
      mod.logInteraction(db, input),
    raw: entitiesModule,
  };
}

function buildAuthApi(
  authModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusAuthApi {
  const mod = authModule as Record<string, (...args: unknown[]) => unknown>;

  const callbacks = {
    log: (level: string, message: string, data?: Record<string, unknown>) => {
      userCallbacks.onEvent?.({ module: 'auth', type: `auth:${level}`, data: { message, ...data } });
    },
  };

  return {
    checkLockout: (email) =>
      mod.checkAccountLockout(email, callbacks) as import('@ordinatio/auth').AccountLockoutStatus,
    recordAttempt: (attempt) =>
      mod.recordLoginAttempt(attempt, callbacks) as void,
    unlockAccount: (email, resetLevel) =>
      mod.unlockAccount(email, resetLevel ?? false, callbacks) as void,
    validatePassword: (password, context) =>
      mod.validatePasswordStrength(password, context) as import('@ordinatio/auth').PasswordStrengthResult,
    checkSession: (session) =>
      mod.checkSessionValidity(session, callbacks) as import('@ordinatio/auth').SessionValidityResult,
    detectSuspicious: (session, ip, options) =>
      mod.detectSuspiciousActivity(session, ip, options, callbacks) as import('@ordinatio/auth').SuspiciousActivityResult,
    generateCsrfToken: (secret) =>
      mod.generateCsrfToken(secret) as string,
    validateCsrf: (requestToken, cookieToken, secret) =>
      mod.validateCsrfTokens(requestToken, cookieToken, secret) as import('@ordinatio/auth').CsrfValidationResult,
    raw: authModule,
  };
}

function buildActivitiesApi(
  db: unknown,
  activitiesModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusActivitiesApi {
  const mod = activitiesModule as Record<string, (...args: unknown[]) => Promise<unknown>>;

  const callbacks = {
    onActivityCreated: async (activity: unknown) => {
      const act = activity as Record<string, unknown>;
      await userCallbacks.onActivity?.('activities', act.action as string, act.description as string, act as Record<string, unknown>);
    },
    onActivityResolved: async (activity: unknown) => {
      const act = activity as Record<string, unknown>;
      await userCallbacks.onEvent?.({ module: 'activities', type: 'activity:resolved', data: act });
    },
  };

  return {
    createActivity: (input) =>
      mod.createActivity(db, input, callbacks),
    getActivitiesWithSticky: (options) =>
      mod.getActivitiesWithSticky(db, options),
    resolveActivity: (activityId, resolvedBy) =>
      mod.resolveActivity(db, activityId, resolvedBy, callbacks),
    getOrderActivities: (orderId, limit) =>
      mod.getOrderActivities(db, orderId, limit),
    getClientActivities: (clientId, limit) =>
      mod.getClientActivities(db, clientId, limit),
    raw: activitiesModule,
  };
}

function buildSettingsApi(
  db: unknown,
  settingsModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusSettingsApi {
  const mod = settingsModule as Record<string, (...args: unknown[]) => unknown>;

  const callbacks = {
    onSettingChanged: async (key: string, value: string) => {
      await userCallbacks.onActivity?.('settings', 'SETTING_CHANGED', `Setting ${key} updated`, { key, value });
    },
    onPreferenceChanged: async (userId: string, changes: Record<string, unknown>) => {
      await userCallbacks.onActivity?.('settings', 'PREFERENCE_CHANGED', `User preferences updated`, { userId, changes });
    },
  };

  return {
    getSetting: (key) =>
      mod.getSetting(db, key) as Promise<string>,
    getBooleanSetting: (key) =>
      mod.getBooleanSetting(db, key) as Promise<boolean>,
    setSetting: (key, value, description) =>
      mod.setSetting(db, key, value, description, callbacks) as Promise<void>,
    setBooleanSetting: (key, value, description) =>
      mod.setBooleanSetting(db, key, value, description, callbacks) as Promise<void>,
    getAllSettings: () =>
      mod.getAllSettings(db) as Promise<Record<string, string>>,
    getAISettings: () =>
      mod.getAISettings(db) as Promise<unknown>,
    getPreferences: (userId) =>
      mod.getPreferences(db, userId) as Promise<unknown>,
    updatePreferences: (userId, data) =>
      mod.updatePreferences(db, userId, data, callbacks) as Promise<unknown>,
    raw: settingsModule,
  };
}

function buildSecurityApi(
  db: unknown,
  securityModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusSecurityApi {
  const mod = securityModule as Record<string, (...args: unknown[]) => unknown>;

  const callbacks = {
    log: {
      debug: (msg: string, ctx?: Record<string, unknown>) =>
        userCallbacks.onActivity?.('security', 'debug', msg, ctx),
      info: (msg: string, ctx?: Record<string, unknown>) =>
        userCallbacks.onActivity?.('security', 'info', msg, ctx),
      warn: (msg: string, ctx?: Record<string, unknown>) =>
        userCallbacks.onActivity?.('security', 'warn', msg, ctx),
      error: (msg: string, ctx?: Record<string, unknown>) =>
        userCallbacks.onActivity?.('security', 'error', msg, ctx),
    },
    onEventLogged: async (event: unknown) => {
      await userCallbacks.onEvent?.({ module: 'security', type: 'event_logged', data: event });
    },
    onAlertCreated: async (alert: unknown) => {
      await userCallbacks.onEvent?.({ module: 'security', type: 'alert_created', data: alert });
    },
    onAlertResolved: async (alert: unknown) => {
      await userCallbacks.onEvent?.({ module: 'security', type: 'alert_resolved', data: alert });
    },
  };

  return {
    logEvent: (input) =>
      mod.logSecurityEvent(db, input, callbacks) as Promise<unknown>,
    getEvents: (options) =>
      mod.getSecurityEvents(db, options) as Promise<unknown>,
    getEventStats: (hours) =>
      mod.getSecurityEventStats(db, hours) as Promise<unknown>,
    createAlert: (input) =>
      mod.createAlert(db, input, callbacks) as Promise<unknown>,
    getActiveAlerts: () =>
      mod.getActiveAlerts(db) as Promise<unknown>,
    acknowledgeAlert: (alertId, acknowledgedBy) =>
      mod.acknowledgeAlert(db, alertId, acknowledgedBy, callbacks) as Promise<unknown>,
    resolveAlert: (alertId, resolvedBy, notes) =>
      mod.resolveAlert(db, alertId, resolvedBy, notes, false, callbacks) as Promise<unknown>,
    checkPatterns: (event) =>
      mod.checkSecurityPatterns(db, event, callbacks) as Promise<unknown>,
    getPosture: (options) =>
      mod.getSecurityPosture(db, options, callbacks) as Promise<unknown>,
    evaluateTrust: (input) =>
      mod.evaluateTrust(input),
    getHeaders: () =>
      mod.getSecurityHeaders() as Record<string, string>,
    raw: securityModule,
  };
}

function buildJobsApi(
  jobsModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusJobsApi {
  const mod = jobsModule as Record<string, (...args: unknown[]) => unknown>;

  return {
    registerJobType: (definition) =>
      mod.registerJobType(definition) as void,
    getRegisteredTypes: () =>
      mod.getRegisteredTypes() as string[],
    isRegisteredType: (type) =>
      mod.isRegisteredType(type) as boolean,
    registerCron: (registration) =>
      mod.registerCron(registration),
    startScheduler: (callbacks) =>
      mod.startScheduler(callbacks) as void,
    stopScheduler: () =>
      mod.stopScheduler() as void,
    getSchedulerStatus: () =>
      mod.getSchedulerStatus() as { running: boolean; jobs: unknown[] },
    triggerCron: (name) =>
      mod.triggerCron(name) as Promise<boolean>,
    createQueueClient: (config) =>
      mod.createBullMQClient(config),
    computeQueueHealth: (client, stuckThresholdMs) =>
      mod.computeQueueHealth(client, stuckThresholdMs) as Promise<unknown>,
    queueNeedsAttention: (health, waitingThreshold) =>
      mod.queueNeedsAttention(health, waitingThreshold) as boolean,
    summarizeHealth: (health) =>
      mod.summarizeHealth(health) as string,
    testRedisConnection: (config) =>
      mod.testRedisConnection(config) as Promise<void>,
    raw: jobsModule,
  };
}

function buildAgentApi(
  db: unknown,
  agentModule: unknown,
  userCallbacks: DomusCallbacks,
): DomusAgentApi {
  const mod = agentModule as Record<string, (...args: unknown[]) => unknown>;

  const callbacks = {
    logActivity: async (action: string, description: string, data?: Record<string, unknown>) => {
      await userCallbacks.onActivity?.('agent', action, description, data);
    },
  };

  return {
    registerRole: (role) =>
      mod.registerRole(role) as void,
    registerTools: (tools) =>
      mod.registerTools(tools) as void,
    getRole: (id) =>
      mod.getRole(id),
    getAllRoles: () =>
      mod.getAllRoles() as unknown[],
    getTool: (name) =>
      mod.getTool(name),
    getAllTools: () =>
      mod.getAllTools() as unknown[],
    createMemory: (input) =>
      mod.createMemory(db, input, callbacks) as Promise<unknown>,
    recallMemories: (filters) =>
      mod.recallMemories(db, filters) as Promise<unknown>,
    deleteMemory: (id) =>
      mod.deleteMemory(db, id) as Promise<boolean>,
    chat: (request, sessionToken) =>
      mod.orchestrateChat({
        db,
        request,
        sessionToken,
        callbacks,
      }) as Promise<unknown>,
    clearProviderCache: () =>
      mod.clearProviderCache() as void,
    isProviderHealthy: (providerId) =>
      mod.isProviderHealthy(providerId) as boolean,
    raw: agentModule,
  };
}
