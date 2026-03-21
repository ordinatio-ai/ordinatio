// ===========================================
// SIGNER — JWS Compact Serialization
// ===========================================

import * as jose from 'jose';
import type { SigningOptions } from './types';
import { oaemError } from '../errors';

/**
 * Sign a capsule payload with JWS compact serialization (EdDSA / Ed25519).
 *
 * @param payload - The base64url-encoded capsule string
 * @param privateKey - JWK private key
 * @param options - Signing metadata (issuer, kid, nonce, exp)
 * @returns JWS compact serialization string
 */
export async function signCapsule(
  payload: string,
  privateKey: JsonWebKey,
  options: SigningOptions
): Promise<string> {
  try {
    const key = await jose.importJWK(privateKey, 'EdDSA');

    const jws = await new jose.CompactSign(
      new TextEncoder().encode(payload)
    )
      .setProtectedHeader({
        alg: 'EdDSA',
        kid: options.kid,
        typ: 'oaem+jws',
      })
      .sign(key);

    return jws;
  } catch (err) {
    const error = oaemError('OAEM_110', {
      kid: options.kid,
      issuer: options.issuer,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}
