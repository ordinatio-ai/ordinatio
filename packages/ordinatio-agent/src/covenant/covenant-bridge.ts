// ===========================================
// MODULE COVENANT BRIDGE (Injectable)
// ===========================================
// Runtime registry of module covenants. Agents
// query this to discover capabilities. Empty at
// startup — apps register their own covenants.
// No hardcoded covenant imports.
// ===========================================

import type { CovenantProvider } from '../types';

// ---- Covenant Shape (minimal) ----

/**
 * Minimal covenant shape — we don't import from @ordinatio/core.
 * Apps register their own covenants with this shape.
 */
export interface CovenantCapabilityInput {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface CovenantCapability {
  id: string;
  description: string;
  type: string;
  risk: 'observe' | 'suggest' | 'act' | 'govern';
  inputs: CovenantCapabilityInput[];
  output: string;
  whenToUse: string;
  pitfalls?: string[];
}

export interface CovenantIdentity {
  id: string;
  name: string;
  version: string;
}

export interface MinimalCovenant {
  identity: CovenantIdentity;
  capabilities: readonly CovenantCapability[];
}

// ---- Risk Ordinal ----

const RISK_ORDINAL: Record<string, number> = {
  observe: 0,
  suggest: 1,
  act: 2,
  govern: 3,
};

// ---- Registry Store ----

const covenants = new Map<string, MinimalCovenant>();

// ---- Registration ----

/** Register a module covenant in the runtime registry. */
export function registerCovenant(covenant: MinimalCovenant): void {
  covenants.set(covenant.identity.id, covenant);
}

// ---- Queries ----

/** Get a module covenant by ID. */
export function getCovenant(moduleId: string): MinimalCovenant | undefined {
  return covenants.get(moduleId);
}

/** Get all registered covenants. */
export function getAllCovenants(): MinimalCovenant[] {
  return Array.from(covenants.values());
}

/** Get all registered module IDs. */
export function getRegisteredModuleIds(): string[] {
  return Array.from(covenants.keys());
}

// ---- Capability Discovery ----

/** Get all capabilities from a specific module. */
export function getModuleCapabilities(moduleId: string): readonly CovenantCapability[] {
  const covenant = covenants.get(moduleId);
  return covenant?.capabilities ?? [];
}

/**
 * Get capabilities across multiple modules, filtered by maximum risk level.
 */
export function getCapabilitiesByRisk(
  moduleIds: string[],
  maxRisk: string,
): CovenantCapability[] {
  const maxOrdinal = RISK_ORDINAL[maxRisk] ?? 3;
  const result: CovenantCapability[] = [];

  for (const moduleId of moduleIds) {
    const capabilities = getModuleCapabilities(moduleId);
    for (const cap of capabilities) {
      if ((RISK_ORDINAL[cap.risk] ?? 0) <= maxOrdinal) {
        result.push(cap);
      }
    }
  }

  return result;
}

/**
 * Get capabilities for a role based on module names.
 * Optionally accepts a moduleIdMap to translate role module names to covenant module IDs.
 */
export function getCapabilitiesForRole(
  roleModules: string[],
  maxRisk: string = 'govern',
  moduleIdMap?: Record<string, string>,
): CovenantCapability[] {
  const covenantModuleIds = moduleIdMap
    ? roleModules.map((m) => moduleIdMap[m]).filter(Boolean)
    : roleModules;

  return getCapabilitiesByRisk(covenantModuleIds, maxRisk);
}

/**
 * Find a specific capability by its ID across all modules.
 */
export function findCapability(capabilityId: string): {
  capability: CovenantCapability;
  moduleId: string;
} | undefined {
  for (const covenant of getAllCovenants()) {
    const capability = covenant.capabilities.find((c) => c.id === capabilityId);
    if (capability) {
      return { capability, moduleId: covenant.identity.id };
    }
  }
  return undefined;
}

// ---- Agent Discovery Format ----

/**
 * Format module capabilities as a discovery document for agents.
 * This goes into the system prompt.
 */
export function formatCapabilitiesForAgent(
  moduleIds: string[],
  maxRisk: string = 'govern',
): string {
  const capabilities = getCapabilitiesByRisk(moduleIds, maxRisk);

  if (capabilities.length === 0) {
    return 'No capabilities available for the specified modules.';
  }

  const lines: string[] = ['# Available Capabilities\n'];

  // Group by risk level
  const riskGroups: Record<string, CovenantCapability[]> = {
    observe: [],
    suggest: [],
    act: [],
    govern: [],
  };

  for (const cap of capabilities) {
    if (riskGroups[cap.risk]) {
      riskGroups[cap.risk].push(cap);
    }
  }

  const riskLabels: Record<string, string> = {
    observe: 'Read-Only (auto-approved)',
    suggest: 'Suggestions (may need approval)',
    act: 'Actions (may need approval)',
    govern: 'Critical (always needs approval)',
  };

  for (const risk of ['observe', 'suggest', 'act', 'govern']) {
    const group = riskGroups[risk];
    if (!group || group.length === 0) continue;

    lines.push(`## ${riskLabels[risk]}\n`);

    for (const cap of group) {
      lines.push(`### ${cap.id}`);
      lines.push(cap.description);
      lines.push(`When to use: ${cap.whenToUse}`);

      if (cap.inputs.length > 0) {
        const params = cap.inputs
          .map((i) => `  - ${i.name} (${i.type}${i.required ? ', required' : ''}): ${i.description}`)
          .join('\n');
        lines.push(`Parameters:\n${params}`);
      }

      if (cap.pitfalls && cap.pitfalls.length > 0) {
        lines.push(`Pitfalls: ${cap.pitfalls.join('. ')}`);
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

/** Clear all registered covenants (for testing). */
export function clearCovenants(): void {
  covenants.clear();
}

// ---- CovenantProvider Factory ----

/**
 * Create a CovenantProvider from the registry for injection into the orchestrator.
 */
export function createCovenantProvider(
  moduleIdMap?: Record<string, string>,
): CovenantProvider {
  return {
    getCovenant,
    getAllCovenants,
    getCapabilitiesForRole: (modules: string[], maxRisk: string) =>
      getCapabilitiesForRole(modules, maxRisk, moduleIdMap),
    formatCapabilitiesForAgent,
  };
}
