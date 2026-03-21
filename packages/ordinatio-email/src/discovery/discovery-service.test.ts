// ===========================================
// DISCOVERY SERVICE — TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all discovery modules
vi.mock('./mx-resolver', () => ({
  resolveMx: vi.fn(),
  matchKnownProvider: vi.fn(),
}));

vi.mock('./autoconfig-client', () => ({
  fetchAutoconfig: vi.fn(),
  autoconfigToProvider: vi.fn(),
}));

vi.mock('./srv-resolver', () => ({
  resolveSrvRecords: vi.fn(),
  srvToProvider: vi.fn(),
}));

vi.mock('./port-prober', () => ({
  probeHost: vi.fn(),
  probeToProvider: vi.fn(),
}));

vi.mock('./provider-intelligence', () => ({
  checkIntelligence: vi.fn(),
}));

import { discoverProvider } from './discovery-service';
import { resolveMx, matchKnownProvider } from './mx-resolver';
import { fetchAutoconfig, autoconfigToProvider } from './autoconfig-client';
import { resolveSrvRecords, srvToProvider } from './srv-resolver';
import { probeHost, probeToProvider } from './port-prober';
import { checkIntelligence } from './provider-intelligence';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveMx).mockResolvedValue([]);
  vi.mocked(matchKnownProvider).mockReturnValue(null);
  vi.mocked(fetchAutoconfig).mockResolvedValue(null);
  vi.mocked(autoconfigToProvider).mockReturnValue(null);
  vi.mocked(resolveSrvRecords).mockResolvedValue({});
  vi.mocked(srvToProvider).mockReturnValue(null);
  vi.mocked(probeHost).mockResolvedValue([]);
  vi.mocked(probeToProvider).mockReturnValue(null);
  vi.mocked(checkIntelligence).mockResolvedValue(null);
});

describe('discoverProvider', () => {
  it('returns empty result for invalid email (no @)', async () => {
    const result = await discoverProvider('not-an-email');
    expect(result.domain).toBe('');
    expect(result.providers).toHaveLength(0);
    expect(result.confidence).toBe('low');
  });

  it('extracts domain from email and lowercases it', async () => {
    const result = await discoverProvider('user@EXAMPLE.COM');
    expect(result.domain).toBe('example.com');
  });

  it('returns provider intelligence result with high confidence', async () => {
    vi.mocked(checkIntelligence).mockResolvedValue({
      type: 'gmail',
      displayName: 'Gmail (verified)',
      authMethod: 'oauth2',
      confidence: 95,
    });

    const result = await discoverProvider('user@example.com', {
      queryIntelligence: vi.fn(),
    });

    expect(result.source).toBe('provider_intelligence');
    expect(result.confidence).toBe('high');
    expect(result.providers[0].type).toBe('gmail');
  });

  it('falls through intelligence to MX when confidence is low', async () => {
    vi.mocked(checkIntelligence).mockResolvedValue({
      type: 'imap',
      displayName: 'Maybe IMAP',
      authMethod: 'password',
      confidence: 60,
    });
    vi.mocked(resolveMx).mockResolvedValue([
      { exchange: 'aspmx.l.google.com', priority: 1 },
    ]);
    vi.mocked(matchKnownProvider).mockReturnValue({
      type: 'gmail',
      displayName: 'Google Workspace / Gmail',
      authMethod: 'oauth2',
      confidence: 95,
    });

    const result = await discoverProvider('user@example.com', {
      queryIntelligence: vi.fn(),
    });

    expect(result.source).toBe('known_provider');
    expect(result.providers[0].type).toBe('gmail');
    // Intelligence result should be secondary
    expect(result.providers).toHaveLength(2);
  });

  it('returns MX-matched Gmail provider', async () => {
    vi.mocked(resolveMx).mockResolvedValue([
      { exchange: 'aspmx.l.google.com', priority: 1 },
    ]);
    vi.mocked(matchKnownProvider).mockReturnValue({
      type: 'gmail',
      displayName: 'Google Workspace / Gmail',
      authMethod: 'oauth2',
      confidence: 95,
    });

    const result = await discoverProvider('user@example.com');

    expect(result.source).toBe('known_provider');
    expect(result.confidence).toBe('high');
    expect(result.providers[0].type).toBe('gmail');
  });

  it('returns MX-matched Outlook provider', async () => {
    vi.mocked(resolveMx).mockResolvedValue([
      { exchange: 'example-com.mail.protection.outlook.com', priority: 1 },
    ]);
    vi.mocked(matchKnownProvider).mockReturnValue({
      type: 'outlook',
      displayName: 'Microsoft 365 / Outlook',
      authMethod: 'oauth2',
      confidence: 95,
    });

    const result = await discoverProvider('user@example.com');
    expect(result.providers[0].type).toBe('outlook');
  });

  it('falls through to autoconfig when MX has no match', async () => {
    vi.mocked(fetchAutoconfig).mockResolvedValue({
      incomingServer: {
        type: 'imap',
        hostname: 'imap.example.com',
        port: 993,
        socketType: 'SSL',
        authentication: 'password-cleartext',
      },
      outgoingServer: {
        type: 'smtp',
        hostname: 'smtp.example.com',
        port: 587,
        socketType: 'STARTTLS',
        authentication: 'password-cleartext',
      },
    });
    vi.mocked(autoconfigToProvider).mockReturnValue({
      type: 'imap',
      displayName: 'imap.example.com',
      authMethod: 'password',
      settings: {
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapSecurity: 'ssl',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpSecurity: 'starttls',
      },
      confidence: 80,
    });

    const result = await discoverProvider('user@example.com');

    expect(result.source).toBe('mozilla_autoconfig');
    expect(result.confidence).toBe('medium');
    expect(result.providers[0].settings?.imapHost).toBe('imap.example.com');
  });

  it('falls through to SRV records', async () => {
    vi.mocked(srvToProvider).mockReturnValue({
      type: 'imap',
      displayName: 'Mail server for example.com',
      authMethod: 'password',
      settings: {
        imapHost: 'mail.example.com',
        imapPort: 993,
        imapSecurity: 'ssl',
        smtpHost: 'mail.example.com',
        smtpPort: 587,
        smtpSecurity: 'starttls',
      },
      confidence: 70,
    });

    const result = await discoverProvider('user@example.com', {
      skipAutoconfig: true,
    });

    expect(result.source).toBe('srv_records');
    expect(result.confidence).toBe('medium');
  });

  it('falls through to port probing as last resort', async () => {
    vi.mocked(probeToProvider).mockReturnValue({
      type: 'imap',
      displayName: 'mail.example.com',
      authMethod: 'password',
      settings: {
        imapHost: 'mail.example.com',
        imapPort: 993,
        imapSecurity: 'ssl',
        smtpHost: 'mail.example.com',
        smtpPort: 587,
        smtpSecurity: 'starttls',
      },
      confidence: 40,
    });

    const result = await discoverProvider('user@example.com', {
      skipAutoconfig: true,
    });

    expect(result.source).toBe('port_probe');
    expect(result.confidence).toBe('low');
  });

  it('skips port probing when skipPortProbe is set', async () => {
    const result = await discoverProvider('user@example.com', {
      skipAutoconfig: true,
      skipPortProbe: true,
    });

    expect(probeHost).not.toHaveBeenCalled();
    expect(result.providers).toHaveLength(0);
  });

  it('includes durationMs in result', async () => {
    const result = await discoverProvider('user@example.com', {
      skipAutoconfig: true,
      skipPortProbe: true,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns manual source when nothing found', async () => {
    const result = await discoverProvider('user@unknown.example', {
      skipAutoconfig: true,
      skipPortProbe: true,
    });

    expect(result.source).toBe('manual');
    expect(result.confidence).toBe('low');
    expect(result.providers).toHaveLength(0);
  });
});
