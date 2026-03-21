// ===========================================
// HASH — SHA-256 Utilities
// ===========================================

import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a string, returned as hex.
 */
export function computeHash(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/**
 * Compute SHA-256 hash of a Buffer/Uint8Array, returned as hex.
 */
export function computeHashBytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}
