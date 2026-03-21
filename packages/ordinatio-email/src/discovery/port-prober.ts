// ===========================================
// PORT PROBER — TCP/TLS Port Connectivity Check
// ===========================================

import * as net from 'node:net';
import * as tls from 'node:tls';
import type { PortProbeResult, DiscoveredProvider, ImapSmtpSettings } from './types';

const STANDARD_PORTS = {
  imapSsl: { port: 993, security: 'ssl' as const },
  imapStarttls: { port: 143, security: 'starttls' as const },
  smtpSubmission: { port: 587, security: 'starttls' as const },
  smtpSsl: { port: 465, security: 'ssl' as const },
} as const;

/**
 * Probe standard email ports on a host.
 * Uses 5-second timeout per connection attempt.
 */
export async function probeHost(host: string, timeoutMs = 5000): Promise<PortProbeResult[]> {
  const probes = Object.values(STANDARD_PORTS).map((p) =>
    probePort(host, p.port, p.security === 'ssl', timeoutMs)
  );
  return Promise.all(probes);
}

async function probePort(
  host: string,
  port: number,
  useTls: boolean,
  timeoutMs: number
): Promise<PortProbeResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const onResult = (connected: boolean, tlsSupported: boolean) => {
      resolve({
        host,
        port,
        connected,
        tlsSupported,
        durationMs: Date.now() - start,
      });
    };

    try {
      if (useTls) {
        const socket = tls.connect(
          { host, port, timeout: timeoutMs, rejectUnauthorized: false },
          () => {
            socket.destroy();
            onResult(true, true);
          }
        );
        socket.on('error', () => onResult(false, false));
        socket.on('timeout', () => {
          socket.destroy();
          onResult(false, false);
        });
      } else {
        const socket = net.connect({ host, port, timeout: timeoutMs }, () => {
          socket.destroy();
          onResult(true, false);
        });
        socket.on('error', () => onResult(false, false));
        socket.on('timeout', () => {
          socket.destroy();
          onResult(false, false);
        });
      }
    } catch {
      onResult(false, false);
    }
  });
}

/**
 * Attempt to build a provider from port probe results.
 * Only succeeds if at least IMAP is reachable.
 */
export function probeToProvider(
  probes: PortProbeResult[],
  domain: string
): DiscoveredProvider | null {
  const imapSsl = probes.find((p) => p.port === 993 && p.connected);
  const imapPlain = probes.find((p) => p.port === 143 && p.connected);
  const smtpSubmission = probes.find((p) => p.port === 587 && p.connected);
  const smtpSsl = probes.find((p) => p.port === 465 && p.connected);

  const imapResult = imapSsl || imapPlain;
  if (!imapResult) return null;

  const smtpResult = smtpSubmission || smtpSsl;

  const settings: ImapSmtpSettings = {
    imapHost: `mail.${domain}`,
    imapPort: imapResult.port,
    imapSecurity: imapResult.port === 993 ? 'ssl' : 'starttls',
    smtpHost: `mail.${domain}`,
    smtpPort: smtpResult?.port || 587,
    smtpSecurity: smtpResult?.port === 465 ? 'ssl' : 'starttls',
  };

  return {
    type: 'imap',
    displayName: `mail.${domain}`,
    authMethod: 'password',
    settings,
    confidence: 40,
  };
}
