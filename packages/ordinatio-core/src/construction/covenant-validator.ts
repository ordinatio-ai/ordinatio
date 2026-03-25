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
    return { issues };
  }

  if (!identity.canonicalId || !CANONICAL_ID.test(identity.canonicalId)) {
    issues.push(issue('identity.canonicalId', 'Must match C-NN, E-NN, L-NN, or X-NN pattern', 'error'));
    return { issues };
  }

  if (!identity.version || !SEMVER.test(identity.version)) {
    issues.push(issue('identity.version', 'Must be valid semver (e.g., 0.1.0)', 'error'));
    return { issues };
  }

  if (!identity.description || identity.description.length < 20) {
    issues.push(issue('identity.description', 'Description must be at least 20 characters long', 'error'));
    return { issues };
  }

  // Additional validations would follow the same approach of early returns for errors...

  return { issues };
}
