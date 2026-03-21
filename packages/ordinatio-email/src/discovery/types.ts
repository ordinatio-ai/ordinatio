// ===========================================
// EMAIL PROVIDER DISCOVERY — TYPES
// ===========================================

export interface DiscoveryResult {
  domain: string;
  providers: DiscoveredProvider[];
  confidence: 'high' | 'medium' | 'low';
  source: DiscoverySource;
  durationMs: number;
}

export type DiscoverySource =
  | 'provider_intelligence'
  | 'known_provider'
  | 'mozilla_autoconfig'
  | 'srv_records'
  | 'port_probe'
  | 'manual';

export interface DiscoveredProvider {
  type: 'gmail' | 'outlook' | 'imap';
  displayName: string;
  authMethod: 'oauth2' | 'password' | 'app_password';
  settings?: ImapSmtpSettings;
  confidence: number; // 0-100
}

export interface ImapSmtpSettings {
  imapHost: string;
  imapPort: number;
  imapSecurity: 'ssl' | 'starttls' | 'none';
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: 'ssl' | 'starttls' | 'none';
}

export interface ProviderIntelligenceRecord {
  domain: string;
  provider: string;
  settings?: ImapSmtpSettings;
  authMethod: string;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: Date;
}

export interface MxRecord {
  exchange: string;
  priority: number;
}

export interface AutoconfigResult {
  displayName?: string;
  incomingServer?: {
    type: 'imap' | 'pop3';
    hostname: string;
    port: number;
    socketType: 'SSL' | 'STARTTLS' | 'plain';
    authentication: string;
  };
  outgoingServer?: {
    type: 'smtp';
    hostname: string;
    port: number;
    socketType: 'SSL' | 'STARTTLS' | 'plain';
    authentication: string;
  };
}

export interface SrvRecord {
  name: string;
  port: number;
  priority: number;
  weight: number;
  target: string;
}

export interface PortProbeResult {
  host: string;
  port: number;
  connected: boolean;
  tlsSupported: boolean;
  durationMs: number;
}
