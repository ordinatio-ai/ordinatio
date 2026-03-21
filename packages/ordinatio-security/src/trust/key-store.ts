// ===========================================
// @ordinatio/security — Key Store
// ===========================================
// Key lifecycle management: rotation, grace windows, revocation.
// Supports multiple keys per issuer (kid-based lookup).
// ===========================================

export interface StoredKey {
  kid: string;
  issuer: string;
  publicKey: string; // PEM or JWK string
  createdAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  graceExpiresAt?: Date; // After rotation, old key stays valid until this
}

export interface KeyLookupResult {
  found: boolean;
  key?: StoredKey;
  reason: 'active' | 'grace_window' | 'expired' | 'revoked' | 'unknown';
}

export interface KeyStore {
  addKey(key: StoredKey): void;
  getKey(kid: string): KeyLookupResult;
  getKeysForIssuer(issuer: string): StoredKey[];
  revokeKey(kid: string): boolean;
  rotateKey(issuer: string, newKey: StoredKey, graceMs?: number): void;
  readonly size: number;
}

/**
 * In-memory key store with rotation, grace windows, and revocation.
 */
export class InMemoryKeyStore implements KeyStore {
  private keys: Map<string, StoredKey> = new Map();

  addKey(key: StoredKey): void {
    this.keys.set(key.kid, { ...key });
  }

  getKey(kid: string): KeyLookupResult {
    const key = this.keys.get(kid);
    if (!key) {
      return { found: false, reason: 'unknown' };
    }

    const now = new Date();

    // Check revocation first
    if (key.revokedAt) {
      return { found: true, key, reason: 'revoked' };
    }

    // Check expiration
    if (key.expiresAt && key.expiresAt < now) {
      // Check grace window
      if (key.graceExpiresAt && key.graceExpiresAt > now) {
        return { found: true, key, reason: 'grace_window' };
      }
      return { found: true, key, reason: 'expired' };
    }

    // Check grace window (key was superseded but still in grace)
    if (key.graceExpiresAt) {
      if (key.graceExpiresAt > now) {
        return { found: true, key, reason: 'grace_window' };
      }
      return { found: true, key, reason: 'expired' };
    }

    return { found: true, key, reason: 'active' };
  }

  getKeysForIssuer(issuer: string): StoredKey[] {
    return Array.from(this.keys.values()).filter(k => k.issuer === issuer);
  }

  revokeKey(kid: string): boolean {
    const key = this.keys.get(kid);
    if (!key) return false;
    key.revokedAt = new Date();
    return true;
  }

  /**
   * Rotate: expire old keys for this issuer, add new key.
   * Old keys get a grace window (default 24h) before full expiration.
   */
  rotateKey(issuer: string, newKey: StoredKey, graceMs = 24 * 60 * 60 * 1000): void {
    const now = new Date();
    const graceEnd = new Date(now.getTime() + graceMs);

    // Mark existing issuer keys as expired with grace
    for (const [, key] of this.keys) {
      if (key.issuer === issuer && !key.revokedAt && !key.expiresAt) {
        key.expiresAt = now;
        key.graceExpiresAt = graceEnd;
      }
    }

    this.addKey(newKey);
  }

  get size(): number {
    return this.keys.size;
  }

  clear(): void {
    this.keys.clear();
  }
}

/**
 * Resolve the best key for a trust evaluation.
 * Prefers active > grace_window. Rejects revoked and expired.
 */
export function resolveKeyForTrust(
  store: KeyStore,
  kid: string | undefined,
  issuer: string
): { valid: boolean; key?: StoredKey; reason: string } {
  // If kid is provided, look up directly
  if (kid) {
    const result = store.getKey(kid);
    if (!result.found) {
      return { valid: false, reason: `Unknown key ID: ${kid}` };
    }
    if (result.reason === 'revoked') {
      return { valid: false, key: result.key, reason: 'Key has been revoked' };
    }
    if (result.reason === 'expired') {
      return { valid: false, key: result.key, reason: 'Key has expired (outside grace window)' };
    }
    // active or grace_window
    return { valid: true, key: result.key, reason: `Key is ${result.reason}` };
  }

  // No kid — find best key for issuer
  const issuerKeys = store.getKeysForIssuer(issuer);
  if (issuerKeys.length === 0) {
    return { valid: false, reason: `No keys found for issuer: ${issuer}` };
  }

  // Prefer active keys
  const active = issuerKeys.find(k => {
    const result = store.getKey(k.kid);
    return result.reason === 'active';
  });
  if (active) {
    return { valid: true, key: active, reason: 'Key is active' };
  }

  // Fall back to grace window keys
  const grace = issuerKeys.find(k => {
    const result = store.getKey(k.kid);
    return result.reason === 'grace_window';
  });
  if (grace) {
    return { valid: true, key: grace, reason: 'Key is in grace window (rotated)' };
  }

  return { valid: false, reason: 'No valid keys for issuer (all expired or revoked)' };
}
