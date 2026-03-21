// ===========================================
// OAEM CORE — TYPES
// ===========================================
// Ordinatio Agentic Email Module protocol types.
// Defines capsule payloads, thread state, trust,
// intent vocabulary, and cryptographic structures.
// ===========================================

// ─── Capsule Payload (CBOR-encoded) ───

export interface CapsulePayload {
  spec: 'ai-instructions';
  version: '1.1';
  type: 'email_capsule';
  issued_at: number;
  issuer: string;
  thread: ThreadIdentity;
  intent: IntentType;
  actions: CapsuleAction[];
  state?: ThreadState;
  constraints?: CapsuleConstraints;
  links?: CapsuleLink[];
  checks?: CompletionCheck[];
  summary?: string;
}

// ─── Thread Identity ───

export interface ThreadIdentity {
  id: string;
  subject?: string;
  message_id?: string;
  in_reply_to?: string;
  parent_hash?: string;
  state_version?: number;
}

// ─── Thread Ledger (State Layer) ───

export interface ThreadState {
  workflow_node?: string;
  status: ThreadStatus;
  pending: PendingItem[];
  data: Record<string, unknown>;
  completed_checks: string[];
}

export type ThreadStatus =
  | 'open'
  | 'awaiting_reply'
  | 'in_progress'
  | 'blocked'
  | 'resolved'
  | 'cancelled';

export interface PendingItem {
  id: string;
  description: string;
  owner?: string;
  due?: number;
}

// ─── Intent Vocabulary ───

export type IntentType =
  | 'information_request'
  | 'proposal_offer'
  | 'commit_decision'
  | 'handoff_human'
  | 'status_sync'
  | 'task_assignment'
  | 'approval_request'
  | 'escalation'
  | 'acknowledgment';

export const INTENT_TYPES: readonly IntentType[] = [
  'information_request',
  'proposal_offer',
  'commit_decision',
  'handoff_human',
  'status_sync',
  'task_assignment',
  'approval_request',
  'escalation',
  'acknowledgment',
] as const;

// ─── Actions ───

export interface CapsuleAction {
  action_type: ActionType;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  deadline?: number;
  fields?: Record<string, unknown>;
  options?: string[];
  payload?: Record<string, unknown>;
}

export type ActionType =
  | 'reply_with_fields'
  | 'reply_with_confirmation'
  | 'propose_times'
  | 'attach_document'
  | 'summarize_thread'
  | 'escalate_to_human'
  | 'update_record'
  | 'process_invoice'
  | 'approve_change';

export const ACTION_TYPES: readonly ActionType[] = [
  'reply_with_fields',
  'reply_with_confirmation',
  'propose_times',
  'attach_document',
  'summarize_thread',
  'escalate_to_human',
  'update_record',
  'process_invoice',
  'approve_change',
] as const;

// ─── Constraints ───

export interface CapsuleConstraints {
  privacy?: 'public' | 'internal' | 'confidential';
  do_not_share?: string[];
  requires_human_approval?: boolean;
  allowed_channels?: string[];
  max_monetary_value?: number;
  allowed_domains?: string[];
}

// ─── Links ───

export interface CapsuleLink {
  link_type: string;
  ref: string;
}

// ─── Completion Checks ───

export interface CompletionCheck {
  id: string;
  type: 'field_present' | 'confirmed' | 'document_attached' | 'custom';
  description: string;
  satisfied: boolean;
}

// ─── Trust ───

export type TrustTier = 0 | 1 | 2;

export interface TrustEvaluation {
  tier: TrustTier;
  signatureValid: boolean;
  dmarcAligned: boolean;
  issuerAllowed: boolean;
  nonceValid: boolean;
  withinTtl: boolean;
  reasons: string[];
}

export interface TrustPolicy {
  enabled: boolean;
  requireSignature: boolean;
  trustedDomains: string[];
  highStakesDomains: string[];
  requireHumanApproval: ActionType[];
  maxMonetaryValue: number;
  blockedDomains: string[];
}

// ─── Signing Types ───

export interface OaemKeyPair {
  kid: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
  algorithm: string;
  validFrom: Date;
  validUntil?: Date;
}

export interface OaemKeysJson {
  keys: Array<{
    kid: string;
    algorithm: string;
    publicKey: JsonWebKey;
    validFrom: string;
    validUntil?: string;
  }>;
}

export interface SigningOptions {
  issuer: string;
  kid: string;
  nonce: string;
  exp: number;
}

export interface VerificationResult {
  valid: boolean;
  issuer?: string;
  kid?: string;
  nonce?: string;
  expiredAt?: number;
  error?: string;
}

// ─── Ledger Types ───

export interface LedgerEntry {
  threadId: string;
  stateVersion: number;
  capsuleHash: string;
  parentHash: string | null;
  intent: IntentType;
  issuer: string;
  capsuleRaw: string;
  trustTier: TrustTier;
  createdAt: Date;
}

export interface LedgerChain {
  threadId: string;
  entries: LedgerEntry[];
  currentState: ThreadState;
  stateVersion: number;
  latestHash: string;
}

// ─── Extracted Capsule Result ───

export interface ExtractedCapsule {
  found: boolean;
  raw?: string;
  signature?: string;
  issuedAt?: number;
  payloadHash?: string;
  payload?: CapsulePayload;
  error?: string;
}
