// ===========================================
// ORDINATIO DOMUS — Barrel Export
// ===========================================
// @ordinatio/domus
// The home unit — orchestrates email, tasks,
// and future modules.
// ===========================================

// --- Factory ---
export { createDomus } from './factory';
export type { DomusInstance, DomusEmailApi, DomusTasksApi, DomusEntitiesApi } from './factory';

// --- Types ---
export type { DomusConfig, DomusCallbacks, DomusConfigFile, ModuleDefinition } from './types';

// --- Module Registry ---
export { registerModule, getModule, getAllModules, getModuleNames } from './wiring/registry';

// --- Events ---
export { createEventBus } from './events/event-bus';
export type { EventBus } from './events/event-bus';
export type { DomusEvent, EventHandler, ModuleEventDeclaration, EventTopology, EventBusApi } from './events/event-types';

// --- Schema ---
export { mergeSchemas, writeMergedSchema, availableModules } from './schema/merge';
