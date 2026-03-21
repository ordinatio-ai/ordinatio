// ===========================================
// ORDINATIO JOBS v1.1 — Dependency Resolver
// ===========================================
// Validates job type dependencies, detects
// cycles via BFS, checks satisfaction at
// runtime. No job runs with broken deps.
// ===========================================

import type { JobTypeDefinition } from './types';

/** Result of dependency validation. */
export interface DependencyValidation {
  valid: boolean;
  missing: string[];
  circular: boolean;
  cyclePath?: string[];
}

/**
 * Validate that a job type's dependencies are all registered
 * and form no cycles.
 */
export function validateDependencies(
  type: string,
  registry: ReadonlyMap<string, JobTypeDefinition>,
): DependencyValidation {
  const def = registry.get(type);
  if (!def || !def.dependsOn || def.dependsOn.length === 0) {
    return { valid: true, missing: [], circular: false };
  }

  // Check for missing dependencies
  const missing = def.dependsOn.filter(dep => !registry.has(dep));

  // Check for cycles (including self-reference)
  const cyclePath = detectCycleFrom(type, registry);
  const circular = cyclePath.length > 0;

  return {
    valid: missing.length === 0 && !circular,
    missing,
    circular,
    cyclePath: circular ? cyclePath : undefined,
  };
}

/**
 * Check if all dependencies of a job type are satisfied
 * (i.e., have completed successfully).
 */
export function areDependenciesSatisfied(
  type: string,
  registry: ReadonlyMap<string, JobTypeDefinition>,
  completedJobs: ReadonlySet<string>,
): boolean {
  const def = registry.get(type);
  if (!def || !def.dependsOn || def.dependsOn.length === 0) {
    return true;
  }
  return def.dependsOn.every(dep => completedJobs.has(dep));
}

/**
 * Get unsatisfied dependencies for a job type.
 */
export function getUnsatisfiedDependencies(
  type: string,
  registry: ReadonlyMap<string, JobTypeDefinition>,
  completedJobs: ReadonlySet<string>,
): string[] {
  const def = registry.get(type);
  if (!def || !def.dependsOn || def.dependsOn.length === 0) {
    return [];
  }
  return def.dependsOn.filter(dep => !completedJobs.has(dep));
}

/**
 * Detect all cycles in the full dependency graph.
 * Returns array of cycle paths (each is an array of type names).
 */
export function detectAllCycles(
  registry: ReadonlyMap<string, JobTypeDefinition>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();

  for (const type of registry.keys()) {
    if (!visited.has(type)) {
      const cycle = detectCycleFrom(type, registry);
      if (cycle.length > 0) {
        cycles.push(cycle);
        cycle.forEach(t => visited.add(t));
      }
      visited.add(type);
    }
  }

  return cycles;
}

/**
 * BFS cycle detection starting from a specific type.
 * Returns the cycle path if found, empty array if no cycle.
 */
function detectCycleFrom(
  startType: string,
  registry: ReadonlyMap<string, JobTypeDefinition>,
): string[] {
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(current: string): string[] {
    if (path.includes(current)) {
      // Found cycle — return the cycle portion of the path
      const cycleStart = path.indexOf(current);
      return [...path.slice(cycleStart), current];
    }

    if (visited.has(current)) return [];
    visited.add(current);
    path.push(current);

    const def = registry.get(current);
    if (def?.dependsOn) {
      for (const dep of def.dependsOn) {
        const cycle = dfs(dep);
        if (cycle.length > 0) return cycle;
      }
    }

    path.pop();
    return [];
  }

  return dfs(startType);
}
