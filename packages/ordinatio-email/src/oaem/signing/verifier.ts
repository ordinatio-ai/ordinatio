// ===========================================
// VERIFIER — JWS Signature Verification
// ===========================================

import * as jose from 'jose';
import type { OaemKeysJson, VerificationResult } from './types';
import { oaemError } from '../errors';

export type PublicKeyFetcher = (issuerDomain: string) => Promise<OaemKeysJson>;

/**
 * Verify a JWS compact serialization against the issuer's published public keys.
 *
 * Default key fetcher: GET https://{issuer}/.well-known/oaem-keys.json
 */
export async function verifyCapsule(
  jws: string,
  options?: {
    fetchPublicKeys?: PublicKeyFetcher;
    maxAge?: number; // TTL in seconds (default 24h)
  }
): Promise<VerificationResult> {
  try {
    // Decode the protected header to find kid and issuer
    const header = jose.decodeProtectedHeader(jws);
    const kid = header.kid;

    if (!kid) {
      return { valid: false, error: 'Missing kid in JWS header' };
    }

    // Decode payload to find issuer
    const parts = jws.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWS format' };
    }

    const payloadStr = new TextDecoder().decode(jose.base64url.decode(parts[1]));
    // The payload is the base64url capsule string — we need to look for issuer
    // In our protocol, the issuer is embedded in the capsule content
    // For now, we need the caller to provide context or we parse minimally

    // Fetch public keys for verification
    const fetcher = options?.fetchPublicKeys ?? defaultFetchPublicKeys;

    // We need the issuer — extract from capsule payload if possible
    // The capsule is CBOR-encoded, but at this layer we just verify the JWS
    // The trust evaluator will handle issuer matching

    // For verification, we try all known keys from the JWS header
    // The kid tells us which key to use
    // We need the issuer from context — the caller must provide keys or a fetcher

    // Verify signature
    const keysJson = await fetcher('_self'); // Placeholder — real usage passes domain
    const matchingKey = keysJson.keys.find((k) => k.kid === kid);

    if (!matchingKey) {
      return { valid: false, kid, error: `No matching key found for kid: ${kid}` };
    }

    const publicKey = await jose.importJWK(matchingKey.publicKey, 'EdDSA');

    const { payload: verifiedPayload } = await jose.compactVerify(jws, publicKey);

    return {
      valid: true,
      kid,
      issuer: matchingKey.kid,
    };
  } catch (err) {
    if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
      return { valid: false, error: 'Signature verification failed' };
    }
    const error = oaemError('OAEM_111', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { valid: false, error: error.description };
  }
}

/**
 * Verify a JWS using a directly provided public key (simpler API for testing).
 */
export async function verifyWithKey(
  jws: string,
  publicKey: JsonWebKey
): Promise<VerificationResult> {
  try {
    const key = await jose.importJWK(publicKey, 'EdDSA');
    const header = jose.decodeProtectedHeader(jws);

    await jose.compactVerify(jws, key);

    return {
      valid: true,
      kid: header.kid,
    };
  } catch (err) {
    if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
      return { valid: false, error: 'Signature verification failed' };
    }
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Default public key fetcher — GET https://{domain}/.well-known/oaem-keys.json
 */
async function defaultFetchPublicKeys(domain: string): Promise<OaemKeysJson> {
  try {
    const url = `https://${domain}/.well-known/oaem-keys.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as OaemKeysJson;
  } catch (err) {
    const error = oaemError('OAEM_112', {
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}
