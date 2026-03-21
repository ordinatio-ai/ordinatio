// ===========================================
// ORDINATIO SETTINGS — AI Settings Service
// ===========================================
// Reads/writes AI provider configuration from
// the SystemSettings key-value store.
// Priority: DB setting -> env var -> empty string.
// ===========================================

import type { SettingsDb, ProviderId, ProviderConfig, ProviderInfo, AISettings, SettingsCallbacks } from './types';
import { ALL_PROVIDER_IDS } from './types';
import { getSetting, setSetting, SETTINGS_KEYS, type SettingKey } from './settings';

// Re-export for backward compatibility
export { ALL_PROVIDER_IDS };

/** Static config for each provider — maps id to DB setting key, env var, and display name. */
export const PROVIDER_CONFIG: Record<ProviderId, ProviderConfig> = {
  claude:   { settingKey: 'anthropic_api_key', envVar: 'ANTHROPIC_API_KEY', name: 'Anthropic Claude',  placeholder: 'sk-ant-api03-...' },
  openai:   { settingKey: 'openai_api_key',    envVar: 'OPENAI_API_KEY',    name: 'OpenAI GPT',        placeholder: 'sk-proj-...' },
  gemini:   { settingKey: 'gemini_api_key',     envVar: 'GEMINI_API_KEY',    name: 'Google Gemini',     placeholder: 'AIza...' },
  deepseek: { settingKey: 'deepseek_api_key',   envVar: 'DEEPSEEK_API_KEY',  name: 'DeepSeek',          placeholder: 'sk-...' },
  mistral:  { settingKey: 'mistral_api_key',    envVar: 'MISTRAL_API_KEY',   name: 'Mistral AI',        placeholder: 'sk-...' },
  grok:     { settingKey: 'xai_api_key',        envVar: 'XAI_API_KEY',       name: 'xAI Grok',          placeholder: 'xai-...' },
};

/**
 * Mask an API key for safe display.
 * Shows first 6 and last 4 characters: "sk-ant-...5678"
 * Short keys (<=12 chars) show only last 4: "****5678"
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) {
    return '****' + key.slice(-4);
  }
  return key.slice(0, 6) + '...' + key.slice(-4);
}

/**
 * Get the configured LLM provider ID.
 * Falls back to env var, then 'claude'.
 */
export async function getLLMProvider(db: SettingsDb): Promise<string> {
  const dbValue = await getSetting(db, SETTINGS_KEYS.LLM_PROVIDER);
  if (dbValue && dbValue !== '') return dbValue;
  return process.env.LLM_PROVIDER ?? 'claude';
}

/**
 * Get the provider ID for a specific agent role.
 * Returns null if no role-specific override is set.
 */
export async function getRoleProvider(db: SettingsDb, roleId: string): Promise<string | null> {
  const key = `llm_provider_${roleId}` as SettingKey;
  const dbValue = await getSetting(db, key);
  if (dbValue && dbValue !== '') return dbValue;
  return null;
}

/**
 * Set the provider for a specific agent role.
 * Pass empty string to clear the override (use global default).
 */
export async function setRoleProvider(
  db: SettingsDb,
  roleId: string,
  providerId: string,
  callbacks?: SettingsCallbacks,
): Promise<void> {
  await setAISetting(db, `llm_provider_${roleId}`, providerId, callbacks);
}

/**
 * Get the API key for a given provider.
 * Priority: DB setting -> env var -> empty string.
 */
export async function getApiKey(db: SettingsDb, provider: ProviderId): Promise<string> {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return '';

  const dbValue = await getSetting(db, config.settingKey as SettingKey);
  if (dbValue && dbValue !== '') return dbValue;
  return process.env[config.envVar] ?? '';
}

/**
 * Save an AI setting to the database.
 */
export async function setAISetting(
  db: SettingsDb,
  key: string,
  value: string,
  callbacks?: SettingsCallbacks,
): Promise<void> {
  // Build descriptions dynamically from PROVIDER_CONFIG
  const descriptions: Record<string, string> = {
    llm_provider: 'Active LLM provider',
  };
  for (const [id, cfg] of Object.entries(PROVIDER_CONFIG)) {
    descriptions[cfg.settingKey] = `${cfg.name} API key (provider: ${id})`;
  }
  await setSetting(db, key as SettingKey, value, descriptions[key], callbacks);
}

/**
 * Get all AI settings with masked keys for the UI.
 * Returns active provider + per-provider status.
 */
export async function getAISettings(db: SettingsDb): Promise<AISettings> {
  const provider = await getLLMProvider(db);

  const providers: ProviderInfo[] = await Promise.all(
    ALL_PROVIDER_IDS.map(async (id) => {
      const rawKey = await getApiKey(db, id);
      return {
        id,
        name: PROVIDER_CONFIG[id].name,
        maskedKey: maskApiKey(rawKey),
        configured: rawKey.length > 0,
        placeholder: PROVIDER_CONFIG[id].placeholder,
      };
    })
  );

  // Fetch per-role overrides
  const roleOverrides: Record<string, string> = {};
  for (const roleId of ['general', 'bookkeeper', 'coo']) {
    const override = await getRoleProvider(db, roleId);
    if (override) {
      roleOverrides[roleId] = override;
    }
  }

  return { provider, providers, roleOverrides };
}
