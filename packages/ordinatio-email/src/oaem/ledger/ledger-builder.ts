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
  incomingCapsule.actions.forEach((action) => {
    if (action.action_type === 'reply_with_fields' && action.fields) {
      nextState.pending = nextState.pending.filter((pending) => 
        !(action.fields[pending.id] !== undefined)
      );
    }
    
    if (action.action_type === 'reply_with_confirmation') {
      nextState.pending = nextState.pending.filter(
        (p) => !p.description.toLowerCase().includes('confirm')
      );
    }
  });

  // Add new pending items from capsule state
  if (incomingCapsule.state?.pending) {
    incomingCapsule.state.pending.forEach((item) => {
      if (!nextState.pending.some((p) => p.id === item.id)) {
        nextState.pending.push(item);
      }
    });
  }

  // Mark completed checks
  if (incomingCapsule.checks) {
    incomingCapsule.checks.forEach((check) => {
      if (check.satisfied && !nextState.completed_checks.includes(check.id)) {
        nextState.completed_checks.push(check.id);
      }
    });
  }

  return { state: nextState, hash, stateVersion };
}

/**
 * Create an initial empty thread state.
 */
export function createInitialState(): ThreadState {
  return {
    workflow_node: '',
    status: null,
    pending: [],
    data: {},
    completed_checks: [],
  };
}

/**
 * Update the status of a thread based on the intent type and current status.
 */
function resolveStatus(intent: IntentType, currentStatus: string | null): string {
  switch (intent) {
    case 'finalize':
      return 'finalized';
    case 'cancel':
      return 'cancelled';
    case 'ship':
      return 'shipped';
    default:
      return currentStatus ?? 'pending';
  }
}