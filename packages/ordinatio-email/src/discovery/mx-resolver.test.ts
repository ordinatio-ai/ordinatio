// ===========================================
// MX RESOLVER — TESTS
// ===========================================

import { describe, it, expect, vi } from 'vitest';

vi.mock('node:dns', () => ({
  promises: {
    resolveMx: vi.fn(),
  },
}));

import { promises as dns } from 'node:dns';
import { resolveMx, matchKnownProvider } from './mx-resolver';

describe('resolveMx', () => {
  it('returns sorted MX records', async () => {
    vi.mocked(dns.resolveMx).mockResolvedValue([
      { exchange: 'mx2.example.com', priority: 20 },
      { exchange: 'mx1.example.com', priority: 10 },
    ]);

    const records = await resolveMx('example.com');
    expect(records).toHaveLength(2);
    expect(records[0].exchange).toBe('mx1.example.com');
    expect(records[0].priority).toBe(10);
  });

  it('returns empty array on DNS failure', async () => {
    vi.mocked(dns.resolveMx).mockRejectedValue(new Error('NXDOMAIN'));
    const records = await resolveMx('nonexistent.example');
    expect(records).toHaveLength(0);
  });
});

describe('matchKnownProvider', () => {
  it('matches Google MX to Gmail', () => {
    const result = matchKnownProvider([
      { exchange: 'aspmx.l.google.com', priority: 1 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('gmail');
    expect(result!.authMethod).toBe('oauth2');
    expect(result!.confidence).toBe(95);
  });

  it('matches googlemail.com to Gmail', () => {
    const result = matchKnownProvider([
      { exchange: 'alt1.aspmx.l.googlemail.com', priority: 5 },
    ]);
    expect(result!.type).toBe('gmail');
  });

  it('matches outlook.com to Outlook', () => {
    const result = matchKnownProvider([
      { exchange: 'example-com.mail.protection.outlook.com', priority: 1 },
    ]);
    expect(result!.type).toBe('outlook');
  });

  it('matches office365.com to Outlook', () => {
    const result = matchKnownProvider([
      { exchange: 'mx.office365.com', priority: 1 },
    ]);
    expect(result!.type).toBe('outlook');
  });

  it('returns null for unknown MX', () => {
    const result = matchKnownProvider([
      { exchange: 'mail.customhost.net', priority: 1 },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for empty records', () => {
    const result = matchKnownProvider([]);
    expect(result).toBeNull();
  });

  it('checks MX in priority order', () => {
    const result = matchKnownProvider([
      { exchange: 'backup.customhost.net', priority: 20 },
      { exchange: 'aspmx.l.google.com', priority: 1 },
    ]);
    expect(result!.type).toBe('gmail');
  });
});
