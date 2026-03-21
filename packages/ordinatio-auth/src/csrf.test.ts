import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCsrfToken,
  parseToken,
  verifySignature,
  isTokenExpired,
  validateCsrfTokens,
  extractCsrfToken,
  csrfErrorResponse,
  computeHmac,
  verifyHmac,
  _generateTestToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_FORM_FIELD,
  TOKEN_VALIDITY_MS,
} from './csrf';
import type { SecretProvider } from './types';

const TEST_SECRET = 'test-csrf-secret-for-unit-tests-abc123';

describe('csrf', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constants', () => {
    it('exports correct constant values', () => {
      expect(CSRF_COOKIE_NAME).toBe('__Host-csrf');
      expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
      expect(CSRF_FORM_FIELD).toBe('_csrf');
      expect(TOKEN_VALIDITY_MS).toBe(60 * 60 * 1000);
    });
  });

  describe('generateCsrfToken', () => {
    it('generates a non-empty token', () => {
      const token = generateCsrfToken(TEST_SECRET);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('generates unique tokens', () => {
      const token1 = generateCsrfToken(TEST_SECRET);
      const token2 = generateCsrfToken(TEST_SECRET);
      expect(token1).not.toBe(token2);
    });

    it('throws without secret', () => {
      expect(() => generateCsrfToken('')).toThrow('CSRF secret is required');
    });
  });

  describe('parseToken', () => {
    it('parses a valid token', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token);
      expect(parsed).not.toBeNull();
      expect(parsed!.timestamp).toBeGreaterThan(0);
      expect(parsed!.random).toBeTruthy();
      expect(parsed!.signature).toBeTruthy();
    });

    it('returns null for invalid token', () => {
      expect(parseToken('not-a-valid-token')).toBeNull();
      expect(parseToken('')).toBeNull();
    });

    it('returns null for token with wrong number of parts', () => {
      const badToken = Buffer.from('only:two').toString('base64url');
      expect(parseToken(badToken)).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('verifies a valid signature', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, TEST_SECRET)).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      parsed.signature = 'a'.repeat(64); // Tamper
      expect(verifySignature(parsed, TEST_SECRET)).toBe(false);
    });

    it('rejects with wrong secret', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, 'wrong-secret')).toBe(false);
    });

    it('rejects with empty secret', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, '')).toBe(false);
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for fresh token', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      expect(isTokenExpired(parsed)).toBe(false);
    });

    it('returns true for expired token', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1000);
      expect(isTokenExpired(parsed)).toBe(true);
    });

    it('respects custom validity period', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const parsed = parseToken(token)!;
      vi.advanceTimersByTime(5000);
      expect(isTokenExpired(parsed, 3000)).toBe(true);
      expect(isTokenExpired(parsed, 10000)).toBe(false);
    });
  });

  describe('validateCsrfTokens', () => {
    it('validates matching valid tokens', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token, token, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('rejects missing cookie token', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token, null, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_COOKIE');
    });

    it('rejects missing request token', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(null, token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_TOKEN');
    });

    it('rejects mismatched tokens', () => {
      const token1 = generateCsrfToken(TEST_SECRET);
      const token2 = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token1, token2, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TOKEN_MISMATCH');
    });

    it('rejects expired tokens', () => {
      const token = generateCsrfToken(TEST_SECRET);
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1000);
      const result = validateCsrfTokens(token, token, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
    });

    it('rejects invalid format tokens', () => {
      const result = validateCsrfTokens('bad', 'bad', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_FORMAT');
    });

    it('rejects tokens with wrong secret', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token, token, 'wrong-secret');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_MISMATCH');
    });
  });

  describe('extractCsrfToken', () => {
    it('extracts token from header', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { [CSRF_HEADER_NAME]: 'test-token-value' },
      });
      const token = await extractCsrfToken(request);
      expect(token).toBe('test-token-value');
    });

    it('extracts token from JSON body', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [CSRF_FORM_FIELD]: 'body-token-value', data: 'test' }),
      });
      const token = await extractCsrfToken(request);
      expect(token).toBe('body-token-value');
    });

    it('returns null when no token present', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
      });
      const token = await extractCsrfToken(request);
      expect(token).toBeNull();
    });

    it('prefers header over body', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: {
          [CSRF_HEADER_NAME]: 'header-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ [CSRF_FORM_FIELD]: 'body-token' }),
      });
      const token = await extractCsrfToken(request);
      expect(token).toBe('header-token');
    });
  });

  describe('csrfErrorResponse', () => {
    it('returns 403 response', () => {
      const result = csrfErrorResponse({ valid: false, error: 'test error', code: 'MISSING_TOKEN' });
      expect(result.status).toBe(403);
      expect(result.headers.get('content-type')).toBe('application/json');
    });
  });

  describe('CSRF manifests', () => {
    it('returns ALLOW manifest for valid tokens', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token, token, TEST_SECRET);
      expect(result.manifest).toBeDefined();
      expect(result.manifest!.suggestedAction).toBe('ALLOW');
    });

    it('returns ROTATE_TOKEN manifest for expired tokens', () => {
      const token = generateCsrfToken(TEST_SECRET);
      vi.advanceTimersByTime(TOKEN_VALIDITY_MS + 1000);
      const result = validateCsrfTokens(token, token, TEST_SECRET);
      expect(result.manifest!.suggestedAction).toBe('ROTATE_TOKEN');
    });

    it('returns TERMINATE_SESSION manifest for signature mismatch', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token, token, 'wrong-secret');
      expect(result.manifest!.suggestedAction).toBe('TERMINATE_SESSION');
      expect(result.manifest!.requiresHumanReview).toBe(true);
    });

    it('returns ROTATE_TOKEN manifest for missing cookie', () => {
      const token = generateCsrfToken(TEST_SECRET);
      const result = validateCsrfTokens(token, null, TEST_SECRET);
      expect(result.manifest!.suggestedAction).toBe('ROTATE_TOKEN');
    });
  });

  describe('HSM-compatible SecretProvider', () => {
    const mockProvider: SecretProvider = {
      sign: (data: string) => `hsm-sig-${data.length}`,
      verify: (data: string, sig: string) => sig === `hsm-sig-${data.length}`,
    };

    it('generates token with SecretProvider', () => {
      const token = generateCsrfToken(mockProvider);
      expect(token).toBeTruthy();
    });

    it('verifies token with SecretProvider', () => {
      const token = generateCsrfToken(mockProvider);
      const parsed = parseToken(token)!;
      expect(verifySignature(parsed, mockProvider)).toBe(true);
    });

    it('validates tokens end-to-end with SecretProvider', () => {
      const token = generateCsrfToken(mockProvider);
      const result = validateCsrfTokens(token, token, mockProvider);
      expect(result.valid).toBe(true);
    });

    it('rejects token when provider verify returns false', () => {
      const rejectingProvider: SecretProvider = {
        sign: (data: string) => `sig-${data.length}`,
        verify: () => false,
      };
      const token = generateCsrfToken(rejectingProvider);
      const result = validateCsrfTokens(token, token, rejectingProvider);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_MISMATCH');
    });

    it('computeHmac and verifyHmac work with string secret', () => {
      const sig = computeHmac('test-payload', TEST_SECRET);
      expect(verifyHmac('test-payload', sig, TEST_SECRET)).toBe(true);
      expect(verifyHmac('different-payload', sig, TEST_SECRET)).toBe(false);
    });

    it('computeHmac and verifyHmac work with SecretProvider', () => {
      const sig = computeHmac('test-payload', mockProvider);
      expect(sig).toBe('hsm-sig-12');
      expect(verifyHmac('test-payload', sig, mockProvider)).toBe(true);
    });
  });

  describe('_generateTestToken', () => {
    it('generates token with specific timestamp', () => {
      const ts = 1700000000000;
      const token = _generateTestToken(ts, TEST_SECRET);
      const parsed = parseToken(token)!;
      expect(parsed.timestamp).toBe(ts);
      expect(verifySignature(parsed, TEST_SECRET)).toBe(true);
    });
  });
});
