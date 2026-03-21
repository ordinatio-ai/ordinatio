// ===========================================
// DISCOVERY SERVICE — Pipeline Orchestrator
// ===========================================
// Runs discovery strategies in priority order.
// Stops on first high-confidence result.
// ===========================================

import type { DiscoveryResult, DiscoveredProvider } from './types';
import type { IntelligenceQueryFn, IntelligenceRecordFn } from './provider-intelligence';
import { checkIntelligence } from './provider-intelligence';
import { resolveMx, matchKnownProvider } from './mx-resolver';
import { fetchAutoconfig, autoconfigToProvider } from './autoconfig-client';
import { resolveSrvRecords, srvToProvider } from './srv-resolver';
import { probeHost, probeToProvider } from './port-prober';

export interface DiscoveryOptions {
  /** Skip network probing (faster, lower recall) */
  skipPortProbe?: boolean;
  /** Skip autoconfig HTTP fetch */
  skipAutoconfig?: boolean;
  /** Provider Intelligence query callback */
  queryIntelligence?: IntelligenceQueryFn;
  /** Provider Intelligence record callback */
  recordIntelligence?: IntelligenceRecordFn;
}

/**
 * Discover email provider settings for a given email address.
 *
 * Pipeline order (stop on first high-confidence result):
 * 1. Provider Intelligence (instant, highest confidence)
 * 2. Known Provider Match via MX (fast, high confidence)
 * 3. Mozilla Autoconfig (medium speed)
 * 4. RFC 6186 SRV Records (medium speed)
 * 5. Port Probing (slow, lowest confidence)
 */
export async function discoverProvider(
  email: string,
  options: DiscoveryOptions = {}
): Promise<DiscoveryResult> {
  const start = Date.now();
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    return {
      domain: '',
      providers: [],
      confidence: 'low',
      source: 'manual',
      durationMs: Date.now() - start,
    };
  }

  const providers: DiscoveredProvider[] = [];

  // 1. Provider Intelligence (cross-tenant shared knowledge)
  const intelligence = await checkIntelligence(domain, options.queryIntelligence);
  if (intelligence && intelligence.confidence >= 90) {
    return {
      domain,
      providers: [intelligence],
      confidence: 'high',
      source: 'provider_intelligence',
      durationMs: Date.now() - start,
    };
  }
  if (intelligence) providers.push(intelligence);

  // 2. Known Provider Match (MX lookup)
  const mxRecords = await resolveMx(domain);
  const knownProvider = matchKnownProvider(mxRecords);
  if (knownProvider) {
    return {
      domain,
      providers: [knownProvider, ...providers],
      confidence: 'high',
      source: 'known_provider',
      durationMs: Date.now() - start,
    };
  }

  // 3. Mozilla Autoconfig
  if (!options.skipAutoconfig) {
    const autoconfig = await fetchAutoconfig(domain);
    if (autoconfig) {
      const provider = autoconfigToProvider(autoconfig);
      if (provider) {
        return {
          domain,
          providers: [provider, ...providers],
          confidence: 'medium',
          source: 'mozilla_autoconfig',
          durationMs: Date.now() - start,
        };
      }
    }
  }

  // 4. RFC 6186 SRV Records
  const srvRecords = await resolveSrvRecords(domain);
  const srvProvider = srvToProvider(srvRecords, domain);
  if (srvProvider) {
    return {
      domain,
      providers: [srvProvider, ...providers],
      confidence: 'medium',
      source: 'srv_records',
      durationMs: Date.now() - start,
    };
  }

  // 5. Port Probing (slowest, lowest confidence)
  if (!options.skipPortProbe) {
    const guessedHost = `mail.${domain}`;
    const probes = await probeHost(guessedHost);
    const probeProvider = probeToProvider(probes, domain);
    if (probeProvider) {
      return {
        domain,
        providers: [probeProvider, ...providers],
        confidence: 'low',
        source: 'port_probe',
        durationMs: Date.now() - start,
      };
    }
  }

  // No discovery — return whatever we have
  return {
    domain,
    providers,
    confidence: providers.length > 0 ? 'low' : 'low',
    source: 'manual',
    durationMs: Date.now() - start,
  };
}
