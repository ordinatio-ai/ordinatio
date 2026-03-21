// ===========================================
// ORDINATIO DOMUS — Event Types
// ===========================================
// Shared contract for the event bus.
// Every module emits and subscribes via these.
// ===========================================

/**
 * A typed event flowing through the Domus event bus.
 * Self-describing — agents can read and act on any event.
 */
export interface DomusEvent {
  /** Source module that emitted this event (e.g., 'email', 'jobs'). */
  source: string;
  /** Event type using dot notation (e.g., 'email.synced', 'job.failed'). */
  type: string;
  /** Event payload — varies by event type. */
  data: Record<string, unknown>;
  /** ISO 8601 timestamp of when the event was emitted. */
  timestamp: string;
  /** Optional: organization ID for multi-tenant scoping. */
  organizationId?: string;
}

/**
 * Handler function for a subscribed event.
 */
export type EventHandler = (event: DomusEvent) => Promise<void>;

/**
 * What a module declares about its event behavior.
 * Used at registration time — Domus wires everything automatically.
 */
export interface ModuleEventDeclaration {
  /** Event types this module can emit. */
  emits: string[];
  /**
   * Factory function that builds subscription handlers.
   * Receives db + loaded modules at startup so handlers can call module functions.
   * Returns a map of event type → handler.
   */
  buildSubscribers?: (
    db: unknown,
    modules: Record<string, unknown>,
  ) => Record<string, EventHandler>;
  /**
   * Feature flag gates for subscriptions.
   * Maps event type → feature flag name. Subscription only fires if flag is truthy.
   */
  featureGates?: Record<string, string>;
}

/**
 * Snapshot of the entire event mesh for agent inspection.
 */
export interface EventTopology {
  modules: Record<string, {
    emits: string[];
    subscribesTo: string[];
  }>;
  totalEventTypes: number;
  totalSubscriptions: number;
}

/**
 * The event bus interface exposed on DomusInstance.
 */
export interface EventBusApi {
  /** Emit an event to all subscribers. */
  emit: (event: DomusEvent) => Promise<void>;
  /** Get the full event topology for agent inspection. */
  getTopology: () => EventTopology;
}
