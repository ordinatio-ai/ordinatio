// IHS
/**
 * Conflict Gate — Gate 3 of Module Admission Pipeline (Book VI)
 *
 * Detects conflicts between a candidate module and existing registered modules.
 *
 * Checks:
 * - Duplicate capability IDs (error)
 * - Duplicate event IDs — two modules emitting the same event (error)
 * - Entity name collisions (warning — may be intentional cross-module reference)
 * - Dangling subscriptions — subscribing to events no module emits (warning)
 * - Missing required dependencies (error); missing optional dependencies (warning)
 *
 * DEPENDS ON: covenant/types (ModuleCovenant)
 * USED BY: admission-pipeline
 */

import type { ModuleCovenant } from '../covenant/types';
import type { GateResult, GateIssue } from './types';

/**
 * Run the conflict gate: detect capability, event, entity, and dependency conflicts.
 *
 * @param covenant - The candidate module covenant
 * @param existingCovenants - All currently registered covenants
 */
export function runConflictGate(
  covenant: ModuleCovenant,
  existingCovenants: readonly ModuleCovenant[],
): GateResult {
  const start = Date.now();
  const issues: GateIssue[] = [];

  // Build index maps from existing covenants
  const existingCapabilities = new Map<string, string>(); // capId → moduleId
  const existingEvents = new Map<string, string>();       // eventId → moduleId
  const existingEntities = new Map<string, string>();     // entityName → moduleId
  const existingModuleIds = new Set<string>();
  const allEmittedEvents = new Set<string>();

  for (const existing of existingCovenants) {
    existingModuleIds.add(existing.identity.id);

    for (const cap of existing.capabilities) {
      existingCapabilities.set(cap.id, existing.identity.id);
    }
    for (const event of existing.domain.events) {
      existingEvents.set(event.id, existing.identity.id);
      allEmittedEvents.add(event.id);
    }
    for (const entity of existing.domain.entities) {
      existingEntities.set(entity.name, existing.identity.id);
    }
  }

  // Also add candidate's own events to the known set (for subscription self-check)
  for (const event of covenant.domain.events) {
    allEmittedEvents.add(event.id);
  }

  // 1. Duplicate capability IDs
  for (let i = 0; i < covenant.capabilities.length; i++) {
    const cap = covenant.capabilities[i];
    const owner = existingCapabilities.get(cap.id);
    if (owner) {
      issues.push({
        gate: 'conflict',
        severity: 'error',
        message: `Capability '${cap.id}' already exists in module '${owner}'`,
        path: `capabilities[${i}].id`,
      });
    }
  }

  // 2. Duplicate event IDs
  for (let i = 0; i < covenant.domain.events.length; i++) {
    const event = covenant.domain.events[i];
    const owner = existingEvents.get(event.id);
    if (owner) {
      issues.push({
        gate: 'conflict',
        severity: 'error',
        message: `Event '${event.id}' already emitted by module '${owner}'`,
        path: `domain.events[${i}].id`,
      });
    }
  }

  // 3. Entity name collisions
  for (let i = 0; i < covenant.domain.entities.length; i++) {
    const entity = covenant.domain.entities[i];
    const owner = existingEntities.get(entity.name);
    if (owner) {
      issues.push({
        gate: 'conflict',
        severity: 'warning',
        message: `Entity '${entity.name}' also exists in module '${owner}' — verify this is an intentional cross-module reference`,
        path: `domain.entities[${i}].name`,
      });
    }
  }

  // 4. Dangling subscriptions
  for (let i = 0; i < covenant.domain.subscriptions.length; i++) {
    const subId = covenant.domain.subscriptions[i];
    if (!allEmittedEvents.has(subId)) {
      issues.push({
        gate: 'conflict',
        severity: 'warning',
        message: `Subscription to event '${subId}' — no registered module emits this event`,
        path: `domain.subscriptions[${i}]`,
      });
    }
  }

  // 5. Missing dependencies
  for (let i = 0; i < covenant.dependencies.length; i++) {
    const dep = covenant.dependencies[i];
    if (!existingModuleIds.has(dep.moduleId)) {
      if (dep.required) {
        issues.push({
          gate: 'conflict',
          severity: 'error',
          message: `Required dependency '${dep.moduleId}' is not registered`,
          path: `dependencies[${i}].moduleId`,
        });
      } else {
        issues.push({
          gate: 'conflict',
          severity: 'warning',
          message: `Optional dependency '${dep.moduleId}' is not registered`,
          path: `dependencies[${i}].moduleId`,
        });
      }
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  const hasWarnings = issues.some(i => i.severity === 'warning');

  return {
    gate: 'conflict',
    verdict: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
    issues,
    durationMs: Date.now() - start,
  };
}
