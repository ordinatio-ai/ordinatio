// ===========================================
// ORDINATIO SETTINGS — Core Settings Service
// ===========================================
// CRUD for app-wide settings stored in the
// database as key-value pairs.
// ===========================================

import type {
  SettingsDb,
  SettingsCallbacks,
  SettingVisibility,
  SettingMeta,
  SettingManifest,
  SettingHistoryDb,
  SettingChangeSource,
} from './types';
import { ALL_PROVIDER_IDS } from './types';
import { maskApiKey } from './ai-settings';
import { recordSettingChange } from './history';

// Setting keys
export const SETTINGS_KEYS = {
  ADMIN_FEED_ENABLED: 'admin_feed_enabled',
  LLM_PROVIDER: 'llm_provider',
  LLM_PROVIDER_BOOKKEEPER: 'llm_provider_bookkeeper',
  LLM_PROVIDER_COO: 'llm_provider_coo',
  ANTHROPIC_API_KEY: 'anthropic_api_key',
  OPENAI_API_KEY: 'openai_api_key',
  GEMINI_API_KEY: 'gemini_api_key',
  DEEPSEEK_API_KEY: 'deepseek_api_key',
  MISTRAL_API_KEY: 'mistral_api_key',
  XAI_API_KEY: 'xai_api_key',
} as const;

export type SettingKey = typeof SETTINGS_KEYS[keyof typeof SETTINGS_KEYS];

// Default values for settings
const DEFAULTS: Record<SettingKey, string> = {
  [SETTINGS_KEYS.ADMIN_FEED_ENABLED]: 'true',
  [SETTINGS_KEYS.LLM_PROVIDER]: 'claude',
  [SETTINGS_KEYS.LLM_PROVIDER_BOOKKEEPER]: '',
  [SETTINGS_KEYS.LLM_PROVIDER_COO]: '',
  [SETTINGS_KEYS.ANTHROPIC_API_KEY]: '',
  [SETTINGS_KEYS.OPENAI_API_KEY]: '',
  [SETTINGS_KEYS.GEMINI_API_KEY]: '',
  [SETTINGS_KEYS.DEEPSEEK_API_KEY]: '',
  [SETTINGS_KEYS.MISTRAL_API_KEY]: '',
  [SETTINGS_KEYS.XAI_API_KEY]: '',
};

// ---- Visibility Metadata ----

/** Exhaustive metadata map — Record<SettingKey, ...> ensures compile-time completeness. */
export const SETTING_METADATA: Record<SettingKey, SettingMeta> = {
  admin_feed_enabled:      { visibility: 'public',   description: 'Whether the admin activity feed is enabled' },
  llm_provider:            { visibility: 'internal', description: 'Active LLM provider' },
  llm_provider_bookkeeper: { visibility: 'internal', description: 'LLM provider override for bookkeeper role' },
  llm_provider_coo:        { visibility: 'internal', description: 'LLM provider override for COO role' },
  anthropic_api_key:       { visibility: 'secret',   description: 'Anthropic Claude API key' },
  openai_api_key:          { visibility: 'secret',   description: 'OpenAI API key' },
  gemini_api_key:          { visibility: 'secret',   description: 'Google Gemini API key' },
  deepseek_api_key:        { visibility: 'secret',   description: 'DeepSeek API key' },
  mistral_api_key:         { visibility: 'secret',   description: 'Mistral AI API key' },
  xai_api_key:             { visibility: 'secret',   description: 'xAI Grok API key' },
};

/** Check if a key is a known SettingKey. */
function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_METADATA;
}

/** Get the visibility of a setting key. */
export function getSettingVisibility(key: string): SettingVisibility {
  if (isSettingKey(key)) return SETTING_METADATA[key].visibility;
  return 'internal'; // unknown keys default to internal
}

// ---- Value Validation ----

type SettingValidator = (value: string) => string | null;

const PROVIDER_ID_SET = new Set<string>(ALL_PROVIDER_IDS);

/** Per-key validators. Returns null if valid, error message if invalid. */
const SETTING_VALIDATORS: Partial<Record<SettingKey, SettingValidator>> = {
  [SETTINGS_KEYS.LLM_PROVIDER]: (v) => {
    if (v === '' || PROVIDER_ID_SET.has(v)) return null;
    return `Invalid provider ID: "${v}". Must be one of: ${ALL_PROVIDER_IDS.join(', ')}`;
  },
  [SETTINGS_KEYS.LLM_PROVIDER_BOOKKEEPER]: (v) => {
    if (v === '' || PROVIDER_ID_SET.has(v)) return null;
    return `Invalid provider ID: "${v}". Must be one of: ${ALL_PROVIDER_IDS.join(', ')}`;
  },
  [SETTINGS_KEYS.LLM_PROVIDER_COO]: (v) => {
    if (v === '' || PROVIDER_ID_SET.has(v)) return null;
    return `Invalid provider ID: "${v}". Must be one of: ${ALL_PROVIDER_IDS.join(', ')}`;
  },
  [SETTINGS_KEYS.ADMIN_FEED_ENABLED]: (v) => {
    if (v === 'true' || v === 'false') return null;
    return `Invalid boolean value: "${v}". Must be "true" or "false"`;
  },
};

/**
 * Validate a setting value before writing.
 * Returns null if valid, error message if invalid.
 */
export function validateSettingValue(key: SettingKey, value: string): string | null {
  const validator = SETTING_VALIDATORS[key];
  if (!validator) return null;
  return validator(value);
}

// ---- Core CRUD ----

/**
 * Get a setting value by key.
 */
export async function getSetting(db: SettingsDb, key: SettingKey): Promise<string> {
  const setting = await db.systemSettings.findUnique({
    where: { key },
  });

  return setting?.value ?? DEFAULTS[key] ?? '';
}

/**
 * Get a boolean setting.
 */
export async function getBooleanSetting(db: SettingsDb, key: SettingKey): Promise<boolean> {
  const value = await getSetting(db, key);
  return value === 'true';
}

/**
 * Set a setting value with validation, sentinel callback, and history.
 */
export async function setSetting(
  db: SettingsDb,
  key: SettingKey,
  value: string,
  description?: string,
  callbacks?: SettingsCallbacks,
  options?: { source?: SettingChangeSource; changedBy?: string },
): Promise<void> {
  // 1. Validate value
  const validationError = validateSettingValue(key, value);
  if (validationError) {
    throw new SettingsValidationError(key, validationError);
  }

  // 2. Get old value for history + sentinel
  const oldValue = await getSetting(db, key);

  // 3. Sentinel callback (pre-change veto)
  if (callbacks?.onBeforeChange) {
    const result = await callbacks.onBeforeChange({
      key,
      oldValue,
      newValue: value,
      changedBy: options?.changedBy,
      source: options?.source ?? 'api',
    });
    if (!result.allowed) {
      throw new SettingsVetoError(key, result.reason ?? 'Change vetoed');
    }
  }

  // 4. Write to database
  await db.systemSettings.upsert({
    where: { key },
    create: { key, value, description },
    update: { value, description },
  });

  // 5. Record history (if db supports it)
  const historyDb = db as unknown as SettingHistoryDb;
  if (historyDb.settingHistory && typeof historyDb.settingHistory.create === 'function') {
    await recordSettingChange(
      historyDb,
      key,
      oldValue !== '' ? oldValue : null,
      value,
      options?.source ?? 'api',
      options?.changedBy ?? null,
    );
  }

  // 6. Post-change callback
  await callbacks?.onSettingChanged?.(key, value);
}

/**
 * Set a boolean setting.
 */
export async function setBooleanSetting(
  db: SettingsDb,
  key: SettingKey,
  value: boolean,
  description?: string,
  callbacks?: SettingsCallbacks,
): Promise<void> {
  await setSetting(db, key, value ? 'true' : 'false', description, callbacks);
}

/**
 * Get all settings as a key-value object.
 */
export async function getAllSettings(db: SettingsDb): Promise<Record<string, string>> {
  const settings = await db.systemSettings.findMany({ take: 200 });

  // Start with defaults
  const result: Record<string, string> = { ...DEFAULTS };

  // Override with stored values
  for (const setting of settings) {
    result[setting.key] = setting.value;
  }

  return result;
}

// ---- Safe Getters (visibility-aware) ----

/**
 * Get all settings with SECRET values masked.
 * Use this for API responses instead of getAllSettings().
 */
export async function getSafeSettings(db: SettingsDb): Promise<Record<string, string>> {
  const all = await getAllSettings(db);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(all)) {
    if (getSettingVisibility(key) === 'secret') {
      result[key] = maskApiKey(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get only PUBLIC + INTERNAL settings (excludes SECRET keys entirely).
 */
export async function getPublicSettings(db: SettingsDb): Promise<Record<string, string>> {
  const all = await getAllSettings(db);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(all)) {
    if (getSettingVisibility(key) !== 'secret') {
      result[key] = value;
    }
  }

  return result;
}

// ---- Agentic Manifest ----

/**
 * Get a setting with full provenance metadata (for agentic consumers).
 */
export async function getSettingWithManifest(db: SettingsDb, key: SettingKey): Promise<SettingManifest> {
  const meta = SETTING_METADATA[key];
  const record = await db.systemSettings.findUnique({ where: { key } });

  let value: string;
  let source: 'database' | 'default' | 'environment';

  if (record) {
    value = record.value;
    source = 'database';
  } else if (DEFAULTS[key] !== undefined) {
    value = DEFAULTS[key];
    source = 'default';
  } else {
    value = '';
    source = 'default';
  }

  const isSecret = meta.visibility === 'secret';

  return {
    value: isSecret ? maskApiKey(value) : value,
    source,
    visibility: meta.visibility,
    isSecret,
    lastModified: record?.updatedAt ?? null,
    description: meta.description,
  };
}

// ---- Error Classes ----

export class SettingsValidationError extends Error {
  public readonly key: string;
  constructor(key: string, message: string) {
    super(`Validation failed for setting "${key}": ${message}`);
    this.name = 'SettingsValidationError';
    this.key = key;
  }
}

export class SettingsVetoError extends Error {
  public readonly key: string;
  public readonly reason: string;
  constructor(key: string, reason: string) {
    super(`Setting change for "${key}" was vetoed: ${reason}`);
    this.name = 'SettingsVetoError';
    this.key = key;
    this.reason = reason;
  }
}
