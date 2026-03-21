// ===========================================
// ORDINATIO DOMUS — Module Registry
// ===========================================
// What modules exist, their schemas, their
// seed functions, and their event declarations.
// The domus uses this to know what's available
// and to auto-wire the event bus.
// ===========================================

import type { ModuleDefinition } from '../types';

const MODULE_REGISTRY: Map<string, ModuleDefinition> = new Map();

/**
 * Register a module definition. Called at startup.
 */
export function registerModule(def: ModuleDefinition): void {
  MODULE_REGISTRY.set(def.name, def);
}

/**
 * Get a module definition by name.
 */
export function getModule(name: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.get(name);
}

/**
 * Get all registered module definitions.
 */
export function getAllModules(): ModuleDefinition[] {
  return Array.from(MODULE_REGISTRY.values());
}

/**
 * Get all registered module names.
 */
export function getModuleNames(): string[] {
  return Array.from(MODULE_REGISTRY.keys());
}

// --- Built-in module registrations ---

registerModule({
  name: 'email',
  description: 'Multi-provider email engine with OAEM protocol',
  schemaFile: 'email.prisma',
  events: {
    emits: [
      'email.synced', 'email.archived', 'email.replied', 'email.linked',
      'email.sync_failed', 'email.account_connected', 'email.account_disconnected',
      'email.scheduled_sent', 'email.scheduled_failed',
    ],
    buildSubscribers: (db, modules) => {
      const tasks = modules.tasks as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined;
      const handlers: Record<string, (event: import('../events/event-types').DomusEvent) => Promise<void>> = {};

      // task.completed → auto-archive linked email
      if (tasks) {
        handlers['task.completed'] = async (event) => {
          // Archive email if task was linked to one
          if (event.data.entityType === 'email' && event.data.entityId) {
            const mod = modules.email as Record<string, (...args: unknown[]) => Promise<unknown>>;
            await mod.archiveEmail?.(db, event.data.entityId, {});
          }
        };
      }

      return handlers;
    },
    featureGates: {
      'task.completed': 'AUTO_ARCHIVE_ON_COMPLETE',
    },
  },
  seed: async (db: unknown) => {
    const prisma = db as { emailTemplate: { count: () => Promise<number>; createMany: (args: { data: unknown[] }) => Promise<unknown> } };
    const count = await prisma.emailTemplate.count();
    if (count > 0) return;

    await prisma.emailTemplate.createMany({
      data: [
        { name: 'Welcome Email', category: 'welcome', subject: 'Welcome, {{clientName}}!', bodyHtml: '<p>Welcome to our service, {{clientName}}.</p>', isDefault: true, sortOrder: 1 },
        { name: 'Order Confirmation', category: 'order', subject: 'Order {{orderNumber}} Confirmed', bodyHtml: '<p>Your order {{orderNumber}} has been confirmed.</p>', isDefault: true, sortOrder: 2 },
        { name: 'Fitting Appointment', category: 'fitting', subject: 'Your Fitting Appointment', bodyHtml: '<p>Dear {{clientName}}, your fitting is scheduled for {{appointmentDate}}.</p>', isDefault: true, sortOrder: 3 },
        { name: 'Follow Up', category: 'followup', subject: 'Following Up — {{subject}}', bodyHtml: '<p>Hi {{clientName}}, just following up on our recent conversation.</p>', isDefault: true, sortOrder: 4 },
        { name: 'Fabric Update', category: 'fabric', subject: 'Fabric Update: {{fabricCode}}', bodyHtml: '<p>We have an update regarding fabric {{fabricCode}}.</p>', isDefault: true, sortOrder: 5 },
      ],
    });
  },
});

registerModule({
  name: 'tasks',
  description: 'Agentic-first operational workflow engine',
  schemaFile: 'tasks.prisma',
  events: {
    emits: [
      'task.created', 'task.completed', 'task.blocked', 'task.overdue',
      'task.assigned', 'intent.satisfied', 'intent.failed',
    ],
    buildSubscribers: (db, modules) => {
      const handlers: Record<string, (event: import('../events/event-types').DomusEvent) => Promise<void>> = {};
      const tasks = modules.tasks as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined;

      // email.synced → auto-create follow-up task
      if (tasks) {
        handlers['email.synced'] = async (event) => {
          await tasks.createTask?.(db, {
            title: `Follow up: ${event.data.subject || 'email'}`,
            entityType: 'email',
            entityId: event.data.id,
          }, {});
        };
      }

      // job.failed → create task for human attention
      if (tasks) {
        handlers['job.failed'] = async (event) => {
          await tasks.createTask?.(db, {
            title: `Job failed: ${event.data.type || 'unknown'} — ${event.data.error || 'see logs'}`,
            priority: 'HIGH',
            entityType: 'job',
            entityId: event.data.jobId as string,
          }, {});
        };
      }

      // security.alert_created → create urgent task
      if (tasks) {
        handlers['security.alert_created'] = async (event) => {
          await tasks.createTask?.(db, {
            title: `Security alert: ${event.data.type || 'investigate'}`,
            priority: 'URGENT',
            entityType: 'security_alert',
            entityId: event.data.alertId as string,
          }, {});
        };
      }

      return handlers;
    },
    featureGates: {
      'email.synced': 'AUTO_TASK_FROM_EMAIL',
    },
  },
  seed: async (db: unknown) => {
    const prisma = db as { taskCategory: { count: () => Promise<number>; createMany: (args: { data: unknown[] }) => Promise<unknown> } };
    const count = await prisma.taskCategory.count();
    if (count > 0) return;

    await prisma.taskCategory.createMany({
      data: [
        { name: 'General', color: '#6B7280' },
        { name: 'Follow-Up', color: '#3B82F6' },
        { name: 'Urgent', color: '#EF4444' },
        { name: 'Operations', color: '#10B981' },
      ],
    });
  },
});

registerModule({
  name: 'entities',
  description: 'Entity knowledge, agent intelligence, notes, and contacts',
  schemaFile: 'entities.prisma',
  events: {
    emits: [
      'entity.field_updated', 'entity.contact_created',
      'entity.knowledge_dissonance', 'entity.conflict_detected',
    ],
    buildSubscribers: (db, modules) => {
      const handlers: Record<string, (event: import('../events/event-types').DomusEvent) => Promise<void>> = {};
      const entities = modules.entities as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined;

      // email.synced → auto-create contact from sender
      if (entities) {
        handlers['email.synced'] = async (event) => {
          if (event.data.from) {
            await entities.findOrCreateContact?.(db, event.data.from, event.data.fromName, 'email_sync');
          }
        };
      }

      // task.completed → log knowledge
      if (entities) {
        handlers['task.completed'] = async (event) => {
          if (event.data.entityType && event.data.entityId) {
            await entities.logInteraction?.(db, {
              entityType: event.data.entityType,
              entityId: event.data.entityId,
              type: 'task_completed',
              summary: event.data.title || 'Task completed',
            });
          }
        };
      }

      return handlers;
    },
    featureGates: {
      'email.synced': 'AUTO_CONTACT_FROM_EMAIL',
      'task.completed': 'AUTO_KNOWLEDGE_ON_TASK_COMPLETE',
    },
  },
  seed: async (db: unknown) => {
    const prisma = db as {
      entityFieldDefinition: { count: () => Promise<number>; createMany: (args: { data: unknown[] }) => Promise<unknown> };
    };
    const count = await prisma.entityFieldDefinition.count();
    if (count > 0) return;

    await prisma.entityFieldDefinition.createMany({
      data: [
        { entityType: 'client', key: 'preferred_fabric', label: 'Preferred Fabric', dataType: 'text', category: 'preferences', status: 'approved', sortOrder: 1 },
        { entityType: 'client', key: 'preferred_style', label: 'Preferred Style', dataType: 'text', category: 'preferences', status: 'approved', sortOrder: 2 },
        { entityType: 'client', key: 'budget_range', label: 'Budget Range', dataType: 'text', category: 'preferences', status: 'approved', sortOrder: 3 },
        { entityType: 'client', key: 'communication_preference', label: 'Communication Preference', dataType: 'enum', category: 'preferences', enumOptions: ['email', 'phone', 'text'], status: 'approved', sortOrder: 4 },
      ],
    });
  },
});

registerModule({
  name: 'auth',
  description: 'Identity, authentication security, and CSRF protection',
  schemaFile: 'auth.prisma',
  events: {
    emits: [
      'auth.login_success', 'auth.login_failed',
      'auth.lockout', 'auth.session_suspicious',
    ],
  },
});

registerModule({
  name: 'activities',
  description: 'Activity feed with sticky items, resolution mapping, and severity sorting',
  schemaFile: 'activities.prisma',
  events: {
    emits: ['activity.created', 'activity.resolved'],
    // Activities subscribes to EVERYTHING — it's the universal logger
    buildSubscribers: (db, modules) => {
      const activities = modules.activities as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined;
      if (!activities) return {};

      return {
        '*': async (event) => {
          await activities.createActivity?.(db, {
            action: event.type,
            description: `[${event.source}] ${event.type}`,
            metadata: event.data,
          }, {});
        },
      };
    },
  },
});

registerModule({
  name: 'security',
  description: 'Security Control Plane: events, alerts, detection, policy, enforcement, integrity',
  events: {
    emits: [
      'security.event_logged', 'security.alert_created',
      'security.alert_resolved', 'security.trust_changed', 'security.quarantine',
    ],
    buildSubscribers: (db, modules) => {
      const handlers: Record<string, (event: import('../events/event-types').DomusEvent) => Promise<void>> = {};
      const security = modules.security as Record<string, (...args: unknown[]) => Promise<unknown>> | undefined;

      // job.quarantined → log security event
      if (security) {
        handlers['job.quarantined'] = async (event) => {
          await security.logSecurityEvent?.(db, {
            eventType: 'JOB_QUARANTINED',
            riskLevel: 'high',
            details: event.data,
          }, {});
        };
      }

      // auth.login_failed → check for brute force
      if (security) {
        handlers['auth.login_failed'] = async (event) => {
          await security.checkSecurityPatterns?.(db, {
            eventType: 'AUTH_FAILURE',
            actor: event.data,
          }, {});
        };
      }

      return handlers;
    },
  },
});

registerModule({
  name: 'jobs',
  description: 'Unified execution engine: jobs, cron, DAG automations, intent verification, simulation, blueprints',
  events: {
    emits: [
      // Job execution
      'job.completed', 'job.failed', 'job.quarantined',
      'job.dead_lettered', 'cron.fired', 'cron.failed',
      // Automation execution
      'automation.triggered', 'automation.completed', 'automation.failed',
      'automation.dead_letter', 'automation.paused', 'automation.approval_needed',
      'automation.intent_satisfied', 'automation.intent_unsatisfied',
      'automation.circuit_open', 'automation.simulated',
    ],
    buildSubscribers: () => {
      const handlers: Record<string, (event: import('../events/event-types').DomusEvent) => Promise<void>> = {};

      handlers['security.trust_changed'] = async (_event) => {
        // Re-evaluate pending jobs/automations for the affected principal
      };

      handlers['security.quarantine'] = async (_event) => {
        // Freeze jobs/automations for the quarantined principal
      };

      return handlers;
    },
  },
});

registerModule({
  name: 'agent',
  description: 'LLM-agnostic agent framework: providers, orchestrator, memory, guardrails, covenant discovery',
  schemaFile: 'agent.prisma',
  events: {
    emits: [
      'agent.chat_completed', 'agent.tool_executed', 'agent.tool_blocked',
      'agent.memory_created', 'agent.memory_expired', 'agent.provider_failed',
      'agent.approval_requested',
    ],
    buildSubscribers: (_db, modules) => {
      const handlers: Record<string, (event: import('../events/event-types').DomusEvent) => Promise<void>> = {};
      const agent = modules.agent as Record<string, (...args: unknown[]) => unknown> | undefined;

      // security.trust_changed → clear cached provider (trust level may have changed)
      if (agent) {
        handlers['security.trust_changed'] = async () => {
          agent.clearProviderCache?.();
        };
      }

      // settings.changed → clear cached provider if LLM key changed
      if (agent) {
        handlers['settings.changed'] = async (event) => {
          const key = event.data.key as string | undefined;
          if (key?.startsWith('llm_') || key?.endsWith('_api_key')) {
            agent.clearProviderCache?.();
          }
        };
      }

      return handlers;
    },
  },
  // No seed — tools/roles registered by the app at startup
});

registerModule({
  name: 'settings',
  description: 'System settings, AI provider config, and user preferences',
  schemaFile: 'settings.prisma',
  events: {
    emits: ['settings.changed', 'settings.preference_changed'],
  },
  seed: async (db: unknown) => {
    const prisma = db as { systemSettings: { count: () => Promise<number>; createMany: (args: { data: unknown[] }) => Promise<unknown> } };
    const count = await prisma.systemSettings.count();
    if (count > 0) return;

    await prisma.systemSettings.createMany({
      data: [
        { key: 'admin_feed_enabled', value: 'true', description: 'Enable admin activity feed' },
        { key: 'llm_provider', value: 'claude', description: 'Active LLM provider' },
      ],
    });
  },
});
