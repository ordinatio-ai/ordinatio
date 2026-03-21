// ===========================================
// ORDINATIO DOMUS — Types
// ===========================================

/**
 * Configuration for a Domus instance.
 * Resolved from `.ordinatio.json`, env vars, or explicit config.
 */
export interface DomusConfig {
  /** PostgreSQL connection URL. Reads from DATABASE_URL env if not set. */
  databaseUrl?: string;
  /** Which modules to activate. */
  modules: string[];
  /** Feature flags. */
  features?: Record<string, boolean>;
  /** Override default callbacks. */
  callbacks?: DomusCallbacks;
}

/**
 * Callback hooks for cross-cutting concerns.
 * The consuming app can override these to integrate with its own systems.
 */
export interface DomusCallbacks {
  /** Called when any module performs a logged action. */
  onActivity?: (module: string, action: string, description: string, data?: Record<string, unknown>) => Promise<void>;
  /** Called when a module emits a system event. */
  onEvent?: (event: { module: string; type: string; data: unknown }) => Promise<void>;
}

/**
 * A module definition registered with the domus.
 */
export interface ModuleDefinition {
  /** Unique module name (e.g., 'email', 'tasks'). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Prisma schema fragment filename (relative to schema dir). */
  schemaFile?: string;
  /** Function to seed default data after schema push. */
  seed?: (db: unknown) => Promise<void>;
  /** Event declarations for the event bus. */
  events?: import('./events/event-types').ModuleEventDeclaration;
}

/**
 * The `.ordinatio.json` config file shape.
 */
export interface DomusConfigFile {
  databaseUrl?: string;
  modules: string[];
  features?: Record<string, boolean>;
}
