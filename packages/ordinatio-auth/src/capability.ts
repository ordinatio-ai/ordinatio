// ===========================================
// @ordinatio/auth — Capability Tokens (z-Caps)
// ===========================================
// HMAC-SHA256 signed capability tokens with time-bounded validity.
// Supports wildcard capabilities and HSM-compatible secrets.
// ===========================================

import { randomBytes } from 'crypto';
import type { CapabilityToken, CapabilityValidationResult, Secret } from './types';
import { buildManifest } from './manifest';
import { computeHmac, verifyHmac } from './csrf';

/**
 * Create a signed capability token.
 *
 * Token format: base64url(JSON({capabilities, expiresAt, tokenId}):hmac-signature)
 *
 * @param capabilities - Array of capability strings (e.g., ['read-invoice', 'create-order'])
 * @param ttlMs - Time-to-live in milliseconds
 * @param secret - HMAC signing secret (string or SecretProvider)
 * @returns base64url-encoded signed token
 */
export function createCapabilityToken(
  capabilities: string[],
  ttlMs: number,
  secret: Secret,
): string {
  if (!secret) {
    throw new Error('Secret is required for capability token creation');
  }
  if (!capabilities || capabilities.length === 0) {
    throw new Error('At least one capability is required');
  }
  if (ttlMs <= 0) {
    throw new Error('TTL must be positive');
  }

  const tokenId = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + ttlMs;

  const payload: CapabilityToken = { capabilities, expiresAt, tokenId };
  const payloadJson = JSON.stringify(payload);
  const signature = computeHmac(payloadJson, secret);

  return Buffer.from(`${payloadJson}:${signature}`).toString('base64url');
}

/**
 * Verify and decode a capability token.
 *
 * Checks:
 * 1. Token format (base64url, JSON:signature)
 * 2. HMAC signature validity
 * 3. Token not expired
 * 4. Required capability present (or wildcard '*')
 *
 * @param token - The signed token string
 * @param requiredCapability - The capability to check for
 * @param secret - HMAC signing secret (string or SecretProvider)
 * @returns Validation result with decoded token data
 */
export function verifyCapabilityToken(
  token: string,
  requiredCapability: string,
  secret: Secret,
): CapabilityValidationResult {
  if (!secret) {
    return {
      valid: false,
      error: 'Secret is required for token verification',
      manifest: buildManifest('BLOCK_AND_NOTIFY_ADMIN', 1.0, true),
    };
  }

  // Parse token
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return {
      valid: false,
      error: 'Invalid token encoding',
      manifest: buildManifest('TERMINATE_SESSION', 0.9, true),
    };
  }

  // Split JSON payload from signature
  const lastColon = decoded.lastIndexOf(':');
  if (lastColon === -1) {
    return {
      valid: false,
      error: 'Invalid token format',
      manifest: buildManifest('TERMINATE_SESSION', 0.9, true),
    };
  }

  const payloadJson = decoded.substring(0, lastColon);
  const signature = decoded.substring(lastColon + 1);

  // Verify signature
  if (!verifyHmac(payloadJson, signature, secret)) {
    return {
      valid: false,
      error: 'Invalid token signature',
      manifest: buildManifest('TERMINATE_SESSION', 0.95, true),
    };
  }

  // Parse payload
  let payload: CapabilityToken;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return {
      valid: false,
      error: 'Invalid token payload',
      manifest: buildManifest('TERMINATE_SESSION', 0.9, true),
    };
  }

  // Check expiration
  if (Date.now() > payload.expiresAt) {
    return {
      valid: false,
      error: 'Token expired',
      capabilities: payload.capabilities,
      expiresAt: payload.expiresAt,
      tokenId: payload.tokenId,
      manifest: buildManifest('REQUIRE_REAUTHENTICATION', 1.0),
    };
  }

  // Check capability
  const hasCapability = payload.capabilities.includes('*') ||
    payload.capabilities.includes(requiredCapability);

  if (!hasCapability) {
    return {
      valid: false,
      error: `Missing required capability: ${requiredCapability}`,
      capabilities: payload.capabilities,
      expiresAt: payload.expiresAt,
      tokenId: payload.tokenId,
      manifest: buildManifest('BLOCK_AND_NOTIFY_ADMIN', 0.9, true),
    };
  }

  return {
    valid: true,
    capabilities: payload.capabilities,
    expiresAt: payload.expiresAt,
    tokenId: payload.tokenId,
    manifest: buildManifest('ALLOW', 1.0),
  };
}
