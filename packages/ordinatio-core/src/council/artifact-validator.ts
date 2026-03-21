// IHS
/**
 * Council Artifact Validator (Book II)
 *
 * "Invalid artifact = ignored input." — Book II §IV
 *
 * Validates that artifact content matches its declared type.
 * Each of the 8 artifact types has required fields. Content that
 * fails validation is rejected by the orchestrator.
 *
 * DEPENDS ON: council/types (ArtifactContent, ArtifactType, OfficeId)
 */

import type { ArtifactContent, ArtifactType, OfficeId } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtifactValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface ArtifactValidationResult {
  readonly valid: boolean;
  readonly artifactType: ArtifactType;
  readonly issues: readonly ArtifactValidationIssue[];
}

// ---------------------------------------------------------------------------
// Type Guard
// ---------------------------------------------------------------------------

const VALID_TYPES: readonly ArtifactType[] = [
  'cycle_orchestration', 'propositio', 'objectiones', 'verdict',
  'trial_report', 'purification_record', 'canon_record', 'publication',
];

/**
 * Check if a value is a valid ArtifactContent (has a recognized `type` field).
 */
export function hasValidType(content: unknown): content is ArtifactContent {
  if (content === null || typeof content !== 'object') return false;
  const obj = content as Record<string, unknown>;
  return typeof obj.type === 'string' && VALID_TYPES.includes(obj.type as ArtifactType);
}

// ---------------------------------------------------------------------------
// Office → Artifact Type Mapping
// ---------------------------------------------------------------------------

const OFFICE_ARTIFACT_MAP: Record<OfficeId, ArtifactType> = {
  rector:      'cycle_orchestration',
  speculator:  'propositio',
  contrarius:  'objectiones',
  vindex:      'verdict',
  pugil:       'trial_report',
  nitor:       'purification_record',
  archivist:   'canon_record',
  illuminatio: 'publication',
};

/**
 * Get the expected artifact type for a given Office.
 */
export function getExpectedArtifactType(officeId: OfficeId): ArtifactType {
  return OFFICE_ARTIFACT_MAP[officeId];
}

// ---------------------------------------------------------------------------
// Content Validation
// ---------------------------------------------------------------------------

/**
 * Validate artifact content against its declared type's required fields.
 */
export function validateArtifactContent(content: ArtifactContent): ArtifactValidationResult {
  const issues: ArtifactValidationIssue[] = [];
  // Cast once — the helper functions use Record<string, unknown> for generic field access
  const c = content as unknown as Record<string, unknown>;

  switch (content.type) {
    case 'propositio':
      requireString(c, 'signal', issues);
      requireString(c, 'proposal', issues);
      requireString(c, 'benefit', issues);
      requireArray(c, 'affectedModules', issues);
      requireString(c, 'risk', issues);
      requireString(c, 'implementation', issues);
      break;

    case 'objectiones':
      requireString(c, 'propositionId', issues);
      requireArray(c, 'objections', issues);
      if (Array.isArray(content.objections)) {
        for (let i = 0; i < content.objections.length; i++) {
          const obj = content.objections[i] as unknown as Record<string, unknown>;
          requireStringAt(obj, 'argument', `objections[${i}].argument`, issues);
          requireEnumAt(obj, 'severity', ['minor', 'major', 'critical'], `objections[${i}].severity`, issues);
          requireStringAt(obj, 'evidence', `objections[${i}].evidence`, issues);
        }
      }
      requireEnum(c, 'recommendation', ['proceed', 'modify', 'reject'], issues);
      break;

    case 'verdict':
      requireString(c, 'propositionId', issues);
      requireString(c, 'objectionesId', issues);
      requireEnum(c, 'judgment', ['approved', 'rejected', 'modified'], issues);
      if (content.reasoning) {
        const r = content.reasoning as unknown as Record<string, unknown>;
        requireStringAt(r, 'verum', 'reasoning.verum', issues);
        requireStringAt(r, 'bonum', 'reasoning.bonum', issues);
        requireStringAt(r, 'pulchrum', 'reasoning.pulchrum', issues);
      } else {
        issues.push({ field: 'reasoning', message: 'Required object "reasoning" is missing' });
      }
      break;

    case 'trial_report':
      requireString(c, 'subject', issues);
      requireArray(c, 'tests', issues);
      if (Array.isArray(content.tests)) {
        for (let i = 0; i < content.tests.length; i++) {
          const test = content.tests[i] as unknown as Record<string, unknown>;
          requireStringAt(test, 'name', `tests[${i}].name`, issues);
          requireEnumAt(test, 'type', ['unit', 'integration', 'chaos', 'adversarial', 'concurrency'], `tests[${i}].type`, issues);
          requireBooleanAt(test, 'passed', `tests[${i}].passed`, issues);
          requireStringAt(test, 'details', `tests[${i}].details`, issues);
        }
      }
      requireEnum(c, 'assessment', ['passed', 'failed', 'conditional'], issues);
      requireArray(c, 'issues', issues);
      break;

    case 'purification_record':
      requireString(c, 'subject', issues);
      validateComplexityMetrics(c, 'complexityBefore', issues);
      validateComplexityMetrics(c, 'complexityAfter', issues);
      requireNumber(c, 'beautyDelta', issues);
      requireArray(c, 'changes', issues);
      requireBoolean(c, 'behaviorPreserved', issues);
      break;

    case 'canon_record':
      requireString(c, 'decision', issues);
      requireString(c, 'adrNumber', issues);
      requireString(c, 'stateHash', issues);
      requireArray(c, 'filesAffected', issues);
      break;

    case 'publication':
      requireString(c, 'title', issues);
      requireString(c, 'summary', issues);
      requireEnum(c, 'audience', ['developers', 'agents', 'steward', 'public'], issues);
      requireString(c, 'body', issues);
      break;

    case 'cycle_orchestration':
      requireEnum(c, 'phase', ['initiation', 'in_progress', 'completed', 'stalled'], issues);
      requireString(c, 'currentOffice', issues);
      requireArray(c, 'artifactIds', issues);
      break;
  }

  return {
    valid: issues.length === 0,
    artifactType: content.type,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Internal Validation Helpers
// ---------------------------------------------------------------------------

function requireString(obj: Record<string, unknown>, field: string, issues: ArtifactValidationIssue[]): void {
  if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
    issues.push({ field, message: `Required string "${field}" is missing or empty` });
  }
}

function requireNumber(obj: Record<string, unknown>, field: string, issues: ArtifactValidationIssue[]): void {
  if (typeof obj[field] !== 'number') {
    issues.push({ field, message: `Required number "${field}" is missing` });
  }
}

function requireBoolean(obj: Record<string, unknown>, field: string, issues: ArtifactValidationIssue[]): void {
  if (typeof obj[field] !== 'boolean') {
    issues.push({ field, message: `Required boolean "${field}" is missing` });
  }
}

function requireArray(obj: Record<string, unknown>, field: string, issues: ArtifactValidationIssue[]): void {
  if (!Array.isArray(obj[field])) {
    issues.push({ field, message: `Required array "${field}" is missing` });
  }
}

function requireEnum(obj: Record<string, unknown>, field: string, values: readonly string[], issues: ArtifactValidationIssue[]): void {
  if (!values.includes(obj[field] as string)) {
    issues.push({ field, message: `"${field}" must be one of: ${values.join(', ')}` });
  }
}

function requireStringAt(obj: Record<string, unknown> | undefined, field: string, path: string, issues: ArtifactValidationIssue[]): void {
  if (!obj || typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
    issues.push({ field: path, message: `Required string "${path}" is missing or empty` });
  }
}

function requireEnumAt(obj: Record<string, unknown> | undefined, field: string, values: readonly string[], path: string, issues: ArtifactValidationIssue[]): void {
  if (!obj || !values.includes(obj[field] as string)) {
    issues.push({ field: path, message: `"${path}" must be one of: ${values.join(', ')}` });
  }
}

function requireBooleanAt(obj: Record<string, unknown> | undefined, field: string, path: string, issues: ArtifactValidationIssue[]): void {
  if (!obj || typeof obj[field] !== 'boolean') {
    issues.push({ field: path, message: `Required boolean "${path}" is missing` });
  }
}

function validateComplexityMetrics(
  obj: Record<string, unknown>,
  field: string,
  issues: ArtifactValidationIssue[],
): void {
  const metrics = obj[field] as Record<string, unknown> | undefined;
  if (!metrics || typeof metrics !== 'object') {
    issues.push({ field, message: `Required object "${field}" is missing` });
    return;
  }
  for (const key of ['lines', 'cyclomaticComplexity', 'dependencies', 'exportedSymbols']) {
    if (typeof metrics[key] !== 'number') {
      issues.push({ field: `${field}.${key}`, message: `Required number "${field}.${key}" is missing` });
    }
  }
}
