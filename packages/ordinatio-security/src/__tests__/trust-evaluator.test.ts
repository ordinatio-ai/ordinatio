// ===========================================
// Trust Evaluator Tests
// ===========================================

import { describe, it, expect } from 'vitest';
import { evaluateTrust } from '../trust/trust-evaluator';

describe('evaluateTrust', () => {
  it('returns tier 0 with no input', () => {
    const result = evaluateTrust({});
    expect(result.trustTier).toBe(0);
    expect(result.trustScore).toBeLessThan(70);
  });

  it('returns tier 1 when all checks pass with trusted domain', () => {
    const result = evaluateTrust({
      issuer: 'trusted.com',
      signatureValid: true,
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: {
        trustedDomains: ['trusted.com'],
      },
    });
    expect(result.trustTier).toBe(1);
    expect(result.trustScore).toBe(100);
  });

  it('returns tier 2 for high-stakes domain with valid signature', () => {
    const result = evaluateTrust({
      issuer: 'bank.com',
      signatureValid: true,
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: {
        trustedDomains: ['bank.com'],
        highStakesDomains: ['bank.com'],
      },
    });
    expect(result.trustTier).toBe(2);
  });

  it('returns tier 0 for blocked domain', () => {
    const result = evaluateTrust({
      issuer: 'evil.com',
      signatureValid: true,
      dmarcStatus: 'pass',
      orgPolicy: { blockedDomains: ['evil.com'] },
    });
    expect(result.trustTier).toBe(0);
    expect(result.trustScore).toBe(0);
    expect(result.reasons).toContainEqual(expect.stringContaining('blocked'));
  });

  it('returns tier 0 when signature required but invalid', () => {
    const result = evaluateTrust({
      signatureValid: false,
      orgPolicy: { requireSignature: true },
    });
    expect(result.trustTier).toBe(0);
    expect(result.trustScore).toBe(0);
  });

  it('returns tier 0 when signature required but missing', () => {
    const result = evaluateTrust({
      orgPolicy: { requireSignature: true },
    });
    expect(result.trustTier).toBe(0);
  });

  it('drops to tier 0 on nonce replay', () => {
    const result = evaluateTrust({
      issuer: 'trusted.com',
      signatureValid: true,
      dmarcStatus: 'pass',
      nonceValid: false,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['trusted.com'] },
    });
    expect(result.trustTier).toBe(0);
    expect(result.reasons).toContainEqual(expect.stringContaining('replay'));
  });

  it('drops to tier 0 on DMARC failure', () => {
    const result = evaluateTrust({
      issuer: 'trusted.com',
      signatureValid: true,
      dmarcStatus: 'fail',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['trusted.com'] },
    });
    expect(result.trustTier).toBe(0);
  });

  it('drops to tier 0 on failed signature', () => {
    const result = evaluateTrust({
      issuer: 'trusted.com',
      signatureValid: false,
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['trusted.com'] },
    });
    expect(result.trustTier).toBe(0);
  });

  it('collects all failure reasons', () => {
    const result = evaluateTrust({
      signatureValid: false,
      dmarcStatus: 'fail',
      nonceValid: false,
      ttlValid: false,
    });
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('returns positive message when all pass', () => {
    const result = evaluateTrust({
      issuer: 'safe.com',
      signatureValid: true,
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
      orgPolicy: { trustedDomains: ['safe.com'] },
    });
    expect(result.reasons).toContainEqual(expect.stringContaining('passed'));
  });

  it('handles undefined DMARC as unknown', () => {
    const result = evaluateTrust({
      signatureValid: true,
      dmarcStatus: undefined,
    });
    expect(result.reasons).toContainEqual(expect.stringContaining('unknown'));
  });

  it('handles missing issuer gracefully', () => {
    const result = evaluateTrust({
      signatureValid: true,
      dmarcStatus: 'pass',
      nonceValid: true,
      ttlValid: true,
    });
    // No issuer → not on trusted list → lower score
    expect(result.trustScore).toBeLessThan(100);
  });

  it('score reflects individual component weights', () => {
    const sigOnly = evaluateTrust({ signatureValid: true });
    const dmarcOnly = evaluateTrust({ dmarcStatus: 'pass' });
    // Signature contributes 30, DMARC contributes 20
    expect(sigOnly.trustScore).toBeGreaterThan(dmarcOnly.trustScore);
  });
});
