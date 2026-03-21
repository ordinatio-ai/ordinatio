// ===========================================
// ORDINATIO CORE — Symmetric Encryption Primitives
// ===========================================
// AES-256-GCM encryption/decryption using Node.js
// built-in crypto module. Zero external dependencies.
// General-purpose — reusable by any module.
// ===========================================

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV for GCM (NIST recommended)
const TAG_LENGTH = 16;  // 128-bit authentication tag

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param plaintext - The string to encrypt
 * @param key - 32-byte encryption key
 * @returns Encrypted payload with ciphertext, IV, and auth tag
 */
export function encryptAES256GCM(plaintext: string, key: Buffer): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { ciphertext: encrypted, iv, tag };
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 * @param ciphertext - The encrypted data
 * @param iv - The initialization vector
 * @param tag - The GCM authentication tag
 * @param key - 32-byte encryption key
 * @returns The decrypted plaintext string
 */
export function decryptAES256GCM(ciphertext: Buffer, iv: Buffer, tag: Buffer, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
