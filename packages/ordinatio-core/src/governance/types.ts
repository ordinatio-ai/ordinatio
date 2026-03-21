// IHS
/**
 * Governance as Architecture (Innovation 5)
 *
 * Not RBAC bolted on. The foundational interaction pattern. Every capability
 * has a risk classification. Organizations configure approval thresholds.
 * Same capabilities, same tools, different governance policies. No code changes.
 *
 * Per Book V: Every capability invocation produces an AuditEntry with checksum.
 * Append-only. No mutation. No deletion. This is the execution substrate.
 */

// ---------------------------------------------------------------------------
// Risk Classification
// ---------------------------------------------------------------------------

/**
 * Risk levels ordered by severity.
 * - observe: Read data, no side effects — auto-approved
 * - suggest: Propose changes — configurable
 * - act: Mutate data within module — configurable
 * - govern: Cross-module effects, irreversible — always requires approval
 */
export type RiskLevel = 'observe' | 'suggest' | 'act' | 'govern';

/** Numeric mapping for comparison (higher = more risky) */
export const RISK_ORDINAL: Record<RiskLevel, number> = {
  observe: 0,
  suggest: 1,
  act: 2,
  govern: 3,
} as const;

// ---------------------------------------------------------------------------
// Governance Policy (per-organization)
// ---------------------------------------------------------------------------

/**
 * Pre-defined governance modes.
 * - startup: Auto-approve below Govern
 * - enterprise: Require approval for Act+
 * - regulated: Require approval for Suggest+
 */
export type GovernanceMode = 'startup' | 'enterprise' | 'regulated' | 'custom';

export interface GovernancePolicyOverride {
  /** Capability ID to override */
  readonly capabilityId: string;
  /** Override risk level for this capability */
  readonly effectiveRisk: RiskLevel;
  /** Reason for the override */
  readonly reason: string;
}

export interface GovernancePolicy {
  /** Organization ID this policy belongs to */
  readonly organizationId: string;
  /** Pre-defined mode or custom */
  readonly mode: GovernanceMode;
  /** Minimum risk level that requires human approval */
  readonly approvalThreshold: RiskLevel;
  /** Per-capability overrides */
  readonly overrides: readonly GovernancePolicyOverride[];
}

/** Default thresholds per mode */
export const MODE_THRESHOLDS: Record<GovernanceMode, RiskLevel> = {
  startup: 'govern',      // Only Govern needs approval
  enterprise: 'act',      // Act + Govern need approval
  regulated: 'suggest',   // Suggest + Act + Govern need approval
  custom: 'act',          // Default to enterprise-level
} as const;

// ---------------------------------------------------------------------------
// Governance Decision
// ---------------------------------------------------------------------------

export type GovernanceVerdict = 'approved' | 'denied' | 'requires_approval';

export interface GovernanceDecision {
  /** The verdict */
  readonly verdict: GovernanceVerdict;
  /** Capability that was evaluated */
  readonly capabilityId: string;
  /** Risk level of the capability */
  readonly risk: RiskLevel;
  /** Organization's approval threshold */
  readonly threshold: RiskLevel;
  /** Why this decision was made */
  readonly reason: string;
  /** If requires_approval, who should approve */
  readonly approvers?: readonly string[];
  /** Timestamp of the decision */
  readonly decidedAt: Date;
}

// ---------------------------------------------------------------------------
// Audit Entry (append-only execution record)
// ---------------------------------------------------------------------------

export type ActorType = 'user' | 'agent' | 'system' | 'automation';

export interface AuditEntry {
  /** Unique entry ID */
  readonly id: string;
  /** Capability that was invoked */
  readonly capabilityId: string;
  /** Module the capability belongs to */
  readonly moduleId: string;
  /** Who performed the action */
  readonly actorType: ActorType;
  readonly actorId: string;
  /** Input parameters (sanitized — no secrets) */
  readonly inputs: Record<string, unknown>;
  /** Output summary */
  readonly output: Record<string, unknown>;
  /** Risk level at time of invocation */
  readonly risk: RiskLevel;
  /** Governance decision that authorized this */
  readonly governanceVerdict: GovernanceVerdict;
  /** SHA-256 checksum of (capabilityId + moduleId + actorId + inputs + governanceVerdict + timestamp + previousChecksum) */
  readonly checksum: string;
  /** Checksum of the previous audit entry — forms a hash chain for proof-of-history */
  readonly previousChecksum?: string;
  /** When this was recorded */
  readonly timestamp: Date;
  /** Organization context */
  readonly organizationId: string;
}

// ---------------------------------------------------------------------------
// Governance Engine Interface
// ---------------------------------------------------------------------------

export interface GovernanceEngine {
  /**
   * Evaluate whether a capability invocation should proceed.
   * Checks risk level against org policy thresholds.
   */
  evaluate(
    capabilityId: string,
    risk: RiskLevel,
    actorType: ActorType,
    actorId: string,
    organizationId: string,
  ): Promise<GovernanceDecision>;

  /**
   * Record a capability invocation in the audit ledger.
   * Append-only — returns the created entry with chain-linked checksum.
   */
  record(entry: Omit<AuditEntry, 'id' | 'checksum' | 'previousChecksum' | 'timestamp'>): Promise<AuditEntry>;

  /**
   * Verify an audit entry's checksum matches its content.
   * Returns true if integrity is intact.
   */
  verify(entry: AuditEntry): boolean;

  /**
   * Get the governance policy for an organization.
   */
  getPolicy(organizationId: string): Promise<GovernancePolicy>;

  /**
   * Update the governance policy for an organization.
   * This is itself a Govern-level action.
   */
  setPolicy(organizationId: string, policy: Partial<GovernancePolicy>): Promise<GovernancePolicy>;
}
