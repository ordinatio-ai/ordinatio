// ===========================================
// @ordinatio/auth — CSRF Token Generation & Validation
// ===========================================
// Pure crypto functions for CSRF protection.
// No framework dependencies — uses Node.js crypto + Web API Request.
// Supports HSM-compatible secrets via SecretProvider interface.
// ===========================================

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { ParsedToken, CsrfValidationResult, Secret } from './types';
import { buildManifest } from './manifest';

// ===========================================
// CONSTANTS
// ===========================================

/** Cookie name for CSRF token */
export const CSRF_COOKIE_NAME = '__Host-csrf' as const;

/** Header name for CSRF token in requests */
export const CSRF_HEADER_NAME = 'x-csrf-token' as const;

/** Form field name for CSRF token */
export const CSRF_FORM_FIELD = '_csrf' as const;

/** Token validity period in milliseconds (1 hour) */
export const TOKEN_VALIDITY_MS = 60 * 60 * 1000;

// ===========================================
// HSM HELPERS
// ===========================================

/**
 * Compute HMAC-SHA256 signature using a string secret or delegate to SecretProvider.
 */
export function computeHmac(payload: string, secret: Secret): string {
  if (typeof secret === 'string') {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }
  return secret.sign(payload);
}

/**
 * Verify HMAC-SHA256 signature using a string secret or delegate to SecretProvider.
 * Uses timing-safe comparison for string secrets.
 */
export function verifyHmac(payload: string, signature: string, secret: Secret): boolean {
  if (typeof secret === 'string') {
    const expected = computeHmac(payload, secret);
    try {
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf = Buffer.from(signature, 'hex');
      if (expectedBuf.length !== actualBuf.length) return false;
      return timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }
  return secret.verify(payload, signature);
}

// ===========================================
// TOKEN GENERATION
// ===========================================

/**
 * Generate a cryptographically secure CSRF token.
 *
 * Token format: base64url(timestamp:random:hmac)
 * - timestamp: Unix ms when created (for expiration)
 * - random: 32 bytes of random data (for uniqueness)
 * - hmac: HMAC-SHA256 signature (for integrity)
 *
 * @param secret - The HMAC signing secret (string or SecretProvider)
 * @returns The generated token string
 */
export function generateCsrfToken(secret: Secret): string {
  if (!secret) {
    throw new Error('CSRF secret is required for token generation');
  }

  const timestamp = Date.now();
  const random = randomBytes(32).toString('hex');
  const payload = `${timestamp}:${random}`;
  const signature = computeHmac(payload, secret);

  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Parse a CSRF token string into its components.
 *
 * @param token - The token string to parse
 * @returns Parsed token or null if malformed
 */
export function parseToken(token: string): ParsedToken | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');

    if (parts.length !== 3) {
      return null;
    }

    const [timestampStr, random, signature] = parts;
    const timestamp = parseInt(timestampStr, 10);

    if (isNaN(timestamp) || !random || !signature) {
      return null;
    }

    return { timestamp, random, signature };
  } catch {
    return null;
  }
}

/**
 * Verify a token's HMAC signature is valid.
 *
 * @param parsed - Parsed token components
 * @param secret - The HMAC signing secret (string or SecretProvider)
 * @returns true if signature is valid
 */
export function verifySignature(parsed: ParsedToken, secret: Secret): boolean {
  if (!secret) {
    return false;
  }

  const payload = `${parsed.timestamp}:${parsed.random}`;
  return verifyHmac(payload, parsed.signature, secret);
}

/**
 * Check if a token has expired.
 *
 * @param parsed - Parsed token components
 * @param validityMs - Custom validity period (defaults to TOKEN_VALIDITY_MS)
 * @returns true if token is expired
 */
export function isTokenExpired(parsed: ParsedToken, validityMs?: number): boolean {
  const age = Date.now() - parsed.timestamp;
  return age > (validityMs ?? TOKEN_VALIDITY_MS);
}

// ===========================================
// TOKEN EXTRACTION
// ===========================================

/**
 * Extract CSRF token from request body or headers.
 *
 * Checks (in order):
 * 1. Request header 'x-csrf-token'
 * 2. Request body field '_csrf' (JSON or form-encoded)
 *
 * @param request - The incoming Web API Request
 * @returns The token or null if not found
 */
export async function extractCsrfToken(request: Request): Promise<string | null> {
  // First, try header (for AJAX requests)
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) {
    return headerToken;
  }

  // Then, try body (for form submissions)
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const cloned = request.clone();
      const body = await cloned.json();
      if (body && typeof body === 'object' && CSRF_FORM_FIELD in body) {
        return body[CSRF_FORM_FIELD] as string;
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const cloned = request.clone();
      const formData = await cloned.formData();
      const token = formData.get(CSRF_FORM_FIELD);
      if (typeof token === 'string') {
        return token;
      }
    }
  } catch {
    // Body parsing failed, continue
  }

  return null;
}

// ===========================================
// VALIDATION
// ===========================================

/**
 * Validate a CSRF token against the cookie token.
 *
 * Validation checks:
 * 1. Cookie token exists
 * 2. Request token exists
 * 3. Both tokens parse correctly
 * 4. Both tokens have valid signatures
 * 5. Neither token is expired
 * 6. Tokens match
 *
 * @param requestToken - Token from request body/header
 * @param cookieToken - Token from cookie
 * @param secret - The HMAC signing secret (string or SecretProvider)
 * @returns Validation result with error details
 */
export function validateCsrfTokens(
  requestToken: string | null,
  cookieToken: string | null,
  secret: Secret,
): CsrfValidationResult {
  // Check cookie token exists
  if (!cookieToken) {
    return {
      valid: false,
      error: 'CSRF cookie not found',
      code: 'MISSING_COOKIE',
      manifest: buildManifest('ROTATE_TOKEN', 0.95),
    };
  }

  // Check request token exists
  if (!requestToken) {
    return {
      valid: false,
      error: 'CSRF token not provided in request',
      code: 'MISSING_TOKEN',
      manifest: buildManifest('ROTATE_TOKEN', 0.95),
    };
  }

  // Parse both tokens
  const parsedCookie = parseToken(cookieToken);
  const parsedRequest = parseToken(requestToken);

  if (!parsedCookie || !parsedRequest) {
    return {
      valid: false,
      error: 'Invalid CSRF token format',
      code: 'INVALID_FORMAT',
      manifest: buildManifest('TERMINATE_SESSION', 0.9, true),
    };
  }

  // Verify signatures
  if (!verifySignature(parsedCookie, secret) || !verifySignature(parsedRequest, secret)) {
    return {
      valid: false,
      error: 'Invalid CSRF token signature',
      code: 'SIGNATURE_MISMATCH',
      manifest: buildManifest('TERMINATE_SESSION', 0.95, true),
    };
  }

  // Check expiration
  if (isTokenExpired(parsedCookie) || isTokenExpired(parsedRequest)) {
    return {
      valid: false,
      error: 'CSRF token expired',
      code: 'EXPIRED',
      manifest: buildManifest('ROTATE_TOKEN', 0.95),
    };
  }

  // Compare tokens
  if (requestToken !== cookieToken) {
    return {
      valid: false,
      error: 'CSRF token mismatch',
      code: 'TOKEN_MISMATCH',
      manifest: buildManifest('TERMINATE_SESSION', 0.95, true),
    };
  }

  return {
    valid: true,
    manifest: buildManifest('ALLOW', 1.0),
  };
}

/**
 * Create a 403 Forbidden response for CSRF validation failures.
 */
export function csrfErrorResponse(result: CsrfValidationResult): Response {
  return new Response(
    JSON.stringify({
      error: 'CSRF validation failed',
      message: result.error,
      code: result.code,
    }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

// ===========================================
// TESTING UTILITIES
// ===========================================

/**
 * Generate a token with a specific timestamp for testing.
 * @internal
 */
export function _generateTestToken(timestamp: number, secret: Secret): string {
  if (!secret) {
    throw new Error('Secret required for test tokens');
  }

  const random = randomBytes(32).toString('hex');
  const payload = `${timestamp}:${random}`;
  const signature = computeHmac(payload, secret);

  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}
