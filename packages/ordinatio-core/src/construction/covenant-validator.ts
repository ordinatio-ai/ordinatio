// IHS
/**
 * Covenant Validator (Book V — Construction Standards)
 *
 * Machine-readable enforcement of Module Covenant structural rules.
 * Validates identity, domain, capabilities, dependencies, invariants,
 * and health checks against the patterns established by 17 covenants.
 *
 * Book V §XII: "Covenant enforcement must be machine-readable.
 * Validation must be automatic."
 *
 * DEPENDS ON: covenant/types, construction/types
 * USED BY: pre-disputation-audit, module-scaffolder tests
 */

import type { ModuleCovenant } from '../covenant/types';
import type { ValidationResult, ValidationIssue, ValidationSeverity } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['canonical', 'ecclesial', 'local', 'experimental'] as const;
const VALID_TIERS = ['being', 'act', 'governance', 'memory', 'intelligence'] as const;
const VALID_RISKS = ['observe', 'suggest', 'act', 'govern'] as const;
const VALID_SENSITIVITIES = ['none', 'internal', 'sensitive', 'critical'] as const;
const VALID_CAP_TYPES = ['query', 'mutation', 'action', 'composite'] as const;

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const CANONICAL_ID = /^[CELX]-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const PASCAL_CASE = /^[A-Z][a-zA-Z0-9]*$/;
const DOTTED_ID = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function issue(path: string, message: string, severity: ValidationSeverity): ValidationIssue {
  return { path, message, severity };
}

// ---------------------------------------------------------------------------
// Validate a single covenant
// ---------------------------------------------------------------------------

/**
 * Validate a ModuleCovenant against all construction standards.
 *
 * @param covenant - The covenant to validate
 * @param knownModuleIds - Optional list of known module IDs for dependency cross-referencing
 */
export function validateCovenant(
  covenant: ModuleCovenant,
  knownModuleIds?: string[],
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const { identity, domain, capabilities, dependencies, invariants, healthCheck } = covenant;

  // --- Identity ---
  if (!identity.id || !KEBAB_CASE.test(identity.id)) {
    issues.push(issue('identity.id', 'Must be non-empty lowercase-kebab-case', 'error'));
  }
  if (!identity.canonicalId || !CANONICAL_ID.test(identity.canonicalId)) {
    issues.push(issue('identity.canonicalId', 'Must match C-NN, E-NN, L-NN, or X-NN pattern', 'error'));
  }
  if (!identity.version || !SEMVER.test(identity.version)) {
    issues.push(issue('identity.version', 'Must be valid semver (e.g., 0.1.0)', 'error'));
  }
  if (!identity.description || identity.description.length < 20) {
    issues.push(issue('identity.description', 'Must be at least 20 characters', 'warning'));
  }
  if (identity.dedication !== 'IHS') {
    issues.push(issue('identity.dedication', "Must be 'IHS'", 'error'));
  }
  if (!VALID_STATUSES.includes(identity.status as typeof VALID_STATUSES[number])) {
    issues.push(issue('identity.status', `Must be one of: ${VALID_STATUSES.join(', ')}`, 'error'));
  }
  if (!VALID_TIERS.includes(identity.tier as typeof VALID_TIERS[number])) {
    issues.push(issue('identity.tier', `Must be one of: ${VALID_TIERS.join(', ')}`, 'error'));
  }

  // --- Domain ---
  if (!domain.entities || domain.entities.length === 0) {
    issues.push(issue('domain.entities', 'Should have at least one entity', 'warning'));
  }
  for (let i = 0; i < domain.entities.length; i++) {
    const entity = domain.entities[i];
    if (!PASCAL_CASE.test(entity.name)) {
      issues.push(issue(`domain.entities[${i}].name`, `'${entity.name}' should be PascalCase`, 'warning'));
    }
  }

  const eventIds = new Set<string>();
  for (let i = 0; i < domain.events.length; i++) {
    const event = domain.events[i];
    if (!DOTTED_ID.test(event.id)) {
      issues.push(issue(`domain.events[${i}].id`, `'${event.id}' must follow {prefix}.{action} pattern`, 'error'));
    }
    if (eventIds.has(event.id)) {
      issues.push(issue(`domain.events[${i}].id`, `Duplicate event ID: '${event.id}'`, 'error'));
    }
    eventIds.add(event.id);
  }

  // --- Capabilities ---
  if (!capabilities || capabilities.length === 0) {
    issues.push(issue('capabilities', 'Must have at least one capability', 'error'));
  }

  const capIds = new Set<string>();
  const riskLevels = new Set<string>();

  for (let i = 0; i < capabilities.length; i++) {
    const cap = capabilities[i];

    if (!DOTTED_ID.test(cap.id)) {
      issues.push(issue(`capabilities[${i}].id`, `'${cap.id}' must follow {prefix}.{action} pattern`, 'error'));
    }
    if (capIds.has(cap.id)) {
      issues.push(issue(`capabilities[${i}].id`, `Duplicate capability ID: '${cap.id}'`, 'error'));
    }
    capIds.add(cap.id);

    if (!VALID_CAP_TYPES.includes(cap.type as typeof VALID_CAP_TYPES[number])) {
      issues.push(issue(`capabilities[${i}].type`, `Invalid type: '${cap.type}'`, 'error'));
    }
    if (!VALID_RISKS.includes(cap.risk as typeof VALID_RISKS[number])) {
      issues.push(issue(`capabilities[${i}].risk`, `Invalid risk: '${cap.risk}'`, 'error'));
    }
    if (!VALID_SENSITIVITIES.includes(cap.dataSensitivity as typeof VALID_SENSITIVITIES[number])) {
      issues.push(issue(`capabilities[${i}].dataSensitivity`, `Invalid sensitivity: '${cap.dataSensitivity}'`, 'error'));
    }
    if (!cap.whenToUse || cap.whenToUse.length < 10) {
      issues.push(issue(`capabilities[${i}].whenToUse`, 'Must be at least 10 characters', 'warning'));
    }
    if (!cap.output) {
      issues.push(issue(`capabilities[${i}].output`, 'Output description is required', 'error'));
    }

    riskLevels.add(cap.risk);
  }

  if (capabilities.length > 0 && riskLevels.size < 2) {
    issues.push(issue('capabilities', 'Capabilities should span at least 2 risk levels', 'info'));
  }

  // --- Dependencies ---
  for (let i = 0; i < dependencies.length; i++) {
    const dep = dependencies[i];
    if (dep.moduleId === identity.id) {
      issues.push(issue(`dependencies[${i}].moduleId`, 'Module cannot depend on itself', 'error'));
    }
    if (!dep.capabilities || dep.capabilities.length === 0) {
      issues.push(issue(`dependencies[${i}].capabilities`, 'Must list at least one capability', 'warning'));
    }
    if (knownModuleIds && !knownModuleIds.includes(dep.moduleId)) {
      issues.push(issue(`dependencies[${i}].moduleId`, `Unknown module: '${dep.moduleId}'`, 'warning'));
    }
  }

  // --- Invariants ---
  if (!invariants.alwaysTrue || invariants.alwaysTrue.length === 0) {
    issues.push(issue('invariants.alwaysTrue', 'Must have at least one alwaysTrue invariant', 'error'));
  }
  if (!invariants.neverHappens || invariants.neverHappens.length === 0) {
    issues.push(issue('invariants.neverHappens', 'Must have at least one neverHappens invariant', 'error'));
  }
  for (let i = 0; i < invariants.alwaysTrue.length; i++) {
    if (!invariants.alwaysTrue[i]?.trim()) {
      issues.push(issue(`invariants.alwaysTrue[${i}]`, 'Empty invariant string', 'error'));
    }
  }
  for (let i = 0; i < invariants.neverHappens.length; i++) {
    if (!invariants.neverHappens[i]?.trim()) {
      issues.push(issue(`invariants.neverHappens[${i}]`, 'Empty invariant string', 'error'));
    }
  }

  // --- Health Check ---
  if (typeof healthCheck !== 'function') {
    issues.push(issue('healthCheck', 'Must be a function', 'error'));
  }

  // --- Result ---
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  return {
    moduleId: identity?.id ?? 'unknown',
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
  };
}

// ---------------------------------------------------------------------------
// Validate all covenants
// ---------------------------------------------------------------------------

/**
 * Validate multiple covenants at once, cross-referencing dependencies.
 */
export function validateAllCovenants(covenants: readonly ModuleCovenant[]): ValidationResult[] {
  const knownIds = covenants.map(c => c.identity.id);
  return covenants.map(c => validateCovenant(c, knownIds));
}
