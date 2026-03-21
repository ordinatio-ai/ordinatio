// ===========================================
// @ordinatio/security — Policy Types
// ===========================================
// All types for the Policy Engine, Trust Evaluator,
// Security Intents, and Playbooks layers.
// ===========================================

import type { RiskLevel } from '../types';
import type { PrincipalContext } from '../principal-context';

// ===========================================
// TRUST EVALUATION
// ===========================================

export interface TrustInput {
  issuer?: string;
  signatureValid?: boolean;
  dmarcStatus?: 'pass' | 'fail' | 'none';
  nonceValid?: boolean;
  ttlValid?: boolean;
  orgPolicy?: TrustOrgPolicy;
}

export interface TrustOrgPolicy {
  trustedDomains?: string[];
  highStakesDomains?: string[];
  blockedDomains?: string[];
  requireSignature?: boolean;
}

export interface TrustEvaluation {
  trustTier: 0 | 1 | 2;
  trustScore: number; // 0-100
  reasons: string[];
}

// ===========================================
// POLICY ENGINE
// ===========================================

export type PolicyOperator = 'eq' | 'neq' | 'in' | 'gte' | 'lte';

export interface PolicyCondition {
  field: string;
  operator: PolicyOperator;
  value: unknown;
}

export interface SecurityPolicy {
  id: string;
  name: string;
  conditions: PolicyCondition[];
  decision: 'allow' | 'escalate' | 'deny';
  priority: number; // higher = evaluated first
  constraints?: Record<string, unknown>;
}

export interface PolicyContext {
  principal: PrincipalContext;
  action: string;
  resource?: string;
  riskLevel?: RiskLevel;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  decision: 'allow' | 'escalate' | 'deny';
  policyId?: string;
  policyName?: string;
  trustTier: 0 | 1 | 2;
  reasons: string[];
  requiresHuman: boolean;
  constraints: Record<string, unknown>;
  recommendation?: PolicyRecommendation;
}

export interface PolicyRecommendation {
  nextAction: string;
  safeAlternatives: string[];
}

// ===========================================
// ENFORCEMENT
// ===========================================

export type EnforcementAction = 'allow' | 'log' | 'throttle' | 'block';

export interface BlockResult {
  blocked: boolean;
  reason?: string;
  throttleMs?: number;
  recovery?: PolicyRecommendation;
}

// ===========================================
// SECURITY INTENTS
// ===========================================

export enum SecurityIntent {
  VERIFY_IDENTITY = 'VERIFY_IDENTITY',
  EVALUATE_TRUST = 'EVALUATE_TRUST',
  APPROVE_HIGH_RISK = 'APPROVE_HIGH_RISK',
  QUARANTINE_EVENT = 'QUARANTINE_EVENT',
  ROTATE_KEYS = 'ROTATE_KEYS',
  ESCALATE_TO_HUMAN = 'ESCALATE_TO_HUMAN',
}

export interface IntentResult {
  intent: SecurityIntent;
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// ===========================================
// PLAYBOOKS
// ===========================================

export interface PlaybookStep {
  action: string;
  params: Record<string, unknown>;
  description: string;
}

export interface SecurityPlaybook {
  id: string;
  name: string;
  trigger: string;
  steps: PlaybookStep[];
}

// ===========================================
// ALERT RECOVERY
// ===========================================

export type AlertImpact = 'halt_execution' | 'degrade_gracefully' | 'continue_monitoring';

export interface AlertRecovery {
  impact: AlertImpact;
  action: string;
  reason: string;
  allowedFollowups: string[];
}

// ===========================================
// SECURITY POSTURE
// ===========================================

export interface SecurityPosture {
  orgId: string | null;
  principalId: string | null;
  trustTier: 0 | 1 | 2;
  riskScore: number;
  activeAlerts: Array<{
    id: string;
    alertType: string;
    riskLevel: RiskLevel;
    title: string;
    recovery?: AlertRecovery;
  }>;
  policyRestrictions: string[];
  blockedActions: string[];
  integrityStatus: 'verified' | 'unverified' | 'broken';
  recommendedNextActions: string[];
  _actions: Record<string, { href: string; method: string; description: string }>;
}
