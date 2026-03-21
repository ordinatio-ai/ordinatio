// ===========================================
// ORDINATIO CORE — Governance Proposals
// ===========================================
// General-purpose proposal lifecycle for changes
// that require multi-party approval. Not specific
// to settings — any module can use this pattern.
// ===========================================

export type ProposalStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'EXPIRED';

export interface Proposal<T = unknown> {
  id: string;
  type: string;
  payload: T;
  requiredApprovals: number;
  approvals: ProposalApproval[];
  status: ProposalStatus;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
}

export interface ProposalApproval {
  approverId: string;
  approverType: 'human' | 'agent';
  timestamp: Date;
  signature?: string;
}

/**
 * Check if a proposal has enough approvals to be applied.
 */
export function canApply<T>(proposal: Proposal<T>): boolean {
  if (proposal.status !== 'PROPOSED' && proposal.status !== 'APPROVED') return false;
  if (isExpired(proposal)) return false;
  return proposal.approvals.length >= proposal.requiredApprovals;
}

/**
 * Add an approval to a proposal. Returns a new proposal object (immutable).
 * Prevents duplicate approvals from the same approver.
 * Transitions status to APPROVED when threshold is met.
 */
export function addApproval<T>(proposal: Proposal<T>, approval: ProposalApproval): Proposal<T> {
  if (proposal.status !== 'PROPOSED') {
    throw new Error(`Cannot approve proposal in status ${proposal.status}`);
  }
  if (isExpired(proposal)) {
    throw new Error('Cannot approve expired proposal');
  }
  if (proposal.approvals.some(a => a.approverId === approval.approverId)) {
    throw new Error(`Approver ${approval.approverId} has already approved this proposal`);
  }

  const newApprovals = [...proposal.approvals, approval];
  const newStatus = newApprovals.length >= proposal.requiredApprovals ? 'APPROVED' : 'PROPOSED';

  return { ...proposal, approvals: newApprovals, status: newStatus };
}

/**
 * Check if a proposal has expired.
 */
export function isExpired<T>(proposal: Proposal<T>): boolean {
  return new Date() > proposal.expiresAt;
}

/**
 * Mark a proposal as applied.
 */
export function markApplied<T>(proposal: Proposal<T>): Proposal<T> {
  if (!canApply(proposal)) {
    throw new Error('Proposal cannot be applied — insufficient approvals or wrong status');
  }
  return { ...proposal, status: 'APPLIED' };
}

/**
 * Reject a proposal.
 */
export function rejectProposal<T>(proposal: Proposal<T>): Proposal<T> {
  if (proposal.status !== 'PROPOSED') {
    throw new Error(`Cannot reject proposal in status ${proposal.status}`);
  }
  return { ...proposal, status: 'REJECTED' };
}
