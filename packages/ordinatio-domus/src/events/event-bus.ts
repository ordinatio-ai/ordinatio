// ===========================================
// ORDINATIO DOMUS — Event Bus
// ===========================================
// Central event routing. Modules register what
// they emit and subscribe to. The bus routes
// automatically. No manual pair-wise wiring.
// ===========================================

import type { DomusEvent, EventHandler, ModuleEventDeclaration, EventTopology } from './event-types';

interface Subscription {
  moduleName: string;
  eventType: string;  // '*' for wildcard (subscribes to everything)
  handler: EventHandler;
  featureGate?: string;
}

interface ModuleRegistration {
  name: string;
  emits: string[];
  subscribesTo: string[];
}

/**
 * The Domus event bus. Routes events between modules automatically.
 */
export interface EventBus {
  /**
   * Register a module's event declarations.
   * Called during factory startup for each loaded module.
   */
  register(
    moduleName: string,
    declaration: ModuleEventDeclaration,
    db: unknown,
    modules: Record<string, unknown>,
  ): void;

  /**
   * Subscribe to a specific event type (or '*' for all).
   * Used by DomusCallbacks (user-supplied) and internal wiring.
   */
  subscribe(eventType: string, handler: EventHandler, moduleName?: string): void;

  /**
   * Emit an event. Routes to all matching subscribers.
   * Subscriber errors are caught — one failure never blocks others.
   */
  emit(event: DomusEvent): Promise<void>;

  /**
   * Set feature flags. Subscriptions with gates check these before firing.
   */
  setFeatureFlags(flags: Record<string, boolean>): void;

  /**
   * Get the full event topology for agent inspection.
   */
  getTopology(): EventTopology;

  /**
   * Get the error log (subscribers that threw during emit).
   * Useful for diagnostics.
   */
  getErrors(): Array<{ event: DomusEvent; subscriber: string; error: string; timestamp: string }>;

  /**
   * Clear all registrations and subscriptions.
   */
  shutdown(): void;
}

/**
 * Create a new event bus.
 */
export function createEventBus(): EventBus {
  const subscriptions: Subscription[] = [];
  const registrations: ModuleRegistration[] = [];
  let featureFlags: Record<string, boolean> = {};
  const errorLog: Array<{ event: DomusEvent; subscriber: string; error: string; timestamp: string }> = [];

  return {
    register(
      moduleName: string,
      declaration: ModuleEventDeclaration,
      db: unknown,
      modules: Record<string, unknown>,
    ): void {
      const registration: ModuleRegistration = {
        name: moduleName,
        emits: [...declaration.emits],
        subscribesTo: [],
      };

      // Build subscribers if factory function exists
      if (declaration.buildSubscribers) {
        const handlers = declaration.buildSubscribers(db, modules);
        for (const [eventType, handler] of Object.entries(handlers)) {
          const featureGate = declaration.featureGates?.[eventType];
          subscriptions.push({
            moduleName,
            eventType,
            handler,
            featureGate,
          });
          registration.subscribesTo.push(eventType);
        }
      }

      registrations.push(registration);
    },

    subscribe(eventType: string, handler: EventHandler, moduleName?: string): void {
      subscriptions.push({
        moduleName: moduleName ?? '_user',
        eventType,
        handler,
      });

      // Track in registrations if it's a named module
      if (moduleName) {
        const reg = registrations.find(r => r.name === moduleName);
        if (reg && !reg.subscribesTo.includes(eventType)) {
          reg.subscribesTo.push(eventType);
        }
      }
    },

    async emit(event: DomusEvent): Promise<void> {
      for (const sub of subscriptions) {
        // Match: exact type OR wildcard
        if (sub.eventType !== '*' && sub.eventType !== event.type) continue;

        // Don't deliver events back to the module that emitted them
        if (sub.moduleName === event.source) continue;

        // Check feature gate
        if (sub.featureGate && !featureFlags[sub.featureGate]) continue;

        // Execute handler — errors are isolated
        try {
          await sub.handler(event);
        } catch (error) {
          errorLog.push({
            event,
            subscriber: `${sub.moduleName}:${sub.eventType}`,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
        }
      }
    },

    setFeatureFlags(flags: Record<string, boolean>): void {
      featureFlags = { ...flags };
    },

    getTopology(): EventTopology {
      const modules: EventTopology['modules'] = {};
      let totalEvents = 0;
      let totalSubs = 0;

      for (const reg of registrations) {
        modules[reg.name] = {
          emits: [...reg.emits],
          subscribesTo: [...reg.subscribesTo],
        };
        totalEvents += reg.emits.length;
        totalSubs += reg.subscribesTo.length;
      }

      return {
        modules,
        totalEventTypes: totalEvents,
        totalSubscriptions: totalSubs,
      };
    },

    getErrors() {
      return [...errorLog];
    },

    shutdown(): void {
      subscriptions.length = 0;
      registrations.length = 0;
      errorLog.length = 0;
      featureFlags = {};
    },
  };
}
