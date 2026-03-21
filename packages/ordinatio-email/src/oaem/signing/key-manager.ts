// ===========================================
// KEY MANAGER — Ed25519 Key Generation & Rotation
// ===========================================

import * as jose from 'jose';
import type { OaemKeyPair, OaemKeysJson } from './types';
import { oaemError } from '../errors';

/**
 * Generate a new Ed25519 key pair for OAEM capsule signing.
 * Returns JWK-serialized keys with a unique kid.
 */
export async function generateKeyPair(): Promise<OaemKeyPair> {
  try {
    const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });

    const publicJwk = await jose.exportJWK(publicKey);
    const privateJwk = await jose.exportJWK(privateKey);

    // Generate a kid from the public key thumbprint
    const kid = await jose.calculateJwkThumbprint(publicJwk, 'sha256');

    return {
      kid,
      publicKey: publicJwk,
      privateKey: privateJwk,
      algorithm: 'EdDSA',
      validFrom: new Date(),
    };
  } catch (err) {
    const error = oaemError('OAEM_115', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}

/**
 * Serialize public keys for the .well-known/oaem-keys.json endpoint.
 */
export function serializePublicKeys(keys: OaemKeyPair[]): OaemKeysJson {
  return {
    keys: keys
      .filter((k) => !k.validUntil || k.validUntil > new Date())
      .map((k) => ({
        kid: k.kid,
        algorithm: k.algorithm,
        publicKey: k.publicKey,
        validFrom: k.validFrom.toISOString(),
        validUntil: k.validUntil?.toISOString(),
      })),
  };
}
