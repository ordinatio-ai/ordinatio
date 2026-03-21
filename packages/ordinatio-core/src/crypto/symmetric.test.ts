// ===========================================
// ORDINATIO CORE — Symmetric Encryption Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptAES256GCM, decryptAES256GCM } from './symmetric';

describe('symmetric encryption', () => {
  const key = randomBytes(32);

  describe('encryptAES256GCM', () => {
    it('encrypts plaintext and returns payload with iv, ciphertext, tag', () => {
      const result = encryptAES256GCM('hello world', key);

      expect(result.ciphertext).toBeInstanceOf(Buffer);
      expect(result.iv).toBeInstanceOf(Buffer);
      expect(result.tag).toBeInstanceOf(Buffer);
      expect(result.iv.length).toBe(12);
      expect(result.tag.length).toBe(16);
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });

    it('produces different ciphertexts for same plaintext (random IV)', () => {
      const r1 = encryptAES256GCM('same input', key);
      const r2 = encryptAES256GCM('same input', key);

      expect(r1.iv).not.toEqual(r2.iv);
      expect(r1.ciphertext).not.toEqual(r2.ciphertext);
    });

    it('throws on invalid key length', () => {
      expect(() => encryptAES256GCM('test', Buffer.from('short'))).toThrow('32 bytes');
    });
  });

  describe('decryptAES256GCM', () => {
    it('decrypts to original plaintext', () => {
      const plaintext = 'sk-ant-api03-secret-key-value-12345';
      const encrypted = encryptAES256GCM(plaintext, key);
      const decrypted = decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, key);

      expect(decrypted).toBe(plaintext);
    });

    it('decrypts empty string', () => {
      const encrypted = encryptAES256GCM('', key);
      const decrypted = decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, key);

      expect(decrypted).toBe('');
    });

    it('decrypts unicode content', () => {
      const plaintext = 'API key with emoji: \u{1F511} and special chars: \u00E9\u00E8\u00EA';
      const encrypted = encryptAES256GCM(plaintext, key);
      const decrypted = decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, key);

      expect(decrypted).toBe(plaintext);
    });

    it('fails with wrong key', () => {
      const encrypted = encryptAES256GCM('secret', key);
      const wrongKey = randomBytes(32);

      expect(() =>
        decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, wrongKey)
      ).toThrow();
    });

    it('fails with tampered ciphertext', () => {
      const encrypted = encryptAES256GCM('secret', key);
      encrypted.ciphertext[0] ^= 0xFF; // flip bits

      expect(() =>
        decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, key)
      ).toThrow();
    });

    it('fails with tampered tag', () => {
      const encrypted = encryptAES256GCM('secret', key);
      encrypted.tag[0] ^= 0xFF;

      expect(() =>
        decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, key)
      ).toThrow();
    });

    it('throws on invalid key length', () => {
      const encrypted = encryptAES256GCM('test', key);
      expect(() =>
        decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, Buffer.from('short'))
      ).toThrow('32 bytes');
    });
  });

  describe('round-trip', () => {
    it('handles long values', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = encryptAES256GCM(plaintext, key);
      const decrypted = decryptAES256GCM(encrypted.ciphertext, encrypted.iv, encrypted.tag, key);

      expect(decrypted).toBe(plaintext);
    });
  });
});
