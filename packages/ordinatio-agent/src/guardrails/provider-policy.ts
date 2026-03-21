// ===========================================
// AGENT FRAMEWORK — PROVIDER TRUST POLICY
// ===========================================
// Maps LLM providers to the data sensitivity
// levels they are allowed to access. Default:
// all providers trusted for all levels. Apps
// override with their own trust map.
// ===========================================

import type { DataTrustLevel, ProviderTrust } from '../types';

// ===========================================
// TRUST LEVELS — ORDERED
// ===========================================

const TRUST_ORDINAL: Record<DataTrustLevel, number> = {
  none: 0,
  internal: 1,
  sensitive: 2,
  critical: 3,
};

// ===========================================
// DEFAULT TRUST MAP
// ===========================================

/**
 * Default trust: all providers trusted for all levels.
 * Apps override this with their own restrictions.
 */
const DEFAULT_TRUST_MAP: Record<string, ProviderTrust> = {
  claude:   { maxDataSensitivity: 'critical' },
  openai:   { maxDataSensitivity: 'critical' },
  gemini:   { maxDataSensitivity: 'critical' },
  mistral:  { maxDataSensitivity: 'critical' },
  deepseek: { maxDataSensitivity: 'critical' },
  grok:     { maxDataSensitivity: 'critical' },
};

// ===========================================
// POLICY CHECK
// ===========================================

/**
 * Check whether a provider is trusted to access a tool with the given sensitivity.
 *
 * @param providerId - The LLM provider ID
 * @param toolSensitivity - The tool's data sensitivity level (or 'none')
 * @param trustMap - Optional override for trust configuration. Default: all trusted.
 * @returns true if the provider can access this sensitivity level
 */
export function canProviderAccessTool(
  providerId: string,
  toolSensitivity: string | undefined,
  trustMap?: Record<string, ProviderTrust>,
): boolean {
  const level = (toolSensitivity ?? 'none') as DataTrustLevel;
  const map = trustMap ?? DEFAULT_TRUST_MAP;
  const trust = map[providerId];

  if (!trust) {
    // Unknown provider — only allow 'none'-level access
    return level === 'none';
  }

  return TRUST_ORDINAL[level] <= TRUST_ORDINAL[trust.maxDataSensitivity];
}

/**
 * Get the maximum data sensitivity a provider can access.
 *
 * @param providerId - The LLM provider ID
 * @param trustMap - Optional override. Default: all trusted.
 * @returns The maximum DataTrustLevel, or 'none' for unknown providers
 */
export function getProviderMaxSensitivity(
  providerId: string,
  trustMap?: Record<string, ProviderTrust>,
): DataTrustLevel {
  const map = trustMap ?? DEFAULT_TRUST_MAP;
  return map[providerId]?.maxDataSensitivity ?? 'none';
}
