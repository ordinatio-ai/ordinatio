// IHS
/**
 * Module Registry — In-Memory Registry of Admitted Modules (Book VI)
 *
 * Immutable data structure tracking all admitted modules with reverse indexes
 * for fast capability and event lookup. Every mutation returns a new registry.
 *
 * Uses ReadonlyMap internally. Supports bootstrapping from existing covenants
 * (with synthetic admission decisions) for use in conflict detection and
 * capability discovery.
 *
 * DEPENDS ON: covenant/types, admission types
 * USED BY: admission-pipeline (conflict detection), agent-engine (capability discovery)
 */

import type { ModuleCovenant } from '../covenant/types';
import type {
  ModuleRegistry,
  ModuleRegistryEntry,
  AdmissionDecision,
  GateIssue,
} from './types';

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create an empty module registry.
 */
export function createModuleRegistry(): ModuleRegistry {
  return {
    modules: new Map(),
    capabilityIndex: new Map(),
    eventIndex: new Map(),
  };
}

/**
 * Bootstrap a registry from existing covenants with synthetic 'admitted' decisions.
 * Useful for initializing the registry from the 17 known covenants.
 */
export function createModuleRegistryFromCovenants(
  covenants: readonly ModuleCovenant[],
): ModuleRegistry {
  let registry = createModuleRegistry();
  for (const cov of covenants) {
    const decision = makeSyntheticDecision(cov);
    registry = registerModule(registry, cov, decision);
  }
  return registry;
}

// ---------------------------------------------------------------------------
// Registry Operations
// ---------------------------------------------------------------------------

/**
 * Register a module in the registry. Returns a new immutable registry.
 */
export function registerModule(
  registry: ModuleRegistry,
  covenant: ModuleCovenant,
  decision: AdmissionDecision,
): ModuleRegistry {
  const moduleId = covenant.identity.id;
  const capabilityIds = covenant.capabilities.map(c => c.id);
  const eventIds = covenant.domain.events.map(e => e.id);
  const subscriptionIds = [...covenant.domain.subscriptions];

  const entry: ModuleRegistryEntry = {
    covenant,
    admittedAt: new Date(),
    decision,
    capabilityIds,
    eventIds,
    subscriptionIds,
  };

  // Build new maps
  const modules = new Map(registry.modules);
  modules.set(moduleId, entry);

  const capabilityIndex = new Map(registry.capabilityIndex);
  for (const capId of capabilityIds) {
    capabilityIndex.set(capId, moduleId);
  }

  const eventIndex = new Map(registry.eventIndex);
  for (const eventId of eventIds) {
    eventIndex.set(eventId, moduleId);
  }

  return { modules, capabilityIndex, eventIndex };
}

/**
 * Remove a module from the registry. Returns a new immutable registry.
 */
export function deregisterModule(
  registry: ModuleRegistry,
  moduleId: string,
): ModuleRegistry {
  const entry = registry.modules.get(moduleId);
  if (!entry) return registry;

  const modules = new Map(registry.modules);
  modules.delete(moduleId);

  const capabilityIndex = new Map(registry.capabilityIndex);
  for (const capId of entry.capabilityIds) {
    capabilityIndex.delete(capId);
  }

  const eventIndex = new Map(registry.eventIndex);
  for (const eventId of entry.eventIds) {
    eventIndex.delete(eventId);
  }

  return { modules, capabilityIndex, eventIndex };
}

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Look up a module by ID.
 */
export function lookupModule(
  registry: ModuleRegistry,
  moduleId: string,
): ModuleRegistryEntry | undefined {
  return registry.modules.get(moduleId);
}

/**
 * Get all capability IDs for a module.
 */
export function getCapabilitiesForModule(
  registry: ModuleRegistry,
  moduleId: string,
): readonly string[] {
  return registry.modules.get(moduleId)?.capabilityIds ?? [];
}

/**
 * Find which module owns a capability ID.
 */
export function findCapabilityOwner(
  registry: ModuleRegistry,
  capabilityId: string,
): string | undefined {
  return registry.capabilityIndex.get(capabilityId);
}

/**
 * Find conflicts between a candidate covenant and the registry.
 * Returns issues for duplicate capabilities, events, and missing dependencies.
 */
export function findConflicts(
  registry: ModuleRegistry,
  covenant: ModuleCovenant,
): readonly GateIssue[] {
  const issues: GateIssue[] = [];

  // Duplicate capabilities
  for (const cap of covenant.capabilities) {
    const owner = registry.capabilityIndex.get(cap.id);
    if (owner) {
      issues.push({
        gate: 'conflict',
        severity: 'error',
        message: `Capability '${cap.id}' already owned by module '${owner}'`,
      });
    }
  }

  // Duplicate events
  for (const event of covenant.domain.events) {
    const owner = registry.eventIndex.get(event.id);
    if (owner) {
      issues.push({
        gate: 'conflict',
        severity: 'error',
        message: `Event '${event.id}' already emitted by module '${owner}'`,
      });
    }
  }

  // Missing dependencies
  for (const dep of covenant.dependencies) {
    if (!registry.modules.has(dep.moduleId)) {
      issues.push({
        gate: 'conflict',
        severity: dep.required ? 'error' : 'warning',
        message: `${dep.required ? 'Required' : 'Optional'} dependency '${dep.moduleId}' not in registry`,
      });
    }
  }

  return issues;
}

/**
 * Get all registered modules.
 */
export function getAllModules(
  registry: ModuleRegistry,
): readonly ModuleRegistryEntry[] {
  return [...registry.modules.values()];
}

/**
 * Get the total number of registered modules.
 */
export function getModuleCount(registry: ModuleRegistry): number {
  return registry.modules.size;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function makeSyntheticDecision(covenant: ModuleCovenant): AdmissionDecision {
  const status = covenant.identity.status;
  return {
    moduleId: covenant.identity.id,
    moduleStatus: status,
    verdict: status === 'local' ? 'admitted' : 'admitted_conditional',
    gates: [],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    decidedAt: new Date(),
    durationMs: 0,
    rejectionReasons: [],
  };
}
