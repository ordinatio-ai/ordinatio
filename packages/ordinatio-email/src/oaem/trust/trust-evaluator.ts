// ===========================================
// TRUST EVALUATOR — Trust Tier Determination
// ===========================================
// Reuses RISK_ORDINAL pattern from packages/ordinatio-core.
// Tier 0 = untrusted, Tier 1 = verified, Tier 2 = high-stakes.
// ===========================================

import type { CapsulePayload, TrustTier, TrustEvaluation, TrustPolicy } from '../types';
import type { PublicKeyFetcher } from '../signing/verifier';
import { verifyWithKey } from '../signing/verifier';
import { NonceTracker } from './nonce-tracker';

export const TRUST_TIER_ORDINAL = {
  untrusted: 0,
  verified: 1,
  high_stakes: 2,
} as const;

// Module-level nonce tracker (singleton per process)
const nonceTracker = new NonceTracker();

export interface TrustContext {
  senderEmail: string;
  senderDomain: string;
  policy: TrustPolicy;
  fetchPublicKeys?: PublicKeyFetcher;
  /** Direct public key for verification (alternative to fetch) */
  publicKey?: JsonWebKey;
  /** Override nonce tracker (for testing) */
  nonceTracker?: NonceTracker;
}

/**
 * Evaluate the trust tier of an incoming OAEM capsule.
 *
 * | Tier | Requirements | Allowed Actions |
 * |------|-------------|-----------------|
 * | 0    | No capsule, invalid sig, or verify failure | Summarize, classify only |
 * | 1    | Valid JWS + DMARC + issuer on allowlist | CRM updates, scheduling |
 * | 2    | Tier 1 + high-stakes allowlist | Invoices, NDAs, integrations |
 */
export async function evaluateTrust(
  capsule: CapsulePayload,
  signature: string | undefined,
  context: TrustContext
): Promise<TrustEvaluation> {
  const reasons: string[] = [];
  const tracker = context.nonceTracker ?? nonceTracker;

  // Check if OAEM is enabled
  if (!context.policy.enabled) {
    return {
      tier: 0,
      signatureValid: false,
      dmarcAligned: false,
      issuerAllowed: false,
      nonceValid: true,
      withinTtl: true,
      reasons: ['OAEM policy is disabled'],
    };
  }

  // Check if domain is blocked
  if (context.policy.blockedDomains.includes(context.senderDomain)) {
    return {
      tier: 0,
      signatureValid: false,
      dmarcAligned: false,
      issuerAllowed: false,
      nonceValid: true,
      withinTtl: true,
      reasons: ['Sender domain is blocked'],
    };
  }

  // ─── Signature Verification ───
  let signatureValid = false;
  if (signature) {
    if (context.publicKey) {
      const result = await verifyWithKey(signature, context.publicKey);
      signatureValid = result.valid;
      if (!result.valid) reasons.push(`Signature invalid: ${result.error}`);
    } else {
      reasons.push('No public key provided for verification');
    }
  } else {
    reasons.push('No signature present');
    if (context.policy.requireSignature) {
      return {
        tier: 0,
        signatureValid: false,
        dmarcAligned: false,
        issuerAllowed: false,
        nonceValid: true,
        withinTtl: true,
        reasons: [...reasons, 'Policy requires signature'],
      };
    }
  }

  // ─── DMARC Alignment (simplified) ───
  // True DMARC requires DNS lookups; here we check issuer == sender domain
  const dmarcAligned = capsule.issuer === context.senderDomain;
  if (!dmarcAligned) reasons.push(`DMARC misalignment: issuer=${capsule.issuer}, sender=${context.senderDomain}`);

  // ─── TTL Check ───
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 24 * 60 * 60; // 24 hours
  const withinTtl = now - capsule.issued_at < maxAge;
  if (!withinTtl) reasons.push('Capsule TTL exceeded (>24h old)');

  // ─── Nonce Check ───
  const nonce = capsule.thread.id + ':' + capsule.thread.state_version;
  const nonceValid = !tracker.hasBeenSeen(nonce);
  if (!nonceValid) reasons.push('Nonce replay detected');
  if (nonceValid) tracker.record(nonce);

  // ─── Issuer Allowlist Check ───
  const isTrustedDomain = context.policy.trustedDomains.includes(context.senderDomain);
  const isHighStakesDomain = context.policy.highStakesDomains.includes(context.senderDomain);
  const issuerAllowed = isTrustedDomain || isHighStakesDomain;
  if (!issuerAllowed) reasons.push('Sender domain not on trusted list');

  // ─── Tier Determination ───
  let tier: TrustTier = 0;

  if (signatureValid && dmarcAligned && issuerAllowed && nonceValid && withinTtl) {
    tier = 1; // Verified

    if (isHighStakesDomain) {
      tier = 2; // High-stakes
    }
  }

  if (reasons.length === 0) {
    reasons.push(tier === 2 ? 'Fully trusted (Tier 2)' : 'Verified (Tier 1)');
  }

  return {
    tier,
    signatureValid,
    dmarcAligned,
    issuerAllowed,
    nonceValid,
    withinTtl,
    reasons,
  };
}

/**
 * Get the global nonce tracker (for manual management/testing).
 */
export function getNonceTracker(): NonceTracker {
  return nonceTracker;
}
