// ===========================================
// AUTOCONFIG CLIENT — Mozilla Autoconfig + Microsoft Autodiscover
// ===========================================

import type { AutoconfigResult, DiscoveredProvider, ImapSmtpSettings } from './types';

/**
 * Attempt Mozilla autoconfig XML lookup for a domain.
 * Tries: autoconfig.{domain}/mail/config-v1.1.xml
 * Then:  {domain}/.well-known/autoconfig/mail/config-v1.1.xml
 * Then:  Mozilla ISP DB: autoconfig.thunderbird.net/v1.1/{domain}
 */
export async function fetchAutoconfig(domain: string): Promise<AutoconfigResult | null> {
  const urls = [
    `https://autoconfig.${domain}/mail/config-v1.1.xml`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'System1701-AutoDiscover/1.0' },
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const xml = await response.text();
      const result = parseAutoconfigXml(xml);
      if (result) return result;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Parse Mozilla autoconfig XML into structured result.
 * Minimal XML parsing without external dependencies.
 */
function parseAutoconfigXml(xml: string): AutoconfigResult | null {
  const result: AutoconfigResult = {};

  // Extract display name
  const nameMatch = xml.match(/<displayName>([^<]+)<\/displayName>/);
  if (nameMatch) result.displayName = nameMatch[1];

  // Extract incoming server (prefer IMAP over POP3)
  const incomingMatches = xml.matchAll(
    /<incomingServer\s+type="([^"]+)">([\s\S]*?)<\/incomingServer>/g
  );
  for (const match of incomingMatches) {
    const type = match[1] as 'imap' | 'pop3';
    const block = match[2];

    const hostname = block.match(/<hostname>([^<]+)<\/hostname>/)?.[1];
    const port = parseInt(block.match(/<port>([^<]+)<\/port>/)?.[1] || '0', 10);
    const socketType = block.match(/<socketType>([^<]+)<\/socketType>/)?.[1] as
      | 'SSL'
      | 'STARTTLS'
      | 'plain'
      | undefined;
    const authentication = block.match(/<authentication>([^<]+)<\/authentication>/)?.[1];

    if (hostname && port) {
      if (type === 'imap' || !result.incomingServer) {
        result.incomingServer = {
          type,
          hostname,
          port,
          socketType: socketType || 'SSL',
          authentication: authentication || 'password-cleartext',
        };
      }
    }
  }

  // Extract outgoing server
  const outgoingMatch = xml.match(
    /<outgoingServer\s+type="smtp">([\s\S]*?)<\/outgoingServer>/
  );
  if (outgoingMatch) {
    const block = outgoingMatch[1];
    const hostname = block.match(/<hostname>([^<]+)<\/hostname>/)?.[1];
    const port = parseInt(block.match(/<port>([^<]+)<\/port>/)?.[1] || '0', 10);
    const socketType = block.match(/<socketType>([^<]+)<\/socketType>/)?.[1] as
      | 'SSL'
      | 'STARTTLS'
      | 'plain'
      | undefined;
    const authentication = block.match(/<authentication>([^<]+)<\/authentication>/)?.[1];

    if (hostname && port) {
      result.outgoingServer = {
        type: 'smtp',
        hostname,
        port,
        socketType: socketType || 'STARTTLS',
        authentication: authentication || 'password-cleartext',
      };
    }
  }

  if (!result.incomingServer && !result.outgoingServer) return null;
  return result;
}

/**
 * Convert autoconfig result to a DiscoveredProvider.
 */
export function autoconfigToProvider(config: AutoconfigResult): DiscoveredProvider | null {
  if (!config.incomingServer || config.incomingServer.type !== 'imap') return null;
  if (!config.outgoingServer) return null;

  const mapSecurity = (s: string): 'ssl' | 'starttls' | 'none' => {
    if (s === 'SSL') return 'ssl';
    if (s === 'STARTTLS') return 'starttls';
    return 'none';
  };

  const isOAuth = config.incomingServer.authentication === 'OAuth2';

  const settings: ImapSmtpSettings = {
    imapHost: config.incomingServer.hostname,
    imapPort: config.incomingServer.port,
    imapSecurity: mapSecurity(config.incomingServer.socketType),
    smtpHost: config.outgoingServer.hostname,
    smtpPort: config.outgoingServer.port,
    smtpSecurity: mapSecurity(config.outgoingServer.socketType),
  };

  return {
    type: 'imap',
    displayName: config.displayName || `${config.incomingServer.hostname}`,
    authMethod: isOAuth ? 'oauth2' : 'password',
    settings,
    confidence: 80,
  };
}
