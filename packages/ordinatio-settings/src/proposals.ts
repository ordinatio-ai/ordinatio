// ===========================================
// ORDINATIO SETTINGS — Setting Change Proposals
// ===========================================
// Multi-sig approval workflow for sensitive
// setting changes. Uses the governance proposal
// pattern from @ordinatio/core (inlined to avoid
// hard dependency).
// ===========================================

import type { SettingsCallbacks, SettingChangeSource } from './types';
import { SETTING_METADATA, setSetting, type SettingKey } from './settings';
import type { SettingsDb } from './types';

// ---- Types ----

export type SettingProposalStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'EXPIRED';

export interface SettingChangePayload {
  key: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface SettingProposal {
  id: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  reason: string;
  requiredApprovals: number;
  status: SettingProposalStatus;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvals: SettingApproval[];
}

export interface SettingApproval {
  id: string;
  proposalId: string;
  approverId: string;
  approverType: string;
  signature?: string | null;
  createdAt: Date;
}

// ---- DB Interface ----

export interface SettingProposalDb {
  settingProposal: {
    create(args: { data: Omit<SettingProposal, 'id' | 'createdAt' | 'updatedAt' | 'approvals'> & { id?: string } }): Promise<SettingProposal>;
    findUnique(args: { where: { id: string }; include?: { approvals?: boolean } }): Promise<SettingProposal | null>;
    findMany(args: { where: Record<string, unknown>; include?: { approvals?: boolean }; orderBy?: Record<string, string>; take?: number }): Promise<SettingProposal[]>;
    update(args: { where: { id: string }; data: Partial<SettingProposal> }): Promise<SettingProposal>;
  };
  settingApproval: {
    create(args: { data: { proposalId: string; approverId: string; approverType: string; signature?: string } }): Promise<SettingApproval>;
  };
}

// ---- Constants ----

const DEFAULT_EXPIRY_HOURS = 72; // 3 days
const DEFAULT_REQUIRED_APPROVALS = 2;

// ---- Functions ----

/**
 * Propose a setting change that requires multi-sig approval.
 */
export async function proposeSettingChange(
  db: SettingProposalDb,
  payload: SettingChangePayload,
  createdBy: string,
  options?: { requiredApprovals?: number; expiryHours?: number },
): Promise<SettingProposal> {
  const expiryHours = options?.expiryHours ?? DEFAULT_EXPIRY_HOURS;
  const requiredApprovals = options?.requiredApprovals ?? DEFAULT_REQUIRED_APPROVALS;

  return db.settingProposal.create({
    data: {
      key: payload.key,
      oldValue: payload.oldValue,
      newValue: payload.newValue,
      reason: payload.reason,
      requiredApprovals,
      status: 'PROPOSED',
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
      createdBy,
    },
  });
}

/**
 * Approve a setting change proposal.
 * If this approval meets the threshold, status transitions to APPROVED.
 */
export async function approveSettingChange(
  db: SettingProposalDb,
  proposalId: string,
  approverId: string,
  approverType: 'human' | 'agent' = 'human',
): Promise<SettingProposal> {
  const proposal = await db.settingProposal.findUnique({
    where: { id: proposalId },
    include: { approvals: true },
  });

  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
  if (proposal.status !== 'PROPOSED') {
    throw new Error(`Cannot approve proposal in status ${proposal.status}`);
  }
  if (new Date() > proposal.expiresAt) {
    throw new Error('Cannot approve expired proposal');
  }
  if (proposal.approvals.some(a => a.approverId === approverId)) {
    throw new Error(`Approver ${approverId} has already approved this proposal`);
  }

  // Record approval
  await db.settingApproval.create({
    data: { proposalId, approverId, approverType },
  });

  // Check if threshold is met
  const newApprovalCount = proposal.approvals.length + 1;
  if (newApprovalCount >= proposal.requiredApprovals) {
    return db.settingProposal.update({
      where: { id: proposalId },
      data: { status: 'APPROVED' },
    });
  }

  return db.settingProposal.findUnique({
    where: { id: proposalId },
    include: { approvals: true },
  }) as Promise<SettingProposal>;
}

/**
 * Apply an approved proposal — actually write the setting.
 * Only works if status is APPROVED and not expired.
 */
export async function applyApprovedChange(
  db: SettingProposalDb & SettingsDb,
  proposalId: string,
  callbacks?: SettingsCallbacks,
): Promise<void> {
  const proposal = await db.settingProposal.findUnique({
    where: { id: proposalId },
    include: { approvals: true },
  });

  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
  if (proposal.status !== 'APPROVED') {
    throw new Error(`Proposal must be APPROVED to apply, currently: ${proposal.status}`);
  }
  if (new Date() > proposal.expiresAt) {
    await db.settingProposal.update({
      where: { id: proposalId },
      data: { status: 'EXPIRED' },
    });
    throw new Error('Proposal has expired');
  }

  // Apply the setting change
  await setSetting(
    db,
    proposal.key as SettingKey,
    proposal.newValue,
    undefined,
    callbacks,
    { source: 'api', changedBy: proposal.createdBy },
  );

  // Mark as applied
  await db.settingProposal.update({
    where: { id: proposalId },
    data: { status: 'APPLIED' },
  });
}

/**
 * Get active (non-expired, non-applied) proposals for a setting key.
 */
export async function getActiveProposals(
  db: SettingProposalDb,
  key?: string,
): Promise<SettingProposal[]> {
  const where: Record<string, unknown> = {
    status: 'PROPOSED',
  };
  if (key) where.key = key;

  return db.settingProposal.findMany({
    where,
    include: { approvals: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/**
 * Check if a setting key requires multi-sig approval.
 */
export function requiresApproval(key: string): boolean {
  const meta = SETTING_METADATA[key as SettingKey];
  return meta?.requiresApproval === true;
}
