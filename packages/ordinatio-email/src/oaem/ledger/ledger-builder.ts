// ===========================================
// LEDGER BUILDER — State Transition Engine
// ===========================================
// Builds the next thread state from current state + incoming capsule.
// Each transition: increment version, hash chain, apply actions.
// ===========================================

import type { ThreadState, CapsulePayload, IntentType } from './types';
import { computeHash } from '../signing/hash';

export interface BuildResult {
  state: ThreadState;
  hash: string;
  stateVersion: number;
}

/**
 * Build the next thread state from current state + incoming capsule.
 *
 * 1. Increment state_version
 * 2. Compute parent_hash = SHA-256 of serialized previous capsule
 * 3. Apply incoming actions to pending items
 * 4. Update status based on intent
 * 5. Mark completed checks
 */
export function buildNextState(
  currentState: ThreadState | null,
  incomingCapsule: CapsulePayload,
  previousCapsuleRaw: string | null
): BuildResult {
  const prevState = currentState ?? createInitialState();
  const stateVersion = (incomingCapsule.thread.state_version ?? 0) + 1;

  // Compute hash of the incoming capsule for chain
  const capsuleStr = JSON.stringify(incomingCapsule);
  const hash = computeHash(capsuleStr);

  // Start with the previous state
  const nextState: ThreadState = {
    workflow_node: incomingCapsule.state?.workflow_node ?? prevState.workflow_node,
    status: resolveStatus(incomingCapsule.intent, prevState.status),
    pending: [...prevState.pending],
    data: { ...prevState.data, ...(incomingCapsule.state?.data ?? {}) },
    completed_checks: [...prevState.completed_checks],
  };

  // Apply actions to pending items
  for (const action of incomingCapsule.actions) {
    if (action.action_type === 'reply_with_fields' && action.fields) {
      // Mark pending items as completed if their fields are satisfied
      for (const pending of nextState.pending) {
        if (action.fields[pending.id] !== undefined) {
          nextState.pending = nextState.pending.filter((p) => p.id !== pending.id);
        }
      }
    }

    if (action.action_type === 'reply_with_confirmation') {
      // Confirmation actions resolve matching pending items
      nextState.pending = nextState.pending.filter(
        (p) => !p.description.toLowerCase().includes('confirm')
      );
    }
  }

  // Add new pending items from capsule state
  if (incomingCapsule.state?.pending) {
    for (const item of incomingCapsule.state.pending) {
      if (!nextState.pending.some((p) => p.id === item.id)) {
        nextState.pending.push(item);
      }
    }
  }

  // Mark completed checks
  if (incomingCapsule.checks) {
    for (const check of incomingCapsule.checks) {
      if (check.satisfied && !nextState.completed_checks.includes(check.id)) {
        nextState.completed_checks.push(check.id);
      }
    }
  }

  return { state: nextState, hash, stateVersion };
}

/**
 * Create an initial empty thread state.
 */
export function createInitialState(): ThreadState {
  return {
    status: 'open',
    pending: [],
    data: {},
    completed_checks: [],
  };
}

/**
 * Resolve the next thread status based on intent type.
 */
function resolveStatus(
  intent: IntentType,
  currentStatus: ThreadState['status']
): ThreadState['status'] {
  switch (intent) {
    case 'information_request':
    case 'task_assignment':
    case 'approval_request':
      return 'awaiting_reply';
    case 'proposal_offer':
      return 'in_progress';
    case 'commit_decision':
    case 'acknowledgment':
      return currentStatus === 'awaiting_reply' ? 'in_progress' : currentStatus;
    case 'handoff_human':
    case 'escalation':
      return 'blocked';
    case 'status_sync':
      return currentStatus; // No status change
    default:
      return currentStatus;
  }
}
