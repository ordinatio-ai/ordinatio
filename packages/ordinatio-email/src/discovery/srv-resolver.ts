// ===========================================
// SRV RESOLVER — RFC 6186 SRV Record Lookup
// ===========================================

import { promises as dns } from 'node:dns';
import type { DiscoveredProvider, ImapSmtpSettings, SrvRecord } from './types';

/**
 * Resolve RFC 6186 SRV records for email discovery.
 * Checks _imaps._tcp (IMAP/SSL) and _submission._tcp (SMTP).
 */
export async function resolveSrvRecords(domain: string): Promise<{
  imap?: SrvRecord;
  smtp?: SrvRecord;
}> {
  const [imapRecords, smtpRecords] = await Promise.all([
    resolveSrv(`_imaps._tcp.${domain}`),
    resolveSrv(`_submission._tcp.${domain}`),
  ]);

  return {
    imap: imapRecords[0] || undefined,
    smtp: smtpRecords[0] || undefined,
  };
}

async function resolveSrv(name: string): Promise<SrvRecord[]> {
  try {
    const records = await dns.resolveSrv(name);
    return records
      .map((r) => ({
        name,
        port: r.port,
        priority: r.priority,
        weight: r.weight,
        target: r.name,
      }))
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight);
  } catch {
    return [];
  }
}

/**
 * Convert SRV records to a DiscoveredProvider.
 */
export function srvToProvider(
  srv: { imap?: SrvRecord; smtp?: SrvRecord },
  domain: string
): DiscoveredProvider | null {
  if (!srv.imap) return null;

  const settings: ImapSmtpSettings = {
    imapHost: srv.imap.target,
    imapPort: srv.imap.port,
    imapSecurity: srv.imap.port === 993 ? 'ssl' : 'starttls',
    smtpHost: srv.smtp?.target || srv.imap.target,
    smtpPort: srv.smtp?.port || 587,
    smtpSecurity: srv.smtp?.port === 465 ? 'ssl' : 'starttls',
  };

  return {
    type: 'imap',
    displayName: `Mail server for ${domain}`,
    authMethod: 'password',
    settings,
    confidence: 70,
  };
}
