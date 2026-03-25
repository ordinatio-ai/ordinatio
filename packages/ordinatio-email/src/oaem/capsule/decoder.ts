// ===========================================
// CAPSULE DECODER — Base64URL + CBOR
// ===========================================

import { decode } from 'cbor-x';
import type { CapsulePayload } from './types';
import { INTENT_TYPES } from '../types';
import { oaemError } from '../errors';

/**
 * Decode a base64url string back to a CapsulePayload via CBOR.
 * Validates required fields after decoding.
 */
export function decodeCapsule(encoded: string): CapsulePayload {
  let raw: unknown;
  try {
    const bytes = fromBase64Url(encoded);
    raw = decode(bytes);
  } catch (err) {
    const error = oaemError('OAEM_101', {
      encodedLength: encoded.length,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }

  if (!isValidCapsule(raw)) {
    const error = oaemError('OAEM_102', {
      receivedKeys: raw && typeof raw === 'object' ? Object.keys(raw) : [],
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }

  return raw as CapsulePayload;
}

/**
 * Convert a base64url string to Uint8Array.
 */
function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}

/**
 * Validate minimum required fields for a valid CapsulePayload.
 */
function isValidCapsule(obj: unknown): boolean {
  if (
    !obj ||
    typeof obj !== 'object' ||
    obj.spec !== 'ai-instructions' ||
    obj.version !== '1.1' ||
    obj.type !== 'email_capsule' ||
    typeof obj.issued_at !== 'number' ||
    typeof obj.issuer !== 'string' ||
    obj.issuer.length === 0 ||
    !obj.thread ||
    typeof obj.thread !== 'object' ||
    typeof obj.intent !== 'string' ||
    !INTENT_TYPES.includes(obj.intent as typeof INTENT_TYPES[number]) ||
    !Array.isArray(obj.actions)
  ) {
    return false;
  }

  const thread = obj.thread as Record<string, unknown>;
  return typeof thread.id === 'string' && thread.id.length > 0;
}
