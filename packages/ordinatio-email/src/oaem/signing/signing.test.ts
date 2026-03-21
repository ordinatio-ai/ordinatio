// ===========================================
// SIGNING — TESTS (Key Manager, Signer, Verifier, Hash)
// ===========================================

import { describe, it, expect } from 'vitest';
import { generateKeyPair, serializePublicKeys } from './key-manager';
import { signCapsule } from './signer';
import { verifyWithKey } from './verifier';
import { computeHash, computeHashBytes } from './hash';

describe('computeHash', () => {
  it('returns hex SHA-256 of a string', () => {
    const hash = computeHash('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns consistent results', () => {
    expect(computeHash('test')).toBe(computeHash('test'));
  });

  it('different inputs produce different hashes', () => {
    expect(computeHash('a')).not.toBe(computeHash('b'));
  });
});

describe('computeHashBytes', () => {
  it('hashes a Uint8Array', () => {
    const hash = computeHashBytes(new TextEncoder().encode('hello'));
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('generateKeyPair', () => {
  it('generates a valid Ed25519 key pair', async () => {
    const keys = await generateKeyPair();

    expect(keys.kid).toBeDefined();
    expect(keys.kid.length).toBeGreaterThan(10);
    expect(keys.algorithm).toBe('EdDSA');
    expect(keys.publicKey).toBeDefined();
    expect(keys.privateKey).toBeDefined();
    expect(keys.publicKey.kty).toBe('OKP');
    expect(keys.publicKey.crv).toBe('Ed25519');
    expect(keys.validFrom).toBeInstanceOf(Date);
    expect(keys.validUntil).toBeUndefined();
  });

  it('generates unique keys each time', async () => {
    const k1 = await generateKeyPair();
    const k2 = await generateKeyPair();
    expect(k1.kid).not.toBe(k2.kid);
    expect(k1.publicKey.x).not.toBe(k2.publicKey.x);
  });
});

describe('serializePublicKeys', () => {
  it('serializes active keys for .well-known endpoint', async () => {
    const keys = await generateKeyPair();
    const json = serializePublicKeys([keys]);

    expect(json.keys).toHaveLength(1);
    expect(json.keys[0].kid).toBe(keys.kid);
    expect(json.keys[0].algorithm).toBe('EdDSA');
    expect(json.keys[0].publicKey.kty).toBe('OKP');
    expect(json.keys[0].validFrom).toBeDefined();
  });

  it('excludes expired keys', async () => {
    const keys = await generateKeyPair();
    keys.validUntil = new Date(Date.now() - 1000); // Expired
    const json = serializePublicKeys([keys]);
    expect(json.keys).toHaveLength(0);
  });

  it('includes keys without validUntil', async () => {
    const keys = await generateKeyPair();
    const json = serializePublicKeys([keys]);
    expect(json.keys).toHaveLength(1);
    expect(json.keys[0].validUntil).toBeUndefined();
  });
});

describe('signCapsule + verifyWithKey', () => {
  it('signs and verifies a capsule payload', async () => {
    const keys = await generateKeyPair();
    const payload = 'test-capsule-payload-base64url';

    const jws = await signCapsule(payload, keys.privateKey, {
      issuer: '1701bespoke.com',
      kid: keys.kid,
      nonce: 'unique-nonce-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(typeof jws).toBe('string');
    expect(jws.split('.')).toHaveLength(3); // JWS compact has 3 parts

    const result = await verifyWithKey(jws, keys.publicKey);
    expect(result.valid).toBe(true);
    expect(result.kid).toBe(keys.kid);
  });

  it('rejects verification with wrong key', async () => {
    const k1 = await generateKeyPair();
    const k2 = await generateKeyPair();

    const jws = await signCapsule('payload', k1.privateKey, {
      issuer: 'example.com',
      kid: k1.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const result = await verifyWithKey(jws, k2.publicKey);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects tampered JWS', async () => {
    const keys = await generateKeyPair();
    const jws = await signCapsule('payload', keys.privateKey, {
      issuer: 'example.com',
      kid: keys.kid,
      nonce: 'n1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    // Tamper with the payload
    const parts = jws.split('.');
    parts[1] = parts[1].slice(0, -1) + 'X'; // Modify last char
    const tampered = parts.join('.');

    const result = await verifyWithKey(tampered, keys.publicKey);
    expect(result.valid).toBe(false);
  });

  it('handles different payload content', async () => {
    const keys = await generateKeyPair();

    for (const payload of ['', 'short', 'a'.repeat(10000)]) {
      const jws = await signCapsule(payload, keys.privateKey, {
        issuer: 'test.com',
        kid: keys.kid,
        nonce: `nonce-${payload.length}`,
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const result = await verifyWithKey(jws, keys.publicKey);
      expect(result.valid).toBe(true);
    }
  });
});
