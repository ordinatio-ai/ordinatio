// ===========================================
// ORDINATIO SETTINGS — Encryption Tests
// ===========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { KeyProvider } from '../types';
import {
  encryptSettingValue,
  decryptSettingValue,
  isEncrypted,
  EnvKeyProvider,
} from '../encryption';

function createTestKeyProvider(key?: Buffer): KeyProvider {
  const testKey = key ?? randomBytes(32);
  return {
    getEncryptionKey: async () => testKey,
  };
}

describe('encryption', () => {
  const keyProvider = createTestKeyProvider();

  describe('encryptSettingValue', () => {
    it('returns enc:v1: prefixed string', async () => {
      const result = await encryptSettingValue('sk-ant-api03-secret', keyProvider);
      expect(result).toMatch(/^enc:v1:/);
    });

    it('returns empty string unchanged', async () => {
      const result = await encryptSettingValue('', keyProvider);
      expect(result).toBe('');
    });

    it('produces different ciphertext each time (random IV)', async () => {
      const r1 = await encryptSettingValue('same-key', keyProvider);
      const r2 = await encryptSettingValue('same-key', keyProvider);
      expect(r1).not.toBe(r2);
    });
  });

  describe('decryptSettingValue', () => {
    it('decrypts encrypted value to original plaintext', async () => {
      const original = 'sk-ant-api03-very-long-key-12345';
      const encrypted = await encryptSettingValue(original, keyProvider);
      const decrypted = await decryptSettingValue(encrypted, keyProvider);

      expect(decrypted).toBe(original);
    });

    it('passes through unencrypted values unchanged', async () => {
      const plain = 'just-a-normal-value';
      const result = await decryptSettingValue(plain, keyProvider);
      expect(result).toBe(plain);
    });

    it('passes through empty string', async () => {
      const result = await decryptSettingValue('', keyProvider);
      expect(result).toBe('');
    });

    it('fails with wrong key', async () => {
      const encrypted = await encryptSettingValue('secret', keyProvider);
      const wrongKeyProvider = createTestKeyProvider(randomBytes(32));

      await expect(decryptSettingValue(encrypted, wrongKeyProvider)).rejects.toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('returns true for encrypted values', async () => {
      const encrypted = await encryptSettingValue('test', keyProvider);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for plain values', () => {
      expect(isEncrypted('plain-text')).toBe(false);
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted('sk-ant-api')).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('handles unicode content', async () => {
      const original = 'API key \u{1F511} special: \u00E9\u00E8\u00EA';
      const encrypted = await encryptSettingValue(original, keyProvider);
      const decrypted = await decryptSettingValue(encrypted, keyProvider);
      expect(decrypted).toBe(original);
    });

    it('handles long API keys', async () => {
      const original = 'sk-ant-api03-' + 'a'.repeat(200);
      const encrypted = await encryptSettingValue(original, keyProvider);
      const decrypted = await decryptSettingValue(encrypted, keyProvider);
      expect(decrypted).toBe(original);
    });
  });

  describe('EnvKeyProvider', () => {
    const originalEnv = process.env.SETTINGS_ENCRYPTION_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.SETTINGS_ENCRYPTION_KEY = originalEnv;
      } else {
        delete process.env.SETTINGS_ENCRYPTION_KEY;
      }
    });

    it('reads key from environment variable', async () => {
      const key = randomBytes(32);
      process.env.SETTINGS_ENCRYPTION_KEY = key.toString('hex');

      const provider = new EnvKeyProvider();
      const result = await provider.getEncryptionKey();

      expect(result).toEqual(key);
    });

    it('throws when env var is not set', async () => {
      delete process.env.SETTINGS_ENCRYPTION_KEY;

      const provider = new EnvKeyProvider();
      await expect(provider.getEncryptionKey()).rejects.toThrow('not set');
    });

    it('throws on invalid key length', async () => {
      process.env.SETTINGS_ENCRYPTION_KEY = 'abcd'; // too short

      const provider = new EnvKeyProvider();
      await expect(provider.getEncryptionKey()).rejects.toThrow('32 bytes');
    });
  });
});
