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
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;

  if (o.spec !== 'ai-instructions') return false;
  if (o.version !== '1.1') return false;
  if (o.type !== 'email_capsule') return false;
  if (typeof o.issued_at !== 'number') return false;
  if (typeof o.issuer !== 'string' || o.issuer.length === 0) return false;
  if (!o.thread || typeof o.thread !== 'object') return false;
  if (typeof o.intent !== 'string' || !INTENT_TYPES.includes(o.intent as typeof INTENT_TYPES[number])) return false;
  if (!Array.isArray(o.actions)) return false;

  const thread = o.thread as Record<string, unknown>;
  if (typeof thread.id !== 'string' || thread.id.length === 0) return false;

  return true;
}
