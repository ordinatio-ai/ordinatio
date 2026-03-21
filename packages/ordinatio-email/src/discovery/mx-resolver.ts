// ===========================================
// MX RESOLVER — DNS MX Lookup + Known Provider Matching
// ===========================================

import { promises as dns } from 'node:dns';
import type { MxRecord, DiscoveredProvider } from './types';

// ─── Known provider patterns (MX exchange → provider type) ───

const KNOWN_MX_PATTERNS: Array<{
  pattern: RegExp;
  type: 'gmail' | 'outlook';
  displayName: string;
  authMethod: 'oauth2';
}> = [
  {
    pattern: /google(mail)?\.com|smtp\.google\.com/i,
    type: 'gmail',
    displayName: 'Google Workspace / Gmail',
    authMethod: 'oauth2',
  },
  {
    pattern: /outlook\.com|microsoft\.com|office365\.com|hotmail\.com/i,
    type: 'outlook',
    displayName: 'Microsoft 365 / Outlook',
    authMethod: 'oauth2',
  },
];

/**
 * Resolve MX records for a domain.
 * Returns empty array on DNS failure (non-fatal).
 */
export async function resolveMx(domain: string): Promise<MxRecord[]> {
  try {
    const records = await dns.resolveMx(domain);
    return records
      .map((r) => ({ exchange: r.exchange, priority: r.priority }))
      .sort((a, b) => a.priority - b.priority);
  } catch {
    return [];
  }
}

/**
 * Match MX records against known email providers.
 * Returns the best-matching provider or null.
 */
export function matchKnownProvider(mxRecords: MxRecord[]): DiscoveredProvider | null {
  for (const mx of mxRecords) {
    for (const known of KNOWN_MX_PATTERNS) {
      if (known.pattern.test(mx.exchange)) {
        return {
          type: known.type,
          displayName: known.displayName,
          authMethod: known.authMethod,
          confidence: 95,
        };
      }
    }
  }
  return null;
}
