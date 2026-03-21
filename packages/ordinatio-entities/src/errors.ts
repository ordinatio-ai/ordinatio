// ===========================================
// @ordinatio/entities — ERROR REGISTRY (Rule 8)
// ===========================================
// Merged error codes from entity knowledge (KNOWLEDGE_300-361)
// and agent knowledge (AGENTKNOW_400-412).
// Plus Contact error classes.
// ===========================================
// CODES: KNOWLEDGE_300-361, AGENTKNOW_400-412
// ===========================================

// ----- Error Types -----

interface ErrorDiagnosis {
  step: string;
  check: string;
}

export interface KnowledgeErrorDef {
  code: string;
  file: string;
  function: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  description: string;
  diagnosis: ErrorDiagnosis[];
}

export interface AgentKnowledgeErrorEntry {
  code: string;
  file: string;
  function: string;
  httpStatus: number;
  severity: 'warning' | 'error' | 'critical';
  recoverable: boolean;
  description: string;
  diagnosis: string[];
}

// ===========================================
// KNOWLEDGE ERRORS (300-332)
// ===========================================

export const KNOWLEDGE_ERRORS: Record<string, KnowledgeErrorDef> = {
  KNOWLEDGE_300: {
    code: 'KNOWLEDGE_300',
    file: 'knowledge/field-definitions.ts',
    function: 'getFieldDefinitions',
    severity: 'high',
    recoverable: true,
    description: 'Failed to list field definitions.',
    diagnosis: [
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
      { step: 'Check schema', check: 'Run pnpm db:push to ensure EntityFieldDefinition table exists' },
    ],
  },
  KNOWLEDGE_301: {
    code: 'KNOWLEDGE_301',
    file: 'knowledge/field-definitions.ts',
    function: 'createFieldDefinition',
    severity: 'high',
    recoverable: true,
    description: 'Failed to create field definition.',
    diagnosis: [
      { step: 'Check uniqueness', check: 'entityType + key must be unique' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
      { step: 'Check validation', check: 'Review Zod validation errors in response body' },
    ],
  },
  KNOWLEDGE_302: {
    code: 'KNOWLEDGE_302',
    file: 'knowledge/field-definitions.ts',
    function: 'updateFieldDefinition',
    severity: 'high',
    recoverable: true,
    description: 'Failed to update field definition.',
    diagnosis: [
      { step: 'Check field exists', check: 'Verify field ID is valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_303: {
    code: 'KNOWLEDGE_303',
    file: 'knowledge/field-definitions.ts',
    function: 'getFieldDefinitionById',
    severity: 'low',
    recoverable: true,
    description: 'Field definition not found.',
    diagnosis: [
      { step: 'Verify field ID', check: 'Check that field exists in EntityFieldDefinition table' },
    ],
  },
  KNOWLEDGE_304: {
    code: 'KNOWLEDGE_304',
    file: 'knowledge/field-definitions.ts',
    function: 'deactivateFieldDefinition',
    severity: 'high',
    recoverable: true,
    description: 'Failed to deactivate field definition.',
    diagnosis: [
      { step: 'Check field exists', check: 'Field may have been deleted already' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_305: {
    code: 'KNOWLEDGE_305',
    file: 'knowledge/search.ts',
    function: 'searchByFields',
    severity: 'high',
    recoverable: true,
    description: 'Failed to search entities by field values.',
    diagnosis: [
      { step: 'Check filter format', check: 'Filters must be { fieldKey: value } pairs' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_310: {
    code: 'KNOWLEDGE_310',
    file: 'knowledge/ledger.ts',
    function: 'getEntityFields',
    severity: 'high',
    recoverable: true,
    description: 'Failed to read entity field values.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_311: {
    code: 'KNOWLEDGE_311',
    file: 'knowledge/ledger.ts',
    function: 'setEntityFields',
    severity: 'high',
    recoverable: true,
    description: 'Failed to write entity field values.',
    diagnosis: [
      { step: 'Check field definitions', check: 'All field keys must match approved field definitions' },
      { step: 'Check value types', check: 'Values must match field dataType (text, number, date, etc.)' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_312: {
    code: 'KNOWLEDGE_312',
    file: 'knowledge/ledger.ts',
    function: 'getFieldHistory',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to load field value history.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_313: {
    code: 'KNOWLEDGE_313',
    file: 'knowledge/ledger.ts',
    function: 'setEntityFields',
    severity: 'medium',
    recoverable: true,
    description: 'Unknown field key — no approved field definition found.',
    diagnosis: [
      { step: 'Check field key', check: 'Verify key matches an approved EntityFieldDefinition' },
      { step: 'Check entity type', check: 'Field must be defined for this entity type' },
    ],
  },
  KNOWLEDGE_314: {
    code: 'KNOWLEDGE_314',
    file: 'knowledge/ledger.ts',
    function: 'setEntityFields',
    severity: 'low',
    recoverable: true,
    description: 'Failed to supersede old ledger entry during value update.',
    diagnosis: [
      { step: 'Check DB connectivity', check: 'Transaction may have failed mid-write' },
      { step: 'Retry operation', check: 'Supersede + insert should be atomic' },
    ],
  },
  KNOWLEDGE_320: {
    code: 'KNOWLEDGE_320',
    file: 'knowledge/search.ts',
    function: 'logSearchQuery',
    severity: 'low',
    recoverable: true,
    description: 'Failed to log search query.',
    diagnosis: [
      { step: 'Check DB connectivity', check: 'Query logging is best-effort — does not block search' },
    ],
  },
  KNOWLEDGE_321: {
    code: 'KNOWLEDGE_321',
    file: 'knowledge/search.ts',
    function: 'logSearchQuery',
    severity: 'low',
    recoverable: true,
    description: 'Failed to process search query log request.',
    diagnosis: [
      { step: 'Check request body', check: 'Must include query and source fields' },
    ],
  },
  KNOWLEDGE_330: {
    code: 'KNOWLEDGE_330',
    file: 'knowledge/batch.ts',
    function: 'runKnowledgeBatch',
    severity: 'high',
    recoverable: true,
    description: 'Knowledge batch job failed during execution.',
    diagnosis: [
      { step: 'Check DB connectivity', check: 'Batch job needs read/write access to multiple tables' },
      { step: 'Check logs', check: 'Review worker logs for detailed error trace' },
    ],
  },
  KNOWLEDGE_331: {
    code: 'KNOWLEDGE_331',
    file: 'knowledge/batch.ts',
    function: 'extractFieldsFromNotes',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to extract structured fields from notes.',
    diagnosis: [
      { step: 'Check note content', check: 'Notes may be empty or contain no extractable data' },
      { step: 'Check field hints', check: 'Verify extractionHint values on field definitions' },
    ],
  },
  KNOWLEDGE_332: {
    code: 'KNOWLEDGE_332',
    file: 'knowledge/batch.ts',
    function: 'buildTemporalPatterns',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to build temporal search patterns.',
    diagnosis: [
      { step: 'Check query logs', check: 'SearchQueryLog may have no unprocessed entries' },
      { step: 'Check DB connectivity', check: 'Pattern upsert may have failed' },
    ],
  },

  // --- Time-Travel (340-341) ---

  KNOWLEDGE_340: {
    code: 'KNOWLEDGE_340',
    file: 'knowledge/time-travel.ts',
    function: 'getKnowledgeAt',
    severity: 'high',
    recoverable: true,
    description: 'Failed to reconstruct knowledge state at point in time.',
    diagnosis: [
      { step: 'Check timestamp', check: 'Ensure timestamp is a valid Date object' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_341: {
    code: 'KNOWLEDGE_341',
    file: 'knowledge/time-travel.ts',
    function: 'getKnowledgeTimeline',
    severity: 'medium',
    recoverable: true,
    description: 'Invalid date range for knowledge timeline query.',
    diagnosis: [
      { step: 'Check date order', check: 'from must be before to' },
      { step: 'Check date format', check: 'Both from and to must be valid Date objects' },
    ],
  },

  // --- Decay (342) ---

  KNOWLEDGE_342: {
    code: 'KNOWLEDGE_342',
    file: 'knowledge/decay.ts',
    function: 'getStaleFields',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to compute stale fields for entity.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },

  // --- Branching (343-344) ---

  KNOWLEDGE_343: {
    code: 'KNOWLEDGE_343',
    file: 'knowledge/branching.ts',
    function: 'setEntityFieldsWithBranching',
    severity: 'high',
    recoverable: true,
    description: 'Failed to write entity fields with branching validation.',
    diagnosis: [
      { step: 'Check field definitions', check: 'All field keys must match approved field definitions' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_344: {
    code: 'KNOWLEDGE_344',
    file: 'knowledge/branching.ts',
    function: 'setEntityFieldsWithBranching',
    severity: 'medium',
    recoverable: true,
    description: 'Validation callback failed during branching check.',
    diagnosis: [
      { step: 'Check callback', check: 'Ensure requestValidation callback is implemented correctly' },
      { step: 'Check connectivity', check: 'Callback may depend on external service' },
    ],
  },

  // --- Shadow Graph (345) ---

  KNOWLEDGE_345: {
    code: 'KNOWLEDGE_345',
    file: 'knowledge/shadow-graph.ts',
    function: 'findRelatedEntities',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to discover entity relationships via shared fields.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },

  // --- Reflection (346-347) ---

  KNOWLEDGE_346: {
    code: 'KNOWLEDGE_346',
    file: 'knowledge/reflection.ts',
    function: 'detectConflicts',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to detect contradictions in entity knowledge.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_347: {
    code: 'KNOWLEDGE_347',
    file: 'knowledge/reflection.ts',
    function: 'scanForConflicts',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to scan entities for contradictions.',
    diagnosis: [
      { step: 'Check entity type', check: 'Verify entityType is valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },

  KNOWLEDGE_348: {
    code: 'KNOWLEDGE_348',
    file: 'knowledge/scoring.ts',
    function: 'computeEntityTruthScores',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to compute truth scores for entity fields.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },

  // --- Observer (350-352) ---

  KNOWLEDGE_350: {
    code: 'KNOWLEDGE_350',
    file: 'knowledge/observer.ts',
    function: 'checkConstraints',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to evaluate field constraints for entity.',
    diagnosis: [
      { step: 'Check constraints JSON', check: 'Ensure constraints on field definitions are valid JSON arrays' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_351: {
    code: 'KNOWLEDGE_351',
    file: 'knowledge/observer.ts',
    function: 'fireObservers',
    severity: 'low',
    recoverable: true,
    description: 'Observer callback failed during constraint violation notification.',
    diagnosis: [
      { step: 'Check callback', check: 'Ensure onConstraintViolation callback is implemented correctly' },
      { step: 'Non-blocking', check: 'Observer failures do not block writes' },
    ],
  },
  KNOWLEDGE_352: {
    code: 'KNOWLEDGE_352',
    file: 'knowledge/observer.ts',
    function: 'evaluateConstraint',
    severity: 'low',
    recoverable: true,
    description: 'Invalid constraint definition on field.',
    diagnosis: [
      { step: 'Check operator', check: 'Operator must be one of: not_in, in, not_equal, less_than, greater_than, regex' },
      { step: 'Check values', check: 'Ensure values/value/pattern match the operator' },
    ],
  },

  // --- Ghost Fields (355-356) ---

  KNOWLEDGE_355: {
    code: 'KNOWLEDGE_355',
    file: 'knowledge/ghost-fields.ts',
    function: 'predictGhostFields',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to predict ghost fields from co-occurrence patterns.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check data volume', check: 'Co-occurrence requires sufficient data (minOccurrences)' },
    ],
  },
  KNOWLEDGE_356: {
    code: 'KNOWLEDGE_356',
    file: 'knowledge/ghost-fields.ts',
    function: 'writeGhostFields',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to write predicted ghost field values.',
    diagnosis: [
      { step: 'Check field definitions', check: 'Predicted field keys must match approved definitions' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },

  // --- Health (360-361) ---

  KNOWLEDGE_360: {
    code: 'KNOWLEDGE_360',
    file: 'knowledge/health.ts',
    function: 'computeEntityHealth',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to compute entity health report.',
    diagnosis: [
      { step: 'Check entity exists', check: 'Verify entityType and entityId are valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
  KNOWLEDGE_361: {
    code: 'KNOWLEDGE_361',
    file: 'knowledge/health.ts',
    function: 'getEntityTypeHealth',
    severity: 'medium',
    recoverable: true,
    description: 'Failed to compute entity type health summary.',
    diagnosis: [
      { step: 'Check entity type', check: 'Verify entityType is valid' },
      { step: 'Check DB connectivity', check: 'Verify DATABASE_URL is reachable' },
    ],
  },
} as const;

// ===========================================
// AGENT KNOWLEDGE ERRORS (400-412)
// ===========================================

export const AGENTKNOW_ERRORS: Record<string, AgentKnowledgeErrorEntry> = {
  AGENTKNOW_400: {
    code: 'AGENTKNOW_400',
    file: 'agent/knowledge.ts',
    function: 'queryKnowledge',
    httpStatus: 400,
    severity: 'warning',
    recoverable: true,
    description: 'Knowledge query failed — invalid parameters',
    diagnosis: [
      'Check that entity is a non-empty string (e.g., "order-item")',
      'If field is provided, it must be a non-empty string',
      'If search is provided, it must be at least 1 character',
    ],
  },
  AGENTKNOW_401: {
    code: 'AGENTKNOW_401',
    file: 'agent/knowledge.ts',
    function: 'queryKnowledge',
    httpStatus: 500,
    severity: 'error',
    recoverable: true,
    description: 'Knowledge query failed — database error',
    diagnosis: [
      'Check database connectivity',
      'Verify AgentKnowledge table exists (run pnpm db:push)',
      'Check Prisma logs for query errors',
    ],
  },
  AGENTKNOW_402: {
    code: 'AGENTKNOW_402',
    file: 'agent/knowledge.ts',
    function: 'createKnowledgeEntry',
    httpStatus: 400,
    severity: 'warning',
    recoverable: true,
    description: 'Knowledge entry creation failed — validation error',
    diagnosis: [
      'entity, field, value, and label are all required',
      'entity must be a recognized entity type (e.g., "order-item")',
      'aliases must be an array of strings if provided',
      'Check Zod validation errors in context.validationErrors',
    ],
  },
  AGENTKNOW_403: {
    code: 'AGENTKNOW_403',
    file: 'agent/knowledge.ts',
    function: 'createKnowledgeEntry',
    httpStatus: 409,
    severity: 'warning',
    recoverable: true,
    description: 'Knowledge entry already exists for this entity/field/value combination',
    diagnosis: [
      'An entry with the same entity + field + value already exists',
      'Use updateKnowledgeEntry to modify existing entries',
      'Or use a different value if this is a genuinely new option',
    ],
  },
  AGENTKNOW_404: {
    code: 'AGENTKNOW_404',
    file: 'agent/knowledge.ts',
    function: 'updateKnowledgeEntry',
    httpStatus: 404,
    severity: 'warning',
    recoverable: true,
    description: 'Knowledge entry not found',
    diagnosis: [
      'Verify the entry ID is correct',
      'The entry may have been deleted',
      'Use queryKnowledge to find valid entry IDs',
    ],
  },
  AGENTKNOW_405: {
    code: 'AGENTKNOW_405',
    file: 'agent/knowledge.ts',
    function: 'deleteKnowledgeEntry',
    httpStatus: 404,
    severity: 'warning',
    recoverable: true,
    description: 'Cannot delete knowledge entry — not found',
    diagnosis: [
      'Verify the entry ID is correct',
      'The entry may have already been deleted',
    ],
  },
  AGENTKNOW_406: {
    code: 'AGENTKNOW_406',
    file: 'agent/preferences.ts',
    function: 'getPreferences',
    httpStatus: 400,
    severity: 'warning',
    recoverable: true,
    description: 'Preference query failed — invalid parameters',
    diagnosis: [
      'entity must be a non-empty string',
      'userId is optional — omit for org-wide preferences',
    ],
  },
  AGENTKNOW_407: {
    code: 'AGENTKNOW_407',
    file: 'agent/preferences.ts',
    function: 'setPreference',
    httpStatus: 400,
    severity: 'warning',
    recoverable: true,
    description: 'Preference creation failed — validation error',
    diagnosis: [
      'entity, field, value, and label are all required',
      'conditions must be a valid JSON object if provided',
      'Check Zod validation errors in context.validationErrors',
    ],
  },
  AGENTKNOW_408: {
    code: 'AGENTKNOW_408',
    file: 'agent/preferences.ts',
    function: 'deletePreference',
    httpStatus: 404,
    severity: 'warning',
    recoverable: true,
    description: 'Preference not found',
    diagnosis: [
      'Verify the preference ID is correct',
      'The preference may have already been deleted',
    ],
  },
  AGENTKNOW_409: {
    code: 'AGENTKNOW_409',
    file: 'agent/knowledge.ts',
    function: 'ensureKnowledgeDefaults',
    httpStatus: 500,
    severity: 'error',
    recoverable: true,
    description: 'Seed data insertion failed',
    diagnosis: [
      'Check database connectivity',
      'Verify AgentKnowledge table exists (run pnpm db:push)',
      'Check for unique constraint violations in seed data',
      'Inspect Prisma error details for specific row failures',
    ],
  },
  AGENTKNOW_410: {
    code: 'AGENTKNOW_410',
    file: 'agent/knowledge.ts',
    function: 'resetKnowledgeDefaults',
    httpStatus: 500,
    severity: 'error',
    recoverable: true,
    description: 'Knowledge reset failed — could not delete and re-seed',
    diagnosis: [
      'Check database connectivity',
      'Verify transaction support is working',
      'This deletes ALL entries with source="seed" and re-inserts defaults',
    ],
  },
  AGENTKNOW_411: {
    code: 'AGENTKNOW_411',
    file: 'api/agent/knowledge/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error',
    recoverable: true,
    description: 'Failed to query agent knowledge entries.',
    diagnosis: [
      'Check database connectivity',
      'Verify AgentKnowledge table exists',
      'May be a service-level error not caught by specific AGENTKNOW_400/401 codes',
    ],
  },
  AGENTKNOW_412: {
    code: 'AGENTKNOW_412',
    file: 'api/agent/knowledge/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error',
    recoverable: true,
    description: 'Failed to create agent knowledge entry.',
    diagnosis: [
      'Check database connectivity',
      'Verify AgentKnowledge table exists',
      'May be a service-level error not caught by specific AGENTKNOW_402/403 codes',
    ],
  },
};

// ===========================================
// ERROR BUILDERS
// ===========================================

/**
 * Create a knowledge error with unique timestamped reference.
 */
export function knowledgeError(
  code: keyof typeof KNOWLEDGE_ERRORS,
  context?: Record<string, unknown>
): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: ErrorDiagnosis[];
  context: Record<string, unknown>;
} {
  const def = KNOWLEDGE_ERRORS[code];
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z/, '');

  return {
    code: def.code,
    ref: `${def.code}-${timestamp}`,
    timestamp: new Date().toISOString(),
    module: 'KNOWLEDGE',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

/**
 * Enhanced error builder v2 for agent knowledge errors.
 * Full diagnostic object — machines read this and have all info
 * needed to diagnose and fix without looking anything up.
 */
export function agentKnowledgeError(
  code: keyof typeof AGENTKNOW_ERRORS,
  context?: Record<string, unknown>
): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  const entry = AGENTKNOW_ERRORS[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  return {
    code: entry.code,
    ref: `${entry.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'AGENT_KNOWLEDGE',
    description: entry.description,
    severity: entry.severity,
    recoverable: entry.recoverable,
    diagnosis: [...entry.diagnosis],
    context: context || {},
  };
}

// ===========================================
// CONTACT ERROR CLASSES
// ===========================================

export class ContactNotFoundError extends Error {
  constructor(id: string) {
    super(`Contact not found: ${id}`);
    this.name = 'ContactNotFoundError';
  }
}

export class ContactExistsError extends Error {
  constructor(email: string) {
    super(`Contact already exists with email: ${email}`);
    this.name = 'ContactExistsError';
  }
}

export class ContactAlreadyConvertedError extends Error {
  constructor(id: string) {
    super(`Contact ${id} has already been converted to a client`);
    this.name = 'ContactAlreadyConvertedError';
  }
}
