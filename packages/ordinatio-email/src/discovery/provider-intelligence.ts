// ===========================================
// PROVIDER INTELLIGENCE — Cross-Tenant Shared Knowledge
// ===========================================
// Learns from successful connections.
// When bob@acmecorp.com connects, alice@acmecorp.com
// on a different tenant gets instant detection.
// ===========================================

import type { DiscoveredProvider, ProviderIntelligenceRecord } from './types';

/**
 * Callback to query the EmailProviderDiscovery table.
 * Injected by the app layer (no DB dependency in the package).
 */
export type IntelligenceQueryFn = (
  domain: string
) => Promise<ProviderIntelligenceRecord | null>;

/**
 * Callback to record a connection result in the table.
 */
export type IntelligenceRecordFn = (
  domain: string,
  provider: DiscoveredProvider,
  success: boolean
) => Promise<void>;

/**
 * Check Provider Intelligence for a domain.
 * Returns the known provider if the domain has been seen before with good success rate.
 */
export async function checkIntelligence(
  domain: string,
  queryFn?: IntelligenceQueryFn
): Promise<DiscoveredProvider | null> {
  if (!queryFn) return null;

  const record = await queryFn(domain);
  if (!record) return null;

  // Require at least 50% success rate and at least 1 success
  const total = record.successCount + record.failureCount;
  if (total === 0 || record.successCount === 0) return null;
  if (record.successCount / total < 0.5) return null;

  return {
    type: record.provider as 'gmail' | 'outlook' | 'imap',
    displayName: `${record.provider} (verified for ${domain})`,
    authMethod: record.authMethod as 'oauth2' | 'password' | 'app_password',
    settings: record.settings,
    confidence: Math.min(99, 70 + record.successCount * 5),
  };
}

/**
 * Record a connection result for future lookups.
 */
export async function recordConnectionResult(
  domain: string,
  provider: DiscoveredProvider,
  success: boolean,
  recordFn?: IntelligenceRecordFn
): Promise<void> {
  if (!recordFn) return;
  await recordFn(domain, provider, success);
}
