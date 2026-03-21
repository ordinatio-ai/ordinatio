// ===========================================
// ORDINATIO SETTINGS — Error Registry
// ===========================================
// Error codes for system settings retrieval,
// updates, validation, and AI/LLM provider config.
// Rule 8 compliance: code + ref + runtime context.
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function settingsError(code: string, context?: Record<string, unknown>): {
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
  const def = SETTINGS_ERRORS[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'SETTINGS',
      description: `Unknown error code: ${code}`,
      severity: 'error',
      recoverable: false,
      diagnosis: [],
      context: context || {},
    };
  }

  return {
    code: def.code,
    ref: `${def.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'SETTINGS',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

export const SETTINGS_ERRORS = {
  // ===========================
  // 100-104: Get / Update
  // ===========================
  SETTINGS_100: {
    code: 'SETTINGS_100',
    file: 'api/settings/route.ts',
    function: 'GET',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to settings endpoint.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth session cookie is present',
      'Verify getSession() returns a valid user',
    ],
  },
  SETTINGS_101: {
    code: 'SETTINGS_101',
    file: 'api/settings/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to retrieve system settings from database.',
    diagnosis: [
      'Database error in getAllSettings()',
      'Check DATABASE_URL connectivity',
      'Verify SystemSettings table exists and is accessible',
      'Defaults will be returned if the table is empty — this error means a deeper issue',
    ],
  },
  SETTINGS_102: {
    code: 'SETTINGS_102',
    file: 'api/settings/route.ts',
    function: 'PUT',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update a system setting.',
    diagnosis: [
      'Database error in setSetting() upsert',
      'Check DATABASE_URL connectivity',
      'Verify the key is a valid SettingKey (SETTINGS_KEYS enum)',
      'Check for unique constraint violations if key format changed',
    ],
  },
  SETTINGS_103: {
    code: 'SETTINGS_103',
    file: 'api/settings/route.ts',
    function: 'PUT',
    httpStatus: 429,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Rate limit exceeded for settings update.',
    diagnosis: [
      'User is updating settings too frequently',
      'Check RATE_LIMITS.SETTINGS configuration in rate-limit.ts',
      'Wait before retrying — rate limit window will reset',
    ],
  },
  SETTINGS_104: {
    code: 'SETTINGS_104',
    file: 'services/settings.service.ts',
    function: 'getSetting',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to read individual setting by key.',
    diagnosis: [
      'Database error in findUnique() for SystemSettings',
      'Check DATABASE_URL connectivity',
      'Function returns default value on missing rows — this means a DB-level failure',
    ],
  },

  // ===========================
  // 200-204: Validation
  // ===========================
  SETTINGS_200: {
    code: 'SETTINGS_200',
    file: 'api/settings/route.ts',
    function: 'PUT',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Settings update request body validation failed.',
    diagnosis: [
      'Request body missing key or value field',
      'Key must be one of the SettingKeySchema enum values',
      'Value must be a string, boolean, or number (auto-coerced to string)',
      'Check Zod validation error details in response body',
    ],
  },
  SETTINGS_201: {
    code: 'SETTINGS_201',
    file: 'lib/validation/settings.schema.ts',
    function: 'UpdateSettingSchema',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Setting key is not in the allowed enum list.',
    diagnosis: [
      'The key must match one of the values in SettingKeySchema',
      'Check SETTINGS_KEYS in settings.service.ts for valid keys',
      'New settings must be added to both SETTINGS_KEYS and SettingKeySchema',
    ],
  },
  SETTINGS_202: {
    code: 'SETTINGS_202',
    file: 'api/settings/ai/route.ts',
    function: 'PUT',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'AI settings update validation failed.',
    diagnosis: [
      'Request body does not match UpdateAISettingSchema',
      'Key must be one of the AI_SETTING_KEYS (llm_provider, api keys, etc.)',
      'Value must be a string',
      'Check Zod validation error details in response body',
    ],
  },
  SETTINGS_203: {
    code: 'SETTINGS_203',
    file: 'api/settings/ai/route.ts',
    function: 'PUT',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Invalid LLM provider ID supplied.',
    diagnosis: [
      'Provider must be one of: claude, openai, gemini, deepseek, mistral, grok',
      'Empty string is allowed for role-specific overrides (clears override)',
      'Check ALL_PROVIDER_IDS in ai-settings.service.ts for the valid list',
    ],
  },
  SETTINGS_204: {
    code: 'SETTINGS_204',
    file: 'services/settings.service.ts',
    function: 'setBooleanSetting',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Invalid boolean value for boolean setting.',
    diagnosis: [
      'Boolean settings store "true" or "false" as strings',
      'Ensure the input is actually a boolean before calling setBooleanSetting()',
      'Check admin_feed_enabled or other boolean-type settings',
    ],
  },

  // ===========================
  // 300-302: AI / Provider Config
  // ===========================
  SETTINGS_300: {
    code: 'SETTINGS_300',
    file: 'api/settings/ai/route.ts',
    function: 'GET',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to AI settings endpoint.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth session cookie is present',
      'AI settings require authentication — no anonymous access',
    ],
  },
  SETTINGS_301: {
    code: 'SETTINGS_301',
    file: 'api/settings/ai/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to retrieve AI settings (provider config + masked keys).',
    diagnosis: [
      'Database error in getAISettings()',
      'Check DATABASE_URL connectivity',
      'Verify all PROVIDER_CONFIG entries have valid settingKey values',
      'Check env vars for fallback values (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)',
    ],
  },
  SETTINGS_302: {
    code: 'SETTINGS_302',
    file: 'api/settings/ai/route.ts',
    function: 'PUT',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to save AI setting or clear provider cache.',
    diagnosis: [
      'Database error in setAISetting() or setSetting() upsert',
      'clearProviderCache() may have thrown during dynamic import',
      'Check DATABASE_URL connectivity',
      'Verify the llm-provider module is importable at runtime',
    ],
  },

  SETTINGS_205: {
    code: 'SETTINGS_205',
    file: 'settings.ts',
    function: 'setSetting',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Setting value failed validation (e.g., invalid provider ID or boolean).',
    diagnosis: [
      'Value does not pass the per-key validator in SETTING_VALIDATORS',
      'For llm_provider: must be one of ALL_PROVIDER_IDS or empty string',
      'For admin_feed_enabled: must be "true" or "false"',
      'Check the error message for the specific validation failure',
    ],
  },
  SETTINGS_206: {
    code: 'SETTINGS_206',
    file: 'settings.ts',
    function: 'getSafeSettings',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to retrieve safe (masked) settings.',
    diagnosis: [
      'Database error in getAllSettings() or masking logic',
      'Check DATABASE_URL connectivity',
      'Verify SETTING_METADATA covers all stored keys',
    ],
  },
  SETTINGS_207: {
    code: 'SETTINGS_207',
    file: 'settings.ts',
    function: 'getSettingWithManifest',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to retrieve setting manifest with provenance metadata.',
    diagnosis: [
      'Database error in findUnique() for setting',
      'Check SETTING_METADATA has an entry for the requested key',
      'Verify the key is a valid SettingKey',
    ],
  },
  SETTINGS_208: {
    code: 'SETTINGS_208',
    file: 'settings.ts',
    function: 'setSetting',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Setting change was vetoed by sentinel callback (onBeforeChange).',
    diagnosis: [
      'The onBeforeChange callback returned { allowed: false }',
      'Check the reason field in the SettingsVetoError for details',
      'This is by design — sentinel callbacks enforce business rules before writes',
    ],
  },

  // ===========================
  // 400-402: User Preferences
  // ===========================
  SETTINGS_400: {
    code: 'SETTINGS_400',
    file: 'api/user/preferences/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to retrieve user preferences.',
    diagnosis: [
      'Database error in getPreferences()',
      'Check DATABASE_URL connectivity',
      'Verify UserPreference table exists',
    ],
  },
  SETTINGS_401: {
    code: 'SETTINGS_401',
    file: 'api/user/preferences/route.ts',
    function: 'PATCH',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update user preferences.',
    diagnosis: [
      'Database error in updatePreferences()',
      'Check DATABASE_URL connectivity',
      'Verify request body matches UpdatePreferencesSchema',
    ],
  },
  SETTINGS_209: {
    code: 'SETTINGS_209',
    file: 'proposals.ts',
    function: 'proposeSettingChange',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create setting change proposal.',
    diagnosis: [
      'Database error in settingProposal.create()',
      'Check that SettingProposal table exists in the schema',
      'Verify proposal payload fields are valid',
    ],
  },
  SETTINGS_210: {
    code: 'SETTINGS_210',
    file: 'proposals.ts',
    function: 'approveSettingChange',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Proposal approval failed — invalid state, expired, or duplicate approver.',
    diagnosis: [
      'Proposal may not be in PROPOSED status',
      'Proposal may have expired',
      'The same approverId may have already approved',
      'Check the error message for specifics',
    ],
  },
  SETTINGS_211: {
    code: 'SETTINGS_211',
    file: 'proposals.ts',
    function: 'applyApprovedChange',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Cannot apply proposal — not APPROVED or expired.',
    diagnosis: [
      'Proposal status must be APPROVED before applying',
      'Check that the proposal has not expired since approval',
      'Verify the setting key is still valid',
    ],
  },
  SETTINGS_212: {
    code: 'SETTINGS_212',
    file: 'merkle.ts',
    function: 'verifySettingsIntegrity',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Settings integrity verification failed — Merkle root mismatch.',
    diagnosis: [
      'Settings may have been modified outside the normal API flow',
      'A direct database write may have changed a value',
      'Compare currentRoot with expectedRoot for drift detection',
      'Re-compute the baseline if the change was intentional',
    ],
  },
  SETTINGS_213: {
    code: 'SETTINGS_213',
    file: 'encryption.ts',
    function: 'encryptSettingValue',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Failed to encrypt a secret setting value.',
    diagnosis: [
      'SETTINGS_ENCRYPTION_KEY env var may not be set',
      'Key may not be the correct length (64 hex chars = 32 bytes)',
      'Check KeyProvider implementation for errors',
    ],
  },

  // ===========================
  // 400-402: User Preferences
  // ===========================
  SETTINGS_402: {
    code: 'SETTINGS_402',
    file: 'user-preferences.ts',
    function: 'getPreferences',
    httpStatus: 500,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Race condition recovery during user preference creation (P2002 fallback).',
    diagnosis: [
      'Two concurrent requests tried to create preferences for the same user',
      'The P2002 unique constraint violation was caught and the existing record was returned',
      'If this error surfaces, the fallback findUnique also returned null — unexpected state',
      'Check for database replication lag or transaction isolation issues',
    ],
  },
} as const;
