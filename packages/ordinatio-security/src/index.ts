// ===========================================
// @ordinatio/security — Barrel Export
// ===========================================
// 5-Layer Security Control Plane:
//   Layer 5: Integrity (hash chains, verification)
//   Layer 4: Enforcement (blacklist, throttle, action gate)
//   Layer 3: Policy (trust, policies, intents, playbooks)
//   Layer 2: Detection (pattern matching, thresholds)
//   Layer 1: Logging (events, queries, stats)
//   +Principal Context (trust binding)
// ===========================================

// Types
export type {
  SecurityDb,
  SecurityCallbacks,
  ExtendedSecurityCallbacks,
  SecurityLogger,
  ActivityLogRecord,
  SecurityEventType,
  RiskLevel,
  SecurityEventConfig,
  SecurityEventInput,
  SecurityEvent,
  SecurityEventQueryOptions,
  AlertStatus,
  SecurityAlert,
  CreateAlertInput,
  AlertThreshold,
  AuditResult,
  OutdatedPackage,
  AuditRunner,
} from './types';

// Constants
export { SECURITY_EVENT_TYPES, RISK_LEVELS } from './types';

// Event Config
export { SECURITY_EVENT_CONFIG } from './event-config';

// Alert Thresholds
export { ALERT_THRESHOLDS } from './alert-thresholds';

// Event Helpers
export {
  getSecurityEventConfig,
  getAlertThresholdsForEvent,
  shouldAlwaysAlert,
  getEventTypesByTag,
  getEventTypesByMinRiskLevel,
} from './event-helpers';

// Event Logger
export { logSecurityEvent, sanitizeIp, sanitizeUserAgent } from './event-logger';

// Event Queries
export {
  getSecurityEvents,
  countSecurityEventsInWindow,
  getUserSecurityHistory,
  getSecurityEventsByIp,
  getRecentHighRiskEvents,
  getSecurityEventStats,
} from './event-queries';

// Event Convenience
export {
  logLoginSuccess,
  logLoginFailure,
  logRateLimitExceeded,
  logPermissionDenied,
  logSuspiciousActivity,
} from './event-convenience';

// Alert Management
export {
  createAlert,
  findExistingAlert,
  getActiveAlerts,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getAlertStats,
  activityToAlert,
} from './alert-management';

// Alert Detection
export {
  checkSecurityPatterns,
  checkForBruteForce,
  checkForAccountTakeover,
  checkForSuspiciousPatterns,
} from './alert-detection';

// Security Audit
export { runSecurityAudit, getLastSecurityAudit } from './security-audit';

// Security Headers
export {
  SECURITY_HEADERS,
  getSecurityHeaders,
  buildSecurityHeaders,
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
  headerBuilders,
} from './security-headers';

// Errors
export { secmonError, SECMON_ERRORS } from './errors';

// ===========================================
// NEW: Principal Context (Sprint 1)
// ===========================================
export type { PrincipalType, AuthMethod, TrustTier } from './principal-context';
export type { PrincipalContext } from './principal-context';
export { buildPrincipalContext, validatePrincipal, describePrincipal } from './principal-context';

// ===========================================
// NEW: Replay Protection (Sprint 1)
// ===========================================
export type { NonceCheckResult, NonceStore } from './replay/nonce-store';
export { InMemoryNonceStore } from './replay/nonce-store';

// ===========================================
// NEW: Integrity Layer (Sprint 2)
// ===========================================
export type { HashedSecurityEvent, ChainVerificationResult } from './integrity/event-hash';
export {
  computeEventHash,
  computeIntegrityHash,
  verifyEventChain,
  buildHashedEvent,
} from './integrity/event-hash';
export { getLastHash, buildIntegrityMetadata } from './integrity/chain-state';
export type { HashChainEntry, HashChainResult } from './integrity/verification';
export {
  verifyContentIntegrity,
  verifyChainLink,
  verifyHashChain,
} from './integrity/verification';

// ===========================================
// NEW: Trust Evaluator (Sprint 3)
// ===========================================
export { evaluateTrust } from './trust/trust-evaluator';

// ===========================================
// NEW: Key Store (Trust Continuity)
// ===========================================
export type { StoredKey, KeyLookupResult, KeyStore } from './trust/key-store';
export { InMemoryKeyStore, resolveKeyForTrust } from './trust/key-store';

// ===========================================
// NEW: Policy Types (Sprint 3)
// ===========================================
export type {
  TrustInput,
  TrustOrgPolicy,
  TrustEvaluation,
  PolicyOperator,
  PolicyCondition,
  SecurityPolicy,
  PolicyContext,
  PolicyDecision,
  PolicyRecommendation,
  EnforcementAction,
  BlockResult,
  IntentResult,
  PlaybookStep,
  SecurityPlaybook,
  AlertImpact,
  AlertRecovery,
  SecurityPosture,
} from './policy/policy-types';
export { SecurityIntent } from './policy/policy-types';

// ===========================================
// NEW: Policy Engine (Sprint 3)
// ===========================================
export { evaluatePolicy, wouldBeDenied } from './policy/policy-engine';

// ===========================================
// NEW: Severity Rules (Sprint 3)
// ===========================================
export {
  SEVERITY_ENFORCEMENT_MAP,
  getSeverityAction,
  shouldBlock,
  shouldThrottle,
} from './policy/severity-rules';

// ===========================================
// NEW: Security Intents (Sprint 3)
// ===========================================
export { resolveIntent, getPlaybookForIntent } from './policy/security-intents';

// ===========================================
// NEW: Playbooks (Sprint 3)
// ===========================================
export {
  SECURITY_PLAYBOOKS,
  getPlaybookForAlert,
  getAllPlaybooks,
  getPlaybookById,
} from './policy/playbooks';

// ===========================================
// NEW: Enforcement (Sprint 4)
// ===========================================
export type { Blacklist } from './enforcement/blacklist';
export { InMemoryBlacklist, CompositeBlacklist } from './enforcement/blacklist';
export type { ActionGateConfig } from './enforcement/action-gate';
export { shouldBlockAction, getThrottleDelay } from './enforcement/action-gate';

// ===========================================
// NEW: Alert Recovery (Sprint 5)
// ===========================================
export { buildAlertRecovery, getAllRecoveryTemplates } from './alert-recovery';

// ===========================================
// NEW: Security Posture (Sprint 5)
// ===========================================
export type { PostureOptions } from './posture/security-posture';
export { getSecurityPosture } from './posture/security-posture';

// ===========================================
// NEW: Security Summary (Sprint 5)
// ===========================================
export {
  summarizePosture,
  summarizeAlert,
  postureNeedsAttention,
} from './posture/security-summary';
