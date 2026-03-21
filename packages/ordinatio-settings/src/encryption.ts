// ===========================================
// ORDINATIO SETTINGS — Envelope Encryption
// ===========================================
// Transparent encryption for secret settings.
// Uses AES-256-GCM via @ordinatio/core crypto
// primitives (inlined to avoid dependency).
// ===========================================

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { KeyProvider } from './types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1:';

/**
 * Default KeyProvider that reads from SETTINGS_ENCRYPTION_KEY env var.
 */
export class EnvKeyProvider implements KeyProvider {
  private validated = false;

  async getEncryptionKey(): Promise<Buffer> {
    const keyHex = process.env.SETTINGS_ENCRYPTION_KEY;
    if (!keyHex) {
      throw new Error('SETTINGS_ENCRYPTION_KEY environment variable is not set');
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      throw new Error(`SETTINGS_ENCRYPTION_KEY must be 64 hex chars (32 bytes), got ${keyHex.length} chars`);
    }
    this.validated = true;
    return key;
  }
}

/**
 * Encrypt a setting value for storage.
 * Returns: `enc:v1:{base64(iv + ciphertext + tag)}`
 */
export async function encryptSettingValue(value: string, keyProvider: KeyProvider): Promise<string> {
  if (!value) return value; // don't encrypt empty strings

  const key = await keyProvider.getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Pack: iv (12) + ciphertext (variable) + tag (16)
  const packed = Buffer.concat([iv, ciphertext, tag]);
  return ENCRYPTED_PREFIX + packed.toString('base64');
}

/**
 * Decrypt a stored setting value.
 * If the value doesn't have the `enc:v1:` prefix, returns it unchanged (migration-safe).
 */
export async function decryptSettingValue(stored: string, keyProvider: KeyProvider): Promise<string> {
  if (!stored || !stored.startsWith(ENCRYPTED_PREFIX)) {
    return stored; // not encrypted — pass through
  }

  const key = await keyProvider.getEncryptionKey();
  const packed = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64');

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(packed.length - TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH, packed.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}

/**
 * Check if a stored value is encrypted.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}
