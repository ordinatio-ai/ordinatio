import { describe, it, expect } from 'vitest';
import {
  inferSafetyClass,
  getSafetyClasses,
  inferPauseReason,
  buildProofArtifact,
  createDecisionJournal,
  summarizeDecisions,
  type DualIntent,
  type SafetyClass,
  type PauseReason,
  type ExecutionPlan,
  type ProofArtifact,
  type DecisionJournal,
} from '../automation/refinements';
import type { DagExecutionResult } from '../automation/dag-types';
import type { DoDCheck, DoDResult } from '../automation/intent-layer';

// ====================================================
// 1. DUAL INTENT
// ====================================================

describe('Dual Intent', () => {
  it('separates execution intent from business intent', () => {
    const intent: DualIntent = {
      executionIntent: 'send_message',
      businessIntent: 'capture_new_lead',
    };
    expect(intent.executionIntent).toBe('send_message');
    expect(intent.businessIntent).toBe('capture_new_lead');
  });

  it('two automations can share executionIntent but differ in businessIntent', () => {
    const leadCapture: DualIntent = { executionIntent: 'send_message', businessIntent: 'capture_new_lead' };
    const shipping: DualIntent = { executionIntent: 'send_message', businessIntent: 'notify_shipping' };
    expect(leadCapture.executionIntent).toBe(shipping.executionIntent);
    expect(leadCapture.businessIntent).not.toBe(shipping.businessIntent);
  });
});

// ====================================================
// 2. PROOF ARTIFACTS
// ====================================================

describe('Proof Artifacts', () => {
  const makeResult = (): DagExecutionResult => ({
    status: 'completed',
    nodeResults: [
      { nodeId: 'create', status: 'completed', result: { contactId: 'c-1' }, retryCount: 0, completedAt: new Date() },
      { nodeId: 'tag', status: 'completed', result: { tagged: true }, retryCount: 0, completedAt: new Date() },
    ],
    nodesExecuted: 2, actionsCompleted: 2, actionsFailed: 0, nodesSkipped: 0,
    durationMs: 800, finalContext: {}, log: [],
  });

  const makeDoDResult = (): DoDResult => ({
    satisfied: true,
    satisfiedCount: 2,
    totalChecks: 2,
    checks: [
      { description: 'Contact exists', passed: true },
      { description: 'Contact tagged', passed: true },
    ],
  });

  it('builds proof artifact from execution result', () => {
    const proof = buildProofArtifact({
      executionId: 'exec-1',
      automationId: 'auto-1',
      dualIntent: { executionIntent: 'update_state', businessIntent: 'capture_new_lead' },
      dodChecks: [
        { description: 'Contact exists', verification: { type: 'field_check', field: 'contactId', comparator: 'IS_NOT_EMPTY', value: '' } },
        { description: 'Contact tagged', verification: { type: 'field_check', field: 'tagged', comparator: 'EQUALS', value: 'true' } },
      ],
      dodResult: makeDoDResult(),
      dagResult: makeResult(),
      sideEffects: ['contacts', 'tags'],
    });

    expect(proof.artifactType).toBe('execution_proof');
    expect(proof.dodSatisfied).toBe(true);
    expect(proof.expected.executionIntent).toBe('update_state');
    expect(proof.expected.businessIntent).toBe('capture_new_lead');
    expect(proof.expected.definitionOfDone).toHaveLength(2);
    expect(proof.actual.actionsCompleted).toContain('create');
    expect(proof.actual.actionsCompleted).toContain('tag');
    expect(proof.actual.sideEffectsOccurred).toEqual(['contacts', 'tags']);
    expect(proof.evidence.length).toBeGreaterThan(0);
  });

  it('records evidence from completed actions', () => {
    const proof = buildProofArtifact({
      executionId: 'exec-2',
      automationId: 'auto-1',
      dualIntent: { executionIntent: 'update_state', businessIntent: 'test' },
      dodChecks: [],
      dodResult: { satisfied: true, satisfiedCount: 0, totalChecks: 0, checks: [] },
      dagResult: makeResult(),
      sideEffects: [],
    });

    const actionEvidence = proof.evidence.filter(e => e.source === 'dag_executor');
    expect(actionEvidence.length).toBe(2); // Two completed actions
    expect(actionEvidence[0].claim).toContain('create');
  });

  it('records evidence from DoD checks', () => {
    const proof = buildProofArtifact({
      executionId: 'exec-3',
      automationId: 'auto-1',
      dualIntent: { executionIntent: 'update_state', businessIntent: 'test' },
      dodChecks: [{ description: 'X exists', verification: { type: 'field_check', field: 'x', comparator: 'EQUALS', value: '1' } }],
      dodResult: { satisfied: false, satisfiedCount: 0, totalChecks: 1, checks: [{ description: 'X exists', passed: false, reason: 'not found' }] },
      dagResult: makeResult(),
      sideEffects: [],
    });

    expect(proof.dodSatisfied).toBe(false);
    const dodEvidence = proof.evidence.filter(e => e.source === 'dod_evaluator');
    expect(dodEvidence.length).toBe(1);
    expect(dodEvidence[0].data.passed).toBe(false);
  });

  it('captures failed actions in actual', () => {
    const failedResult: DagExecutionResult = {
      ...makeResult(),
      status: 'failed',
      nodeResults: [
        { nodeId: 'create', status: 'failed', error: 'Duplicate', retryCount: 0 },
      ],
      actionsFailed: 1, actionsCompleted: 0,
    };

    const proof = buildProofArtifact({
      executionId: 'exec-4', automationId: 'auto-1',
      dualIntent: { executionIntent: 'update_state', businessIntent: 'test' },
      dodChecks: [], dodResult: { satisfied: false, satisfiedCount: 0, totalChecks: 0, checks: [] },
      dagResult: failedResult, sideEffects: [],
    });

    expect(proof.actual.actionsFailed).toContain('create');
    expect(proof.actual.finalStatus).toBe('failed');
  });
});

// ====================================================
// 3. SAFETY CLASSES
// ====================================================

describe('Safety Classes', () => {
  describe('inferSafetyClass', () => {
    it('read_only for GET/LIST/SEARCH/FIND', () => {
      expect(inferSafetyClass('GET_CLIENT')).toBe('read_only');
      expect(inferSafetyClass('LIST_ORDERS')).toBe('read_only');
      expect(inferSafetyClass('SEARCH_CONTACTS')).toBe('read_only');
      expect(inferSafetyClass('FIND_BY_EMAIL')).toBe('read_only');
    });

    it('irreversible_write for DELETE/REMOVE/ARCHIVE', () => {
      expect(inferSafetyClass('DELETE_CLIENT')).toBe('irreversible_write');
      expect(inferSafetyClass('REMOVE_TAG')).toBe('irreversible_write');
      expect(inferSafetyClass('ARCHIVE_EMAIL')).toBe('irreversible_write');
    });

    it('external_side_effect for email/webhook', () => {
      expect(inferSafetyClass('SEND_EMAIL')).toBe('external_side_effect');
      expect(inferSafetyClass('REPLY_TO_EMAIL')).toBe('external_side_effect');
      expect(inferSafetyClass('FORWARD_EMAIL')).toBe('external_side_effect');
      expect(inferSafetyClass('CALL_WEBHOOK')).toBe('external_side_effect');
    });

    it('money_movement for financial actions', () => {
      expect(inferSafetyClass('PROCESS_PAYMENT')).toBe('money_movement');
      expect(inferSafetyClass('ISSUE_REFUND')).toBe('money_movement');
      expect(inferSafetyClass('CREATE_INVOICE')).toBe('money_movement');
    });

    it('identity_or_permission_change for auth actions', () => {
      expect(inferSafetyClass('CHANGE_ROLE')).toBe('identity_or_permission_change');
      expect(inferSafetyClass('GRANT_PERMISSION')).toBe('identity_or_permission_change');
      expect(inferSafetyClass('REVOKE_ACCESS')).toBe('identity_or_permission_change');
    });

    it('reversible_write for CREATE/UPDATE/ADD_TAG', () => {
      expect(inferSafetyClass('CREATE_CONTACT')).toBe('reversible_write');
      expect(inferSafetyClass('UPDATE_CLIENT')).toBe('reversible_write');
      expect(inferSafetyClass('ADD_TAG_TO_CONTACT')).toBe('reversible_write');
      expect(inferSafetyClass('ASSIGN_TASK')).toBe('reversible_write');
    });

    it('defaults to reversible_write for unknown', () => {
      expect(inferSafetyClass('DO_SOMETHING')).toBe('reversible_write');
    });
  });

  describe('getSafetyClasses', () => {
    it('returns unique classes for a set of actions', () => {
      const classes = getSafetyClasses(['CREATE_CONTACT', 'SEND_EMAIL', 'DELETE_CLIENT']);
      expect(classes).toContain('reversible_write');
      expect(classes).toContain('external_side_effect');
      expect(classes).toContain('irreversible_write');
      expect(classes.length).toBe(3);
    });

    it('deduplicates same class', () => {
      const classes = getSafetyClasses(['CREATE_CONTACT', 'CREATE_TASK', 'UPDATE_CLIENT']);
      expect(classes).toEqual(['reversible_write']);
    });

    it('returns empty for empty input', () => {
      expect(getSafetyClasses([])).toEqual([]);
    });
  });
});

// ====================================================
// 4. PAUSED-BY-REASON
// ====================================================

describe('Pause Reasons', () => {
  describe('inferPauseReason', () => {
    it('wait node with event → waiting_for_event', () => {
      expect(inferPauseReason('wait', { awaitEvent: 'ORDER_PLACED' })).toBe('waiting_for_event');
    });

    it('wait node without event → waiting_for_time', () => {
      expect(inferPauseReason('wait', {})).toBe('waiting_for_time');
    });

    it('approval node → waiting_for_human_approval', () => {
      expect(inferPauseReason('approval')).toBe('waiting_for_human_approval');
    });

    it('unknown → paused_by_user', () => {
      expect(inferPauseReason('other')).toBe('paused_by_user');
    });
  });
});

// ====================================================
// 5. EXECUTION PLAN (Type Verification)
// ====================================================

describe('Execution Plan', () => {
  it('has a stable schema with all required fields', () => {
    const plan: ExecutionPlan = {
      schemaVersion: 'execution-plan-v1',
      generatedAt: new Date(),
      trigger: { eventType: 'EMAIL_RECEIVED' },
      intent: { executionIntent: 'update_state', businessIntent: 'capture_lead' },
      conditions: { evaluated: true, wouldPass: true, trace: ['from IS_NOT_EMPTY → PASS'] },
      graph: {
        totalNodes: 5, actionNodes: 3, chosenBranches: ['new-lead-path'],
        rejectedBranches: ['existing-client-path'], parallelPaths: 0, waitStates: 0, approvalPoints: 0,
      },
      sideEffects: {
        writes: ['contacts', 'tags'], externalCalls: [],
        irreversible: false, safetyClasses: ['reversible_write'],
      },
      approvals: { required: false, points: [], approverRoles: [] },
      trust: { requiredTier: 0, currentTier: 1, sufficient: true },
      recovery: { hasFailureEdges: true, hasFallbackEdges: true, hasRetryEdges: false, maxRetries: 0, rollbackPossible: true },
      completion: { definitionOfDone: ['Contact exists', 'Contact tagged'], estimatedDurationMs: 1500, confidence: 0.85 },
    };

    expect(plan.schemaVersion).toBe('execution-plan-v1');
    expect(plan.intent.executionIntent).toBe('update_state');
    expect(plan.intent.businessIntent).toBe('capture_lead');
    expect(plan.sideEffects.safetyClasses).toContain('reversible_write');
    expect(plan.graph.chosenBranches).toContain('new-lead-path');
    expect(plan.graph.rejectedBranches).toContain('existing-client-path');
    expect(plan.trust.sufficient).toBe(true);
    expect(plan.completion.confidence).toBe(0.85);
  });
});

// ====================================================
// 6. DECISION JOURNAL (Explanatory Layer)
// ====================================================

describe('Decision Journal', () => {
  it('creates empty journal', () => {
    const { journal } = createDecisionJournal('exec-1');
    expect(journal.executionId).toBe('exec-1');
    expect(journal.entries).toHaveLength(0);
  });

  it('records decisions with record()', () => {
    const { journal, record } = createDecisionJournal('exec-1');

    record({
      nodeId: 'check-sender',
      type: 'path_selection',
      chosen: 'create-contact (new lead path)',
      rejected: [{ option: 'link-email (existing client path)', reason: 'sender not found in clients table' }],
      reasoning: 'Email from unknown sender — not in clients database',
    });

    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0].type).toBe('path_selection');
    expect(journal.entries[0].chosen).toContain('create-contact');
    expect(journal.entries[0].rejected).toHaveLength(1);
    expect(journal.entries[0].timestamp).toBeInstanceOf(Date);
  });

  it('records decisions with explain() shorthand', () => {
    const { journal, explain } = createDecisionJournal('exec-2');

    explain('policy-gate', 'action_allowed', 'SEND_EMAIL', 'Trust tier 2 sufficient for external_side_effect');
    explain('retry-node', 'retry_decision', 'retry attempt 2', 'Transient error (ECONNRESET), safe to retry');

    expect(journal.entries).toHaveLength(2);
    expect(journal.entries[0].type).toBe('action_allowed');
    expect(journal.entries[1].type).toBe('retry_decision');
  });

  it('records path rejection with reasons', () => {
    const { journal, explain } = createDecisionJournal('exec-3');

    explain(
      'condition-1', 'path_selection', 'standard-treatment',
      'Client type is REGULAR',
      [
        { option: 'vip-treatment', reason: 'clientType != VIP' },
        { option: 'wholesale-treatment', reason: 'clientType != WHOLESALE' },
      ],
    );

    expect(journal.entries[0].rejected).toHaveLength(2);
    expect(journal.entries[0].rejected![0].option).toBe('vip-treatment');
    expect(journal.entries[0].rejected![0].reason).toBe('clientType != VIP');
  });

  it('records escalation decisions', () => {
    const { journal, explain } = createDecisionJournal('exec-4');

    explain('trust-check', 'escalation_triggered', 'escalate to admin',
      'Action DELETE_CLIENT requires trust tier 2 but principal has tier 0');

    expect(journal.entries[0].type).toBe('escalation_triggered');
    expect(journal.entries[0].reasoning).toContain('trust tier 2');
  });

  it('records intent evaluation', () => {
    const { journal, explain } = createDecisionJournal('exec-5');

    explain('post-execution', 'intent_evaluation', 'intent NOT satisfied',
      'DoD check "Contact tagged" failed — tag was not applied due to rate limiting');

    expect(journal.entries[0].type).toBe('intent_evaluation');
    expect(journal.entries[0].chosen).toContain('NOT satisfied');
  });

  describe('summarizeDecisions', () => {
    it('returns "No decisions" for empty journal', () => {
      const { journal } = createDecisionJournal('exec-1');
      expect(summarizeDecisions(journal)).toBe('No decisions recorded.');
    });

    it('produces compact summary of all decisions', () => {
      const { journal, explain } = createDecisionJournal('exec-1');

      explain('cond', 'path_selection', 'new-lead', 'Unknown sender',
        [{ option: 'existing-client', reason: 'not in DB' }]);
      explain('action', 'action_allowed', 'CREATE_CONTACT', 'Low risk, trust sufficient');

      const summary = summarizeDecisions(journal);
      expect(summary).toContain('[cond] path_selection');
      expect(summary).toContain('new-lead');
      expect(summary).toContain('Rejected: existing-client');
      expect(summary).toContain('[action] action_allowed');
    });
  });
});
