// ===========================================
// OAEM PROTOCOL — BARREL EXPORT
// ===========================================
// Ordinatio Agentic Email Module protocol layer.
// Merged into @ordinatio/email.
// ===========================================

// --- Types ---
export type {
  CapsulePayload,
  ThreadIdentity,
  ThreadState,
  ThreadStatus,
  PendingItem,
  IntentType,
  CapsuleAction,
  ActionType,
  CapsuleConstraints,
  CapsuleLink,
  CompletionCheck,
  TrustTier,
  TrustEvaluation,
  TrustPolicy,
  OaemKeyPair,
  OaemKeysJson,
  SigningOptions,
  VerificationResult,
  LedgerEntry,
  LedgerChain,
  ExtractedCapsule,
} from './types';

export { INTENT_TYPES, ACTION_TYPES } from './types';

// --- Errors ---
export { oaemError, OAEM_ERRORS } from './errors';

// --- Capsule ---
export { encodeCapsule } from './capsule/encoder';
export { decodeCapsule } from './capsule/decoder';
export { embedCapsule } from './capsule/embedder';
export { extractCapsule } from './capsule/extractor';

// --- Signing ---
export { computeHash, computeHashBytes } from './signing/hash';
export { generateKeyPair, serializePublicKeys } from './signing/key-manager';
export { signCapsule } from './signing/signer';
export { verifyCapsule, verifyWithKey } from './signing/verifier';
export type { PublicKeyFetcher } from './signing/verifier';

// --- Trust ---
export { evaluateTrust, getNonceTracker, TRUST_TIER_ORDINAL } from './trust/trust-evaluator';
export type { TrustContext } from './trust/trust-evaluator';
export { NonceTracker } from './trust/nonce-tracker';

// --- Ledger ---
export { buildNextState, createInitialState } from './ledger/ledger-builder';
export type { BuildResult } from './ledger/ledger-builder';
export { validateChain, verifyEntryHash } from './ledger/ledger-validator';
export type { ChainValidationResult } from './ledger/ledger-validator';
export { generateThreadFingerprint, normalizeSubject } from './ledger/thread-fingerprint';
