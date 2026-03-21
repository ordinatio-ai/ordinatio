// ===========================================
// AGENT FRAMEWORK — ROLE REGISTRY
// ===========================================
// Empty at startup — apps register their own
// role definitions. Provides queries by ID and
// composite role building.
// ===========================================

import type { AgentRole } from '../types';

// ===========================================
// REGISTRY STORE
// ===========================================

const roles = new Map<string, AgentRole>();

// ===========================================
// REGISTRATION
// ===========================================

/** Register a role. Overwrites if ID already exists. */
export function registerRole(role: AgentRole): void {
  roles.set(role.id, role);
}

// ===========================================
// QUERY FUNCTIONS
// ===========================================

/** Get a role by its ID. Returns undefined if not found. */
export function getRole(id: string): AgentRole | undefined {
  return roles.get(id);
}

/** Get all registered roles. */
export function getAllRoles(): AgentRole[] {
  return Array.from(roles.values());
}

/** Get all registered role IDs. */
export function getRoleNames(): string[] {
  return Array.from(roles.keys());
}

// ===========================================
// COMPOSITE ROLE BUILDER
// ===========================================

/**
 * Build a composite role that merges capabilities from multiple roles.
 * Useful for a "general" agent that can access tools from all roles.
 *
 * @param name - Display name for the composite role
 * @param roleIds - IDs of roles to merge
 * @returns A new AgentRole with merged modules, tools, and gates
 */
export function buildCompositeRole(name: string, roleIds: string[]): AgentRole {
  const sourceRoles = roleIds
    .map((id) => roles.get(id))
    .filter((r): r is AgentRole => r !== undefined);

  if (sourceRoles.length === 0) {
    return {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      description: `Composite agent: ${name}`,
      goals: [],
      constraints: [],
      modules: [],
      toolNames: [],
      approvalGates: [],
      contextDocument: '',
    };
  }

  // Merge modules (deduplicated)
  const modules = [...new Set(sourceRoles.flatMap((r) => r.modules))];

  // Merge tool names (deduplicated)
  const toolNames = [...new Set(sourceRoles.flatMap((r) => r.toolNames))];

  // Merge approval gates (deduplicated by action)
  const gateMap = new Map<string, AgentRole['approvalGates'][number]>();
  for (const role of sourceRoles) {
    for (const gate of role.approvalGates) {
      if (!gateMap.has(gate.action)) {
        gateMap.set(gate.action, gate);
      }
    }
  }

  // Merge goals and constraints (deduplicated)
  const goals = [...new Set(sourceRoles.flatMap((r) => r.goals))];
  const constraints = [...new Set(sourceRoles.flatMap((r) => r.constraints))];

  // Merge covenant modules
  const covenantModules: Record<string, string> = {};
  for (const role of sourceRoles) {
    if (role.covenantModules) {
      Object.assign(covenantModules, role.covenantModules);
    }
  }

  // Use the most permissive maxRisk
  const riskOrder: AgentRole['maxRisk'][] = ['observe', 'suggest', 'act', 'govern'];
  let maxRisk: AgentRole['maxRisk'] = 'observe';
  for (const role of sourceRoles) {
    if (role.maxRisk) {
      const idx = riskOrder.indexOf(role.maxRisk);
      const curIdx = riskOrder.indexOf(maxRisk);
      if (idx > curIdx) maxRisk = role.maxRisk;
    }
  }

  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    description: `Composite agent combining: ${sourceRoles.map((r) => r.name).join(', ')}`,
    goals,
    constraints,
    modules,
    toolNames,
    approvalGates: Array.from(gateMap.values()),
    contextDocument: sourceRoles[0].contextDocument,
    covenantModules: Object.keys(covenantModules).length > 0 ? covenantModules : undefined,
    maxRisk,
  };
}

/** Clear all registered roles (for testing). */
export function clearRoles(): void {
  roles.clear();
}
