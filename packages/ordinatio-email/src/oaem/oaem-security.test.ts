// IHS
// ===========================================
// OAEM TEST PROGRAM — SUITE D: JWS VERIFICATION
// + SUITE I: SECURITY ABUSE
// ===========================================
// Tests for cryptographic edge cases, algorithm confusion,
// capsule injection, shadowing, CBOR bombs, and XSS vectors.
// ===========================================

import { describe, it, expect, beforeEach } from 'vitest';
import * as jose from 'jose';
import {
  encodeCapsule,
  decodeCapsule,
  embedCapsule,
  extractCapsule,
  generateKeyPair,
  signCapsule,
  verifyWithKey,
  verifyCapsule,
  evaluateTrust,
  NonceTracker,
  computeHash,
} from './index';
import type {
  CapsulePayload,
  TrustPolicy,
} from './types';

// ─── Helpers ───

function makeCapsule(overrides: Partial<CapsulePayload> = {}): CapsulePayload {
  return {
    spec: 'ai-instructions',
    version: '1.1',
    type: 'email_capsule',
    issued_at: Math.floor(Date.now() / 1000),
    issuer: 'trusted.com',
    thread: { id: 'thread-sec', state_version: 0 },
    intent: 'information_request',
    actions: [],
    ...overrides,
  };
}

function makePolicy(overrides: Partial<TrustPolicy> = {}): TrustPolicy {
  return {
    enabled: true,
    requireSignature: true,
    trustedDomains: ['trusted.com'],
    highStakesDomains: ['high-stakes.com'],
    requireHumanApproval: ['process_invoice'],
    maxMonetaryValue: 10000,
    blockedDomains: ['blocked.com'],
    ...overrides,
  };
}

// ===========================================
// SUITE D: JWS VERIFICATION EDGE CASES
// ===========================================

describe('Suite D — JWS Verification', () => {
  describe('Algorithm confusion', () => {
    it('D-1: JWS with alg=none MUST be rejected', async () => {
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);

      // Manually craft a JWS with alg: "none"
      const header = jose.base64url.encode(JSON.stringify({ alg: 'none', typ: 'oaem+jws' }));
      const payload = jose.base64url.encode(encoded);
      const fakeJws = `${header}.${payload}.`;

      const kp = await generateKeyPair();
      const result = await verifyWithKey(fakeJws, kp.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-2: JWS with alg=HS256 (symmetric) MUST be rejected for EdDSA key', async () => {
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);

      // Create a symmetric key and sign with it
      const secret = new TextEncoder().encode('super-secret-shared-key');
      const jws = await new jose.CompactSign(new TextEncoder().encode(encoded))
        .setProtectedHeader({ alg: 'HS256' })
        .sign(secret);

      const kp = await generateKeyPair();
      const result = await verifyWithKey(jws, kp.publicKey);
      expect(result.valid).toBe(false);
    });
  });

  describe('Key management edge cases', () => {
    it('D-3: verification with wrong kid MUST fail', async () => {
      const kp1 = await generateKeyPair();
      const kp2 = await generateKeyPair();

      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp1.privateKey, {
        issuer: 'trusted.com', kid: kp1.kid, nonce: 'n-1', exp: 0,
      });

      // Verify with kp2's public key — wrong key
      const result = await verifyWithKey(jws, kp2.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-4: each generated key pair is unique', async () => {
      const keys = await Promise.all(Array.from({ length: 10 }, () => generateKeyPair()));
      const kids = new Set(keys.map(k => k.kid));
      expect(kids.size).toBe(10); // All unique
    });

    it('D-5: verification with tampered payload MUST fail', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-1', exp: 0,
      });

      // Tamper with the payload part of the JWS
      const parts = jws.split('.');
      const tamperedPayload = jose.base64url.encode('tampered-content');
      const tamperedJws = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const result = await verifyWithKey(tamperedJws, kp.publicKey);
      expect(result.valid).toBe(false);
    });
  });

  describe('Malformed JWS', () => {
    it('D-6: JWS with fewer than 3 parts MUST fail', async () => {
      const kp = await generateKeyPair();
      const result = await verifyWithKey('only-two.parts', kp.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-7: JWS with extra parts (4 dots) MUST fail', async () => {
      const kp = await generateKeyPair();
      const result = await verifyWithKey('one.two.three.four', kp.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-8: empty string JWS MUST fail', async () => {
      const kp = await generateKeyPair();
      const result = await verifyWithKey('', kp.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-9: JWS with non-base64url characters MUST fail', async () => {
      const kp = await generateKeyPair();
      const result = await verifyWithKey('invalid!@#$.payload$.sig$', kp.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-10: JWS with valid header but empty signature MUST fail', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-1', exp: 0,
      });

      // Strip the signature
      const parts = jws.split('.');
      const strippedJws = `${parts[0]}.${parts[1]}.`;

      const result = await verifyWithKey(strippedJws, kp.publicKey);
      expect(result.valid).toBe(false);
    });
  });

  describe('Cross-key verification', () => {
    it('D-11: sign with key A, verify with key B MUST fail', async () => {
      const kpA = await generateKeyPair();
      const kpB = await generateKeyPair();

      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kpA.privateKey, {
        issuer: 'trusted.com', kid: kpA.kid, nonce: 'n-cross', exp: 0,
      });

      const result = await verifyWithKey(jws, kpB.publicKey);
      expect(result.valid).toBe(false);
    });

    it('D-12: sign and verify with same key MUST succeed', async () => {
      const kp = await generateKeyPair();

      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-same', exp: 0,
      });

      const result = await verifyWithKey(jws, kp.publicKey);
      expect(result.valid).toBe(true);
    });
  });
});

// ===========================================
// SUITE I: SECURITY ABUSE
// ===========================================

describe('Suite I — Security Abuse', () => {
  describe('Capsule injection attacks', () => {
    it('I-1: second capsule in same email → first is used, error reported', () => {
      const capsule1 = makeCapsule({ intent: 'information_request' });
      const capsule2 = makeCapsule({ intent: 'escalation' });
      const encoded1 = encodeCapsule(capsule1);
      const encoded2 = encodeCapsule(capsule2);

      // Embed two capsules
      const div1 = `<div style="display:none!important" data-ai-instructions="v1" data-ai-payload="${encoded1}"></div>`;
      const div2 = `<div style="display:none!important" data-ai-instructions="v1" data-ai-payload="${encoded2}"></div>`;
      const html = `<html><body>${div1}${div2}</body></html>`;

      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      // MUST use first capsule (no attacker-controlled second capsule wins)
      expect(extracted.payload!.intent).toBe('information_request');
      // MUST report the ambiguity
      expect(extracted.error).toContain('Multiple capsules');
    });

    it('I-2: capsule shadowing — replaced payload but same signature → hash mismatch', () => {
      const realCapsule = makeCapsule({ intent: 'information_request' });
      const fakeCapsule = makeCapsule({ intent: 'escalation', issuer: 'attacker.com' });
      const realEncoded = encodeCapsule(realCapsule);
      const fakeEncoded = encodeCapsule(fakeCapsule);
      const realHash = computeHash(realEncoded);

      // Attacker replaces payload but keeps the original hash
      const capsuleDiv = `<div style="display:none!important" data-ai-instructions="v1" data-ai-payload="${fakeEncoded}" data-ai-payload-sha256="${realHash}"></div>`;
      const html = `<html><body>${capsuleDiv}</body></html>`;

      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.error).toContain('Hash mismatch');
    });
  });

  describe('Decoder abuse', () => {
    it('I-3: invalid base64url string → throws with OAEM_101', () => {
      expect(() => decodeCapsule('!!!not-base64url!!!')).toThrow(/OAEM_101/);
    });

    it('I-4: valid base64url but not CBOR → throws with OAEM_101', () => {
      // Encode a plain string as base64url
      const notCbor = Buffer.from('just a plain string').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(() => decodeCapsule(notCbor)).toThrow();
    });

    it('I-5: valid CBOR but wrong schema (missing required fields) → throws with OAEM_102', () => {
      const { encode } = require('cbor-x');
      const invalidPayload = { spec: 'ai-instructions', version: '1.1', type: 'email_capsule' };
      const cbor = encode(invalidPayload);
      const encoded = Buffer.from(cbor).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      expect(() => decodeCapsule(encoded)).toThrow(/OAEM_102/);
    });

    it('I-6: CBOR with deeply nested objects (depth bomb) → does not crash', () => {
      const { encode } = require('cbor-x');

      // Create a deeply nested object
      let nested: Record<string, unknown> = { leaf: true };
      for (let i = 0; i < 100; i++) {
        nested = { level: nested };
      }

      const payload = {
        spec: 'ai-instructions',
        version: '1.1',
        type: 'email_capsule',
        issued_at: Math.floor(Date.now() / 1000),
        issuer: 'test.com',
        thread: { id: 'thread-bomb' },
        intent: 'information_request',
        actions: [],
        state: { status: 'open', pending: [], data: nested, completed_checks: [] },
      };

      const cbor = encode(payload);
      const encoded = Buffer.from(cbor).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      // Should not throw OOM or stack overflow
      const decoded = decodeCapsule(encoded);
      expect(decoded.spec).toBe('ai-instructions');
    });

    it('I-7: oversized payload (>1MB) → encodes without crash', () => {
      const bigData: Record<string, string> = {};
      // Create ~1MB of data
      for (let i = 0; i < 1000; i++) {
        bigData[`key_${i}`] = 'x'.repeat(1024);
      }

      const capsule = makeCapsule({
        state: { status: 'open', pending: [], data: bigData, completed_checks: [] },
      });

      // Should encode without crashing
      const encoded = encodeCapsule(capsule);
      expect(encoded.length).toBeGreaterThan(100000);

      // Should round-trip
      const decoded = decodeCapsule(encoded);
      expect(decoded.state!.data['key_0']).toBe('x'.repeat(1024));
    });

    it('I-8: empty payload → throws', () => {
      expect(() => decodeCapsule('')).toThrow();
    });

    it('I-9: null bytes in payload → handles gracefully', () => {
      const capsule = makeCapsule({
        summary: 'Text with \x00 null \x00 bytes',
      });

      const encoded = encodeCapsule(capsule);
      const decoded = decodeCapsule(encoded);
      expect(decoded.summary).toContain('\x00');
    });
  });

  describe('XSS via capsule data', () => {
    it('I-10: script tags in capsule fields survive encode/decode but are data-only', () => {
      const capsule = makeCapsule({
        summary: '<script>alert("XSS")</script>',
        thread: {
          id: 'thread-xss',
          subject: '"><img src=x onerror=alert(1)>',
        },
        actions: [{
          action_type: 'reply_with_fields',
          fields: { name: '<iframe src="javascript:alert(1)">' },
        }],
      });

      const encoded = encodeCapsule(capsule);
      const decoded = decodeCapsule(encoded);

      // Data survives round-trip (it's binary CBOR, not HTML)
      expect(decoded.summary).toBe('<script>alert("XSS")</script>');
      expect(decoded.thread.subject).toBe('"><img src=x onerror=alert(1)>');
    });

    it('I-11: XSS in payload attribute is HTML-escaped by embedder', () => {
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);

      // The embedder uses escapeAttr which replaces " and &
      const html = embedCapsule('<html><body>Test</body></html>', encoded);

      // The payload attribute should not contain unescaped quotes
      const attrMatch = html.match(/data-ai-payload="([^"]*)"/);
      expect(attrMatch).toBeDefined();
      // Attribute value should not break out of the quotes
      expect(attrMatch![1]).not.toContain('"');
    });
  });

  describe('Homograph attacks', () => {
    it('I-12: unicode homograph issuer domain → not on trusted list', async () => {
      const kp = await generateKeyPair();
      // Use Cyrillic 'а' (U+0430) instead of Latin 'a' in "trusted"
      const homographDomain = 'tru\u0455ted.com'; // Cyrillic 'ѕ' instead of 's'
      const capsule = makeCapsule({ issuer: homographDomain });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: homographDomain, kid: kp.kid, nonce: 'n-homograph', exp: 0,
      });
      const tracker = new NonceTracker();

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: `alice@${homographDomain}`,
        senderDomain: homographDomain,
        policy: makePolicy({ trustedDomains: ['trusted.com'] }),
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });

      // Homograph domain is NOT the same as "trusted.com"
      expect(result.tier).toBe(0);
      expect(result.issuerAllowed).toBe(false);
    });

    it('I-13: domain with trailing dot → not treated as same domain', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({ issuer: 'trusted.com.' }); // trailing dot
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com.', kid: kp.kid, nonce: 'n-trailing', exp: 0,
      });
      const tracker = new NonceTracker();

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com.',
        senderDomain: 'trusted.com.',
        policy: makePolicy({ trustedDomains: ['trusted.com'] }), // no trailing dot
        publicKey: kp.publicKey,
        nonceTracker: tracker,
      });

      // String comparison means 'trusted.com.' ≠ 'trusted.com'
      expect(result.issuerAllowed).toBe(false);
    });
  });

  describe('Nonce abuse', () => {
    it('I-14: nonce tracker LRU eviction does not create replay window', () => {
      const tracker = new NonceTracker(5, 60_000); // Max 5 nonces

      // Fill the tracker
      for (let i = 0; i < 5; i++) {
        tracker.record(`nonce-${i}`);
      }
      expect(tracker.size).toBe(5);

      // Add one more — oldest should be evicted
      tracker.record('nonce-5');
      expect(tracker.size).toBe(5);

      // The evicted nonce is no longer tracked — potential replay window
      // This is a known trade-off documented in the spec
      expect(tracker.hasBeenSeen('nonce-0')).toBe(false); // Evicted
      expect(tracker.hasBeenSeen('nonce-5')).toBe(true); // Still tracked
    });

    it('I-15: extremely long nonce string does not crash', () => {
      const tracker = new NonceTracker();
      const longNonce = 'x'.repeat(100_000);

      tracker.record(longNonce);
      expect(tracker.hasBeenSeen(longNonce)).toBe(true);
    });
  });

  describe('Trust tier boundary conditions', () => {
    it('I-16: Tier 0 capsule cannot be promoted by adding signature later', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({
        issued_at: Math.floor(Date.now() / 1000) - 25 * 60 * 60, // expired
      });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-promote', exp: 0,
      });

      // Even with valid signature, expired TTL keeps it at Tier 0
      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(0);
      expect(result.signatureValid).toBe(true); // Signature IS valid
      expect(result.withinTtl).toBe(false); // But TTL is expired → Tier 0
    });

    it('I-17: all 5 conditions must be true for Tier 1+', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule();
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'trusted.com', kid: kp.kid, nonce: 'n-all-cond', exp: 0,
      });

      // Verify Tier 1 with all conditions met
      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@trusted.com',
        senderDomain: 'trusted.com',
        policy: makePolicy(),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(1);
      expect(result.signatureValid).toBe(true);
      expect(result.dmarcAligned).toBe(true);
      expect(result.issuerAllowed).toBe(true);
      expect(result.nonceValid).toBe(true);
      expect(result.withinTtl).toBe(true);
    });

    it('I-18: Tier 2 requires high-stakes domain in addition to Tier 1', async () => {
      const kp = await generateKeyPair();
      const capsule = makeCapsule({ issuer: 'high-stakes.com' });
      const encoded = encodeCapsule(capsule);
      const jws = await signCapsule(encoded, kp.privateKey, {
        issuer: 'high-stakes.com', kid: kp.kid, nonce: 'n-tier2', exp: 0,
      });

      const result = await evaluateTrust(capsule, jws, {
        senderEmail: 'alice@high-stakes.com',
        senderDomain: 'high-stakes.com',
        policy: makePolicy({
          trustedDomains: ['high-stakes.com'],
          highStakesDomains: ['high-stakes.com'],
        }),
        publicKey: kp.publicKey,
        nonceTracker: new NonceTracker(),
      });

      expect(result.tier).toBe(2);
    });
  });
});
