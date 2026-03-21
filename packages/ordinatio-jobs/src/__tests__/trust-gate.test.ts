import { describe, it, expect } from 'vitest';
import { checkAutomationTrust, getMaxRiskLevel, DEFAULT_TRUST_POLICY } from '../automation/trust-gate';
import { dagBuilder } from '../automation/dag-builder';
import type { AutomationDag } from '../automation/dag-types';

describe('Trust Gate', () => {
  describe('checkAutomationTrust', () => {
    it('allows low-risk DAG at trust tier 0', () => {
      const dag = dagBuilder('a').action('a', 'CREATE_CONTACT').terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 0);
      expect(result.allowed).toBe(true);
      expect(result.blockedActions).toHaveLength(0);
    });

    it('blocks high-risk action at trust tier 0', () => {
      const dag = dagBuilder('a').action('a', 'DELETE_CLIENT', {}, { riskLevel: 'high' }).terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 0);
      expect(result.allowed).toBe(false);
      expect(result.blockedActions.length).toBeGreaterThan(0);
      expect(result.requiredTier).toBe(1);
    });

    it('allows high-risk action at trust tier 1', () => {
      const dag = dagBuilder('a').action('a', 'DELETE_CLIENT', {}, { riskLevel: 'high' }).terminal('done', 'success').build();
      expect(checkAutomationTrust(dag, 1).allowed).toBe(true);
    });

    it('blocks critical action at trust tier 1', () => {
      const dag = dagBuilder('a').action('a', 'NUCLEAR_OPTION', {}, { riskLevel: 'critical' }).terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 1);
      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe(2);
    });

    it('allows critical action at trust tier 2', () => {
      const dag = dagBuilder('a').action('a', 'NUCLEAR_OPTION', {}, { riskLevel: 'critical' }).terminal('done', 'success').build();
      expect(checkAutomationTrust(dag, 2).allowed).toBe(true);
    });

    it('requires approval for critical actions regardless of trust', () => {
      const dag = dagBuilder('a').action('a', 'THING', {}, { riskLevel: 'critical' }).terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 2);
      expect(result.approvalRequired).toBe(true);
    });

    it('requires approval for approval nodes', () => {
      const dag: AutomationDag = {
        entryNodeId: 'approve',
        nodes: [
          { id: 'approve', type: 'approval', label: 'Review', approval: { approverRole: 'admin' } },
          { id: 'done', type: 'terminal', label: 'Done', terminal: { outcome: 'success' } },
        ],
        edges: [{ id: 'e1', from: 'approve', to: 'done', type: 'on_approval' }],
      };
      expect(checkAutomationTrust(dag, 2).approvalRequired).toBe(true);
    });

    it('infers risk from action type when not explicitly set', () => {
      const dag = dagBuilder('a').action('a', 'DELETE_CLIENT').terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 0);
      expect(result.allowed).toBe(false); // DELETE inferred as high
    });

    it('infers medium risk for email actions', () => {
      const dag = dagBuilder('a').action('a', 'SEND_EMAIL').terminal('done', 'success').build();
      expect(checkAutomationTrust(dag, 0).allowed).toBe(true); // medium needs tier 0
    });

    it('supports custom trust policy', () => {
      const strictPolicy = { low: 1, medium: 1, high: 2, critical: 2 };
      const dag = dagBuilder('a').action('a', 'CREATE_CONTACT').terminal('done', 'success').build();
      expect(checkAutomationTrust(dag, 0, strictPolicy).allowed).toBe(false); // low needs tier 1
      expect(checkAutomationTrust(dag, 1, strictPolicy).allowed).toBe(true);
    });

    it('includes hypermedia actions when blocked', () => {
      const dag = dagBuilder('a').action('a', 'X', {}, { riskLevel: 'critical' }).terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 0);
      expect(result._actions?.escalate).toBeDefined();
      expect(result._actions?.request_approval).toBeDefined();
    });

    it('includes execute action when allowed and no approval needed', () => {
      const dag = dagBuilder('a').action('a', 'CREATE_CONTACT').terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 2);
      expect(result._actions?.execute).toBeDefined();
    });

    it('provides denial reason', () => {
      const dag = dagBuilder('a').action('a', 'X', {}, { riskLevel: 'critical' }).terminal('done', 'success').build();
      const result = checkAutomationTrust(dag, 0);
      expect(result.reason).toContain('insufficient');
    });
  });

  describe('getMaxRiskLevel', () => {
    it('returns low for safe DAG', () => {
      const dag = dagBuilder('a').action('a', 'CREATE_CONTACT').terminal('done', 'success').build();
      expect(getMaxRiskLevel(dag)).toBe('low');
    });

    it('returns highest risk across all nodes', () => {
      const dag = dagBuilder('a')
        .action('a', 'CREATE_CONTACT')
        .action('b', 'SEND_EMAIL')
        .action('c', 'X', {}, { riskLevel: 'critical' })
        .terminal('done', 'success')
        .build();
      expect(getMaxRiskLevel(dag)).toBe('critical');
    });
  });
});
