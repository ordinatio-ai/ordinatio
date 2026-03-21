// ===========================================
// DISCOVERY — BARREL EXPORT
// ===========================================

export type {
  DiscoveryResult,
  DiscoverySource,
  DiscoveredProvider,
  ImapSmtpSettings,
  ProviderIntelligenceRecord,
  MxRecord,
  AutoconfigResult,
  SrvRecord,
  PortProbeResult,
} from './types';

export { discoverProvider } from './discovery-service';
export type { DiscoveryOptions } from './discovery-service';

export { resolveMx, matchKnownProvider } from './mx-resolver';
export { fetchAutoconfig, autoconfigToProvider } from './autoconfig-client';
export { resolveSrvRecords, srvToProvider } from './srv-resolver';
export { probeHost, probeToProvider } from './port-prober';
export { checkIntelligence, recordConnectionResult } from './provider-intelligence';
export type { IntelligenceQueryFn, IntelligenceRecordFn } from './provider-intelligence';
