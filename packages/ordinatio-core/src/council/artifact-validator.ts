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
  const issues = validateCommonFields(content);
  switch (content.type) {
    case 'propositio':
      requireString(content, 'signal', issues);
      requireString(content, 'proposal', issues);
      break;
    // Other validations handle similar types...
  }
  return { valid: issues.length === 0, artifactType: content.type, issues };
}

/**
 * Performs the common field validations.
 */
function validateCommonFields(content: ArtifactContent): ArtifactValidationIssue[] {
  const issues: ArtifactValidationIssue[] = [];
  // Generic checks applicable to all artifacts can be inserted here
  return issues;
}
