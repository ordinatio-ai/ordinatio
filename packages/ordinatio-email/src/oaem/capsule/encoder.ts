// ===========================================
// CAPSULE ENCODER — CBOR + Base64URL
// ===========================================

import { encode } from 'cbor-x';
import type { CapsulePayload } from './types';
import { oaemError } from '../errors';

/**
 * Encode a CapsulePayload to a base64url string via CBOR.
 * CBOR is ~40% smaller than JSON — critical for HTML attribute size limits.
 */
export function encodeCapsule(payload: CapsulePayload): string {
  try {
    const cborBytes = encode(payload);
    return toBase64Url(cborBytes);
  } catch (err) {
    const error = oaemError('OAEM_100', {
      payloadKeys: Object.keys(payload),
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}

/**
 * Convert a Uint8Array to base64url string (RFC 4648 §5).
 */
function toBase64Url(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
