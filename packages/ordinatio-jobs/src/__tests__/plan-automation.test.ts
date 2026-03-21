import { describe, it, expect } from 'vitest';
import { planAutomation } from '../automation/plan-automation';
import { dagBuilder } from '../automation/dag-builder';
import type { AutomationIntent } from '../automation/intent-layer';

function makeIntent(overrides: Partial<AutomationIntent> = {}): AutomationIntent {
  return {
    intent: 'capture_new_lead',
    definitionOfDone: [
      { description: 'Contact exists', verification: { type: 'field_check', field: 'contactId', comparator: 'IS_NOT_EMPTY', value: '' } },
    ],
    acceptablePaths: ['create from email', 'link existing'],
    failureBoundary: { maxConsecutiveFailures: 3 },
    humanEscalationPolicy: { escalateOn: ['repeated_failure'], onTimeout: 'pause' },
    ...overrides,
  };
}

describe('planAutomation', () => {

  describe('basic planning', () => {
    it('returns valid plan for simple DAG with intent', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT', { email: '{{from}}' })
        .action('b', 'ADD_TAG_TO_CONTACT', { tagName: 'Lead' })
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({ dag, intent: makeIntent() });
      expect(plan.valid).toBe(true);
      expect(plan.intent).toBe('capture_new_lead');
      expect(plan.dag.actionNodeCount).toBe(2);
      expect(plan.completionChecks).toContain('Contact exists');
    });

    it('returns invalid plan for bad DAG', () => {
      const plan = planAutomation({
        dag: { entryNodeId: 'missing', nodes: [], edges: [] },
      });
      expect(plan.valid).toBe(false);
      expect(plan.validationErrors!.some(e => e.includes('DAG'))).toBe(true);
    });

    it('returns invalid plan for bad intent', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({
        dag,
        intent: makeIntent({ intent: '', definitionOfDone: [] }),
      });
      expect(plan.valid).toBe(false);
      expect(plan.validationErrors!.some(e => e.includes('Intent'))).toBe(true);
    });
  });

  describe('side effects analysis', () => {
    it('detects writes from CREATE/UPDATE actions', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .action('b', 'UPDATE_CLIENT')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({ dag });
      expect(plan.sideEffects.writes).toContain('contact');
      expect(plan.sideEffects.writes).toContain('client');
    });

    it('detects external calls from email/webhook', () => {
      const dag = dagBuilder('a')
        .action('a', 'SEND_EMAIL')
        .action('b', 'CALL_WEBHOOK')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({ dag });
      expect(plan.sideEffects.externalCalls).toContain('email_provider');
      expect(plan.sideEffects.externalCalls).toContain('webhook');
      expect(plan.sideEffects.irreversible).toBe(true);
    });

    it('marks irreversible when email is sent', () => {
      const dag = dagBuilder('a')
        .action('a', 'SEND_EMAIL')
        .terminal('done', 'success')
        .build();

      expect(planAutomation({ dag }).sideEffects.irreversible).toBe(true);
    });
  });

  describe('risk level', () => {
    it('returns low for safe actions', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .terminal('done', 'success')
        .build();

      expect(planAutomation({ dag }).riskLevel).toBe('low');
    });

    it('escalates to medium for email actions', () => {
      const dag = dagBuilder('a')
        .action('a', 'SEND_EMAIL')
        .terminal('done', 'success')
        .build();

      expect(planAutomation({ dag }).riskLevel).toBe('medium');
    });

    it('escalates to high for delete actions', () => {
      const dag = dagBuilder('a')
        .action('a', 'DELETE_CLIENT')
        .terminal('done', 'success')
        .build();

      expect(planAutomation({ dag }).riskLevel).toBe('high');
    });

    it('uses node-level risk override', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT', {}, { riskLevel: 'critical' })
        .terminal('done', 'success')
        .build();

      expect(planAutomation({ dag }).riskLevel).toBe('critical');
    });
  });

  describe('approval detection', () => {
    it('detects approval nodes', () => {
      const dag: any = dagBuilder('approve')
        .approval('approve', { label: 'Review lead', approverRole: 'admin', description: 'Review lead' })
        .terminal('done', 'success')
        .build();

      // Fix: approval node doesn't auto-connect to terminal with on_approval edge
      dag.edges = [{ id: 'e1', from: 'approve', to: 'done', type: 'on_approval' }];

      const plan = planAutomation({ dag });
      expect(plan.requiresApproval).toBe(true);
      expect(plan.approvalPoints).toContain('Review lead');
    });

    it('no approval when no approval nodes', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .terminal('done', 'success')
        .build();

      expect(planAutomation({ dag }).requiresApproval).toBe(false);
    });
  });

  describe('condition dry-run', () => {
    it('dry-runs conditions against trigger data', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({
        dag,
        triggerData: { from: 'test@example.com', subject: 'Suit inquiry' },
        conditions: [
          { field: 'from', comparator: 'IS_NOT_EMPTY', value: '' },
          { field: 'subject', comparator: 'CONTAINS', value: 'Suit' },
        ],
      });

      expect(plan.conditionResults?.wouldPass).toBe(true);
      expect(plan.conditionResults?.trace).toHaveLength(2);
    });

    it('shows failing conditions', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({
        dag,
        triggerData: { from: '' },
        conditions: [{ field: 'from', comparator: 'IS_NOT_EMPTY', value: '' }],
      });

      expect(plan.conditionResults?.wouldPass).toBe(false);
      expect(plan.conditionResults?.trace?.[0]).toContain('FAIL');
    });
  });

  describe('recovery strategy', () => {
    it('detects failure and fallback edges', () => {
      const dag = dagBuilder('a')
        .action('a', 'RISKY_ACTION', {}, { maxRetries: 2 })
        .terminal('done', 'success')
        .build();
      dag.nodes.push({ id: 'fallback', type: 'action', label: 'Fallback', action: { actionType: 'SAFE', config: {}, continueOnError: false } });
      dag.edges.push(
        { id: 'ef', from: 'a', to: 'fallback', type: 'on_failure' },
        { id: 'er', from: 'a', to: 'a', type: 'retry' },
        { id: 'efb', from: 'a', to: 'fallback', type: 'fallback' },
      );

      const plan = planAutomation({ dag });
      expect(plan.recoveryStrategy?.hasFailureEdges).toBe(true);
      expect(plan.recoveryStrategy?.hasRetryEdges).toBe(true);
      expect(plan.recoveryStrategy?.hasFallbackEdges).toBe(true);
      expect(plan.recoveryStrategy?.maxRetries).toBe(2);
    });
  });

  describe('policy evaluation', () => {
    it('runs policy evaluator when provided', () => {
      const dag = dagBuilder('a')
        .action('a', 'SEND_EMAIL')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({
        dag,
        policyContext: { trustTier: 0 },
        policyEvaluator: (job, ctx) => ({
          decision: (ctx.trustTier ?? 0) >= 1 ? 'allow' : 'deny',
          reason: 'Insufficient trust',
        }),
      });

      expect(plan.policyResult?.decision).toBe('deny');
    });
  });

  describe('hypermedia', () => {
    it('includes execute action for valid plan', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .terminal('done', 'success')
        .build();

      const plan = planAutomation({ dag });
      expect(plan._actions?.execute).toBeDefined();
      expect(plan._actions?.simulate).toBeDefined();
    });

    it('includes fix action for invalid plan', () => {
      const plan = planAutomation({
        dag: { entryNodeId: 'x', nodes: [], edges: [] },
      });
      expect(plan._actions?.fix).toBeDefined();
    });
  });
});
