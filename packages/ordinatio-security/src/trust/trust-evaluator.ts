// ===========================================
// @ordinatio/security — Trust Evaluator
// ===========================================
// Centralized trust scoring: one shared primitive
// for all modules. Generalizes OAEM's trust pattern.
// ===========================================

import type { TrustInput, TrustEvaluation, TrustOrgPolicy } from '../policy/policy-types';

const DEFAULT_ORG_POLICY: TrustOrgPolicy = {
  trustedDomains: [],
  highStakesDomains: [],
  blockedDomains: [],
  requireSignature: false,
};

/**
 * Score contribution weights for trust components.
 * Each component contributes up to its weight to the 0-100 score.
 */
const TRUST_WEIGHTS = {
  signature: 30,
  dmarc: 20,
  nonce: 20,
  ttl: 15,
  issuerAllowed: 15,
} as const;

/**
 * Evaluate trust for an operation or message.
 * Returns tier (0-2), score (0-100), and reasons.
 *
 * Tier 0: Untrusted — failed checks or unknown source
 * Tier 1: Verified — all mandatory checks pass
 * Tier 2: High-stakes — verified + on high-stakes allowlist
 */
export function evaluateTrust(input: TrustInput): TrustEvaluation {
  const reasons: string[] = [];
  const policy = input.orgPolicy ?? DEFAULT_ORG_POLICY;

  let score = 0;

  // Check if issuer is blocked
  if (input.issuer && policy.blockedDomains?.includes(input.issuer)) {
    return {
      trustTier: 0,
      trustScore: 0,
      reasons: [`Domain ${input.issuer} is blocked by organization policy`],
    };
  }

  // 1. Signature verification
  if (input.signatureValid === true) {
    score += TRUST_WEIGHTS.signature;
  } else if (input.signatureValid === false) {
    reasons.push('Signature verification failed');
    if (policy.requireSignature) {
      return {
        trustTier: 0,
        trustScore: 0,
        reasons: [...reasons, 'Signature required by policy but invalid'],
      };
    }
  } else {
    reasons.push('No signature provided');
    if (policy.requireSignature) {
      return {
        trustTier: 0,
        trustScore: 0,
        reasons: [...reasons, 'Signature required by policy but not present'],
      };
    }
  }

  // 2. DMARC alignment
  if (input.dmarcStatus === 'pass') {
    score += TRUST_WEIGHTS.dmarc;
  } else if (input.dmarcStatus === 'fail') {
    reasons.push('DMARC alignment failed');
  } else {
    reasons.push('DMARC status unknown');
  }

  // 3. Nonce validity (replay protection)
  if (input.nonceValid === true) {
    score += TRUST_WEIGHTS.nonce;
  } else if (input.nonceValid === false) {
    reasons.push('Nonce replay detected');
  }
  // undefined = not checked, no penalty

  // 4. TTL validity
  if (input.ttlValid === true) {
    score += TRUST_WEIGHTS.ttl;
  } else if (input.ttlValid === false) {
    reasons.push('TTL exceeded — content is stale');
  }
  // undefined = not checked, no penalty

  // 5. Issuer on allowlist
  const isTrusted = input.issuer ? policy.trustedDomains?.includes(input.issuer) ?? false : false;
  const isHighStakes = input.issuer ? policy.highStakesDomains?.includes(input.issuer) ?? false : false;

  if (isTrusted || isHighStakes) {
    score += TRUST_WEIGHTS.issuerAllowed;
  } else if (input.issuer) {
    reasons.push(`Issuer ${input.issuer} not on trusted domain list`);
  }

  // Tier determination
  let trustTier: 0 | 1 | 2 = 0;

  // Tier 1 requires: score >= 70 and no critical failures
  const hasCriticalFailure = input.signatureValid === false ||
    input.dmarcStatus === 'fail' ||
    input.nonceValid === false;

  if (score >= 70 && !hasCriticalFailure) {
    trustTier = 1;
    // Tier 2: verified + high-stakes domain
    if (isHighStakes && input.signatureValid === true) {
      trustTier = 2;
    }
  }

  if (reasons.length === 0) {
    reasons.push('All trust checks passed');
  }

  return { trustTier, trustScore: score, reasons };
}
