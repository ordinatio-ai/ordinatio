// ===========================================
// OAEM CORE — ERROR REGISTRY
// ===========================================
// Rule 8: code + ref + runtime context.
// OAEM_100-120 error codes.
// ===========================================

export function oaemError(code: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  const def = OAEM_ERRORS[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'OAEM',
      description: `Unknown OAEM error: ${code}`,
      severity: 'error',
      recoverable: false,
      diagnosis: [],
      context: context || {},
    };
  }

  return {
    code: def.code,
    ref: `${def.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'OAEM',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

export const OAEM_ERRORS: Record<string, {
  code: string;
  file: string;
  function: string;
  severity: string;
  recoverable: boolean;
  description: string;
  diagnosis: string[];
}> = {
  OAEM_100: {
    code: 'OAEM_100',
    file: 'capsule/encoder.ts',
    function: 'encodeCapsule',
    severity: 'error',
    recoverable: false,
    description: 'CBOR encoding failed.',
    diagnosis: ['Payload may contain non-serializable values', 'Check for circular references'],
  },
  OAEM_101: {
    code: 'OAEM_101',
    file: 'capsule/decoder.ts',
    function: 'decodeCapsule',
    severity: 'error',
    recoverable: false,
    description: 'CBOR decoding failed (corrupt payload).',
    diagnosis: ['Base64url string may be truncated', 'Data may have been altered in transit'],
  },
  OAEM_102: {
    code: 'OAEM_102',
    file: 'capsule/decoder.ts',
    function: 'decodeCapsule',
    severity: 'warn',
    recoverable: true,
    description: 'Invalid capsule structure (missing required fields).',
    diagnosis: ['Check spec, version, type, issued_at, issuer, thread, intent, actions fields'],
  },
  OAEM_103: {
    code: 'OAEM_103',
    file: 'capsule/extractor.ts',
    function: 'extractCapsule',
    severity: 'low',
    recoverable: true,
    description: 'No capsule found in HTML.',
    diagnosis: ['Email may not contain OAEM data', 'Hidden div may have been stripped by email client'],
  },
  OAEM_104: {
    code: 'OAEM_104',
    file: 'capsule/extractor.ts',
    function: 'extractCapsule',
    severity: 'warn',
    recoverable: true,
    description: 'Multiple capsules found (ambiguous).',
    diagnosis: ['Email contains more than one data-ai-instructions div', 'Using first found'],
  },
  OAEM_105: {
    code: 'OAEM_105',
    file: 'capsule/extractor.ts',
    function: 'extractCapsule',
    severity: 'error',
    recoverable: false,
    description: 'Payload hash mismatch (integrity failure).',
    diagnosis: ['Capsule was modified after signing', 'Hash does not match payload content'],
  },
  OAEM_110: {
    code: 'OAEM_110',
    file: 'signing/signer.ts',
    function: 'signCapsule',
    severity: 'error',
    recoverable: false,
    description: 'Signing failed (key error).',
    diagnosis: ['Private key may be invalid', 'Key algorithm mismatch'],
  },
  OAEM_111: {
    code: 'OAEM_111',
    file: 'signing/verifier.ts',
    function: 'verifyCapsule',
    severity: 'warn',
    recoverable: true,
    description: 'Signature verification failed.',
    diagnosis: ['Capsule may have been tampered', 'Wrong public key used for verification'],
  },
  OAEM_112: {
    code: 'OAEM_112',
    file: 'signing/verifier.ts',
    function: 'verifyCapsule',
    severity: 'warn',
    recoverable: true,
    description: 'Issuer public key fetch failed.',
    diagnosis: ['Check issuer domain .well-known/oaem-keys.json', 'DNS resolution may have failed'],
  },
  OAEM_113: {
    code: 'OAEM_113',
    file: 'signing/verifier.ts',
    function: 'verifyCapsule',
    severity: 'warn',
    recoverable: true,
    description: 'Capsule expired (TTL exceeded).',
    diagnosis: ['Check exp claim', 'Clock skew between sender and receiver'],
  },
  OAEM_114: {
    code: 'OAEM_114',
    file: 'trust/nonce-tracker.ts',
    function: 'hasBeenSeen',
    severity: 'warn',
    recoverable: false,
    description: 'Nonce replay detected.',
    diagnosis: ['Same capsule sent twice', 'Possible replay attack'],
  },
  OAEM_115: {
    code: 'OAEM_115',
    file: 'signing/key-manager.ts',
    function: 'generateKeyPair',
    severity: 'error',
    recoverable: true,
    description: 'Key generation failed.',
    diagnosis: ['Web Crypto API may not support Ed25519', 'Check runtime environment'],
  },
  OAEM_116: {
    code: 'OAEM_116',
    file: 'signing/key-manager.ts',
    function: 'rotateKeys',
    severity: 'error',
    recoverable: true,
    description: 'Key rotation failed.',
    diagnosis: ['Database write may have failed', 'Previous key may still be active'],
  },
  OAEM_120: {
    code: 'OAEM_120',
    file: 'trust/trust-evaluator.ts',
    function: 'evaluateTrust',
    severity: 'warn',
    recoverable: true,
    description: 'Trust evaluation failed.',
    diagnosis: ['Could not determine trust tier', 'Falling back to Tier 0 (untrusted)'],
  },
} as const;
