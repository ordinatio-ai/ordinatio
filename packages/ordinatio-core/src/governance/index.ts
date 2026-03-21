// IHS
export type {
  RiskLevel,
  GovernanceMode,
  GovernancePolicyOverride,
  GovernancePolicy,
  GovernanceVerdict,
  GovernanceDecision,
  ActorType,
  AuditEntry,
  GovernanceEngine,
} from './types';

export { RISK_ORDINAL, MODE_THRESHOLDS } from './types';

export type { Proposal, ProposalApproval, ProposalStatus } from './proposals';
export { canApply, addApproval, isExpired, markApplied, rejectProposal } from './proposals';
