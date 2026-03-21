import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCapabilityToken, verifyCapabilityToken } from './capability';

const TEST_SECRET = 'capability-test-secret-abc123xyz';

describe('capability tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createCapabilityToken', () => {
    it('creates a non-empty token', () => {
      const token = createCapabilityToken(['read-invoice'], 60_000, TEST_SECRET);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('creates unique tokens', () => {
      const t1 = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      const t2 = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      expect(t1).not.toBe(t2);
    });

    it('throws without secret', () => {
      expect(() => createCapabilityToken(['read'], 60_000, '')).toThrow('Secret is required');
    });

    it('throws without capabilities', () => {
      expect(() => createCapabilityToken([], 60_000, TEST_SECRET)).toThrow('At least one capability');
    });

    it('throws with non-positive TTL', () => {
      expect(() => createCapabilityToken(['read'], 0, TEST_SECRET)).toThrow('TTL must be positive');
      expect(() => createCapabilityToken(['read'], -1000, TEST_SECRET)).toThrow('TTL must be positive');
    });
  });

  describe('verifyCapabilityToken', () => {
    it('verifies a valid token with matching capability', () => {
      const token = createCapabilityToken(['read-invoice', 'create-order'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'read-invoice', TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.capabilities).toContain('read-invoice');
      expect(result.capabilities).toContain('create-order');
      expect(result.tokenId).toBeTruthy();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
      expect(result.manifest?.suggestedAction).toBe('ALLOW');
    });

    it('rejects token with missing capability', () => {
      const token = createCapabilityToken(['read-invoice'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'admin', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required capability');
      expect(result.capabilities).toContain('read-invoice');
      expect(result.manifest?.suggestedAction).toBe('BLOCK_AND_NOTIFY_ADMIN');
    });

    it('accepts wildcard capability', () => {
      const token = createCapabilityToken(['*'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'anything-at-all', TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.manifest?.suggestedAction).toBe('ALLOW');
    });

    it('rejects expired token', () => {
      const token = createCapabilityToken(['read'], 5_000, TEST_SECRET);
      vi.advanceTimersByTime(10_000);
      const result = verifyCapabilityToken(token, 'read', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
      expect(result.manifest?.suggestedAction).toBe('REQUIRE_REAUTHENTICATION');
    });

    it('rejects token with wrong secret', () => {
      const token = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'read', 'wrong-secret');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token signature');
      expect(result.manifest?.suggestedAction).toBe('TERMINATE_SESSION');
    });

    it('rejects tampered token', () => {
      const token = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      // Tamper by changing a character
      const tampered = token.slice(0, -2) + 'XX';
      const result = verifyCapabilityToken(tampered, 'read', TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it('rejects invalid encoding', () => {
      const result = verifyCapabilityToken('!!!not-base64!!!', 'read', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
    });

    it('rejects empty token string', () => {
      const result = verifyCapabilityToken('', 'read', TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it('rejects without secret', () => {
      const token = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'read', '');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Secret is required');
    });

    it('includes tokenId in result', () => {
      const token = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'read', TEST_SECRET);
      expect(result.tokenId).toBeTruthy();
      expect(typeof result.tokenId).toBe('string');
      expect(result.tokenId!.length).toBe(32); // 16 bytes hex
    });

    it('includes expiresAt in result', () => {
      const token = createCapabilityToken(['read'], 60_000, TEST_SECRET);
      const result = verifyCapabilityToken(token, 'read', TEST_SECRET);
      expect(result.expiresAt).toBe(Date.now() + 60_000);
    });

    it('works with multiple capabilities', () => {
      const token = createCapabilityToken(
        ['read-invoice', 'create-order', 'delete-draft'],
        60_000,
        TEST_SECRET,
      );
      expect(verifyCapabilityToken(token, 'read-invoice', TEST_SECRET).valid).toBe(true);
      expect(verifyCapabilityToken(token, 'create-order', TEST_SECRET).valid).toBe(true);
      expect(verifyCapabilityToken(token, 'delete-draft', TEST_SECRET).valid).toBe(true);
      expect(verifyCapabilityToken(token, 'admin', TEST_SECRET).valid).toBe(false);
    });

    it('works with SecretProvider', () => {
      const provider = {
        sign: (data: string) => `mock-sig-${data.length}`,
        verify: (data: string, sig: string) => sig === `mock-sig-${data.length}`,
      };

      const token = createCapabilityToken(['read'], 60_000, provider);
      const result = verifyCapabilityToken(token, 'read', provider);
      expect(result.valid).toBe(true);
    });

    it('rejects when SecretProvider verify returns false', () => {
      const signingProvider = {
        sign: (data: string) => `sig-${data.length}`,
        verify: (_data: string, _sig: string) => true,
      };
      const verifyingProvider = {
        sign: (_data: string) => 'different',
        verify: (_data: string, _sig: string) => false,
      };

      const token = createCapabilityToken(['read'], 60_000, signingProvider);
      const result = verifyCapabilityToken(token, 'read', verifyingProvider);
      expect(result.valid).toBe(false);
    });

    it('verifies just before expiry', () => {
      const token = createCapabilityToken(['read'], 10_000, TEST_SECRET);
      vi.advanceTimersByTime(9_999);
      const result = verifyCapabilityToken(token, 'read', TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('rejects exactly at expiry', () => {
      const token = createCapabilityToken(['read'], 10_000, TEST_SECRET);
      vi.advanceTimersByTime(10_001);
      const result = verifyCapabilityToken(token, 'read', TEST_SECRET);
      expect(result.valid).toBe(false);
    });
  });
});
