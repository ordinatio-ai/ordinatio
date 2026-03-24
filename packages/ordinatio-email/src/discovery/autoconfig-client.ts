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
    const result = await tryFetchAutoconfig(url);
    if (result) return result;
  }

  return null;
}

async function tryFetchAutoconfig(url: string): Promise<AutoconfigResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'System1701-AutoDiscover/1.0' },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const xml = await response.text();
    return parseAutoconfigXml(xml);
  } catch {
    return null;
  }
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
    result.outgoingServer = {
      hostname,
      port,
      socketType: socketType || 'SSL',
      authentication: authentication || 'password-cleartext',
    };
  }

  return result.incomingServer || result.outgoingServer ? result : null;
}
