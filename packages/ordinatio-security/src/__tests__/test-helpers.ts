// ===========================================
// Test Helpers — Mock SecurityDb
// ===========================================
// In-memory database for testing security functions.
// ===========================================

import type { SecurityDb, ActivityLogRecord, SecurityCallbacks, SecurityLogger } from '../types';

let idCounter = 0;

export function createMockDb(): SecurityDb & { _records: ActivityLogRecord[] } {
  const records: ActivityLogRecord[] = [];

  return {
    _records: records,
    activityLog: {
      create: async (args) => {
        const record: ActivityLogRecord = {
          id: `test-${++idCounter}`,
          action: args.data.action,
          description: args.data.description,
          severity: args.data.severity,
          requiresResolution: args.data.requiresResolution,
          system: args.data.system,
          userId: args.data.userId,
          metadata: args.data.metadata,
          resolvedAt: null,
          resolvedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        records.push(record);
        return record;
      },

      findMany: async (args) => {
        let filtered = [...records];
        const where = args.where;

        if (where.action) {
          if (typeof where.action === 'string') {
            filtered = filtered.filter(r => r.action === where.action);
          } else if (typeof where.action === 'object') {
            const action = where.action as Record<string, unknown>;
            if (action.startsWith) {
              filtered = filtered.filter(r => r.action.startsWith(action.startsWith as string));
            }
            if (action.in) {
              const inValues = action.in as string[];
              filtered = filtered.filter(r => inValues.includes(r.action));
            }
          }
        }

        if (where.userId) {
          filtered = filtered.filter(r => r.userId === where.userId);
        }

        if (where.resolvedAt === null) {
          filtered = filtered.filter(r => r.resolvedAt === null);
        } else if (where.resolvedAt && typeof where.resolvedAt === 'object') {
          const resolvedAt = where.resolvedAt as Record<string, unknown>;
          if (resolvedAt.not === null) {
            filtered = filtered.filter(r => r.resolvedAt !== null);
          }
        }

        if (where.createdAt && typeof where.createdAt === 'object') {
          const createdAt = where.createdAt as Record<string, Date>;
          if (createdAt.gte) {
            filtered = filtered.filter(r => r.createdAt >= createdAt.gte);
          }
          if (createdAt.lte) {
            filtered = filtered.filter(r => r.createdAt <= createdAt.lte);
          }
          if (createdAt.gt) {
            filtered = filtered.filter(r => r.createdAt > createdAt.gt);
          }
          if (createdAt.lt) {
            filtered = filtered.filter(r => r.createdAt < createdAt.lt);
          }
        }

        // Sort by createdAt desc by default
        const orderBy = args.orderBy;
        if (orderBy) {
          const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
          if (order.createdAt === 'desc') {
            filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          } else {
            filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
        }

        if (args.skip) filtered = filtered.slice(args.skip);
        if (args.take) filtered = filtered.slice(0, args.take);

        return filtered;
      },

      findFirst: async (args) => {
        let filtered = [...records];
        const where = args.where;

        if (where.action) {
          if (typeof where.action === 'string') {
            filtered = filtered.filter(r => r.action === where.action);
          } else if (typeof where.action === 'object') {
            const action = where.action as Record<string, unknown>;
            if (action.startsWith) {
              filtered = filtered.filter(r => r.action.startsWith(action.startsWith as string));
            }
          }
        }

        if (where.userId) {
          filtered = filtered.filter(r => r.userId === where.userId);
        }

        if (where.createdAt && typeof where.createdAt === 'object') {
          const createdAt = where.createdAt as Record<string, Date>;
          if (createdAt.gte) filtered = filtered.filter(r => r.createdAt >= createdAt.gte);
          if (createdAt.gt) filtered = filtered.filter(r => r.createdAt > createdAt.gt);
          if (createdAt.lt) filtered = filtered.filter(r => r.createdAt < createdAt.lt);
        }

        const orderBy = args.orderBy;
        if (orderBy) {
          const order = Array.isArray(orderBy) ? orderBy[0] : orderBy;
          if (order.createdAt === 'desc') {
            filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          }
        }

        return filtered[0] || null;
      },

      findUnique: async (args) => {
        return records.find(r => r.id === args.where.id) || null;
      },

      count: async (args) => {
        let filtered = [...records];
        const where = args.where;

        if (where.action) {
          if (typeof where.action === 'string') {
            filtered = filtered.filter(r => r.action === where.action);
          } else if (typeof where.action === 'object') {
            const action = where.action as Record<string, unknown>;
            if (action.startsWith) {
              filtered = filtered.filter(r => r.action.startsWith(action.startsWith as string));
            }
          }
        }

        if (where.userId) {
          filtered = filtered.filter(r => r.userId === where.userId);
        }

        if (where.createdAt && typeof where.createdAt === 'object') {
          const createdAt = where.createdAt as Record<string, Date>;
          if (createdAt.gte) filtered = filtered.filter(r => r.createdAt >= createdAt.gte);
        }

        return filtered.length;
      },

      update: async (args) => {
        const record = records.find(r => r.id === args.where.id);
        if (!record) throw new Error(`Record not found: ${args.where.id}`);

        if (args.data.metadata) record.metadata = args.data.metadata;
        if (args.data.resolvedAt) record.resolvedAt = args.data.resolvedAt;
        if (args.data.resolvedBy) record.resolvedBy = args.data.resolvedBy;
        record.updatedAt = new Date();

        return record;
      },
    },
  };
}

export function createMockCallbacks(): SecurityCallbacks & {
  _events: unknown[];
  _alerts: unknown[];
  _resolved: unknown[];
  _logs: { level: string; message: string; context?: unknown }[];
} {
  const events: unknown[] = [];
  const alerts: unknown[] = [];
  const resolved: unknown[] = [];
  const logs: { level: string; message: string; context?: unknown }[] = [];

  const log: SecurityLogger = {
    debug: (msg, ctx) => logs.push({ level: 'debug', message: msg, context: ctx }),
    info: (msg, ctx) => logs.push({ level: 'info', message: msg, context: ctx }),
    warn: (msg, ctx) => logs.push({ level: 'warn', message: msg, context: ctx }),
    error: (msg, ctx) => logs.push({ level: 'error', message: msg, context: ctx }),
  };

  return {
    _events: events,
    _alerts: alerts,
    _resolved: resolved,
    _logs: logs,
    log,
    onEventLogged: async (event) => { events.push(event); },
    onAlertCreated: async (alert) => { alerts.push(alert); },
    onAlertResolved: async (alert) => { resolved.push(alert); },
  };
}

export function resetIdCounter(): void {
  idCounter = 0;
}
