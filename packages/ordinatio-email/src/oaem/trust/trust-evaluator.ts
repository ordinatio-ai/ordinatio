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

  // Early return if OAEM is disabled
  if (!context.policy.enabled) {
    return earlyReturn(reasons, 'OAEM policy is disabled');
  }

  // Early return if domain is blocked
  if (context.policy.blockedDomains.includes(context.senderDomain)) {
    return earlyReturn(reasons, 'Sender domain is blocked');
  }

  // ─── Signature Verification ───
  const signatureValid = await handleSignatureVerification(signature, context, reasons);

  // Handle DMARC and issuer checks...
  const dmarcAligned = false; // placeholder
  const issuerAllowed = false; // placeholder

  // Determine the trust tier based on various conditions
  const tier = determineTrustTier({
    signatureValid,
    dmarcAligned,
    issuerAllowed,
    policy: context.policy
  }, reasons);

  const nonceValid = true; // placeholder
  const withinTtl = true; // placeholder

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

async function handleSignatureVerification(signature: string | undefined, context: TrustContext, reasons: string[]): Promise<boolean> {
  if (!signature) {
    reasons.push('No signature present');
    return false;
  }
  
  if (!context.publicKey) {
    reasons.push('No public key provided for verification');
    return false;
  }
  
  const result = await verifyWithKey(signature, context.publicKey);
  if (!result.valid) {
    reasons.push(`Signature invalid: ${result.error}`);
  }
  return result.valid;
}

function determineTrustTier(conditions: {
  signatureValid: boolean,
  dmarcAligned: boolean,
  issuerAllowed: boolean,
  policy: TrustPolicy
}, reasons: string[]): TrustTier {
  if (!conditions.signatureValid) {
    reasons.push('Invalid signature path');
    return TRUST_TIER_ORDINAL.untrusted;
  }
  if (!conditions.dmarcAligned || !conditions.issuerAllowed) {
    reasons.push('DMARC or issuer path');
    return TRUST_TIER_ORDINAL.untrusted;
  }
  
  // Further checks for higher tiers can be added here.
  return TRUST_TIER_ORDINAL.verified; // placeholder
}

function earlyReturn(reasons: string[], reason: string): TrustEvaluation {
  reasons.push(reason);
  return {
    tier: TRUST_TIER_ORDINAL.untrusted,
    signatureValid: false,
    dmarcAligned: false,
    issuerAllowed: false,
    nonceValid: true,
    withinTtl: true,
    reasons,
  };
}