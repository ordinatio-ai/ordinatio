// ===========================================
// Gap G4: Display Config Exhaustiveness Tests
// ===========================================
// Verifies every single one of the 64+ action
// types has correct, complete configuration.
// ===========================================

import { describe, it, expect } from 'vitest';
import { ACTIVITY_ACTIONS, type ActivityAction } from '../activity-actions';
import { ACTIVITY_CONFIG } from '../activity-display-config';
import {
  RESOLUTION_MAPPING,
  getActivityConfig,
  isActionSticky,
  getActionsToResolve,
  sortBySeverity,
} from '../activity-resolution';
import { SEVERITY_ORDER, type Severity } from '../types';

// ---- Helpers ----

const ALL_ACTIONS = Object.values(ACTIVITY_ACTIONS) as ActivityAction[];
const ALL_CONFIG_KEYS = Object.keys(ACTIVITY_CONFIG) as ActivityAction[];
const VALID_SEVERITIES: Severity[] = ['INFO', 'WARNING', 'ERROR', 'CRITICAL', 'SECURITY'];

/** Extract the domain prefix from an action string (e.g., 'order' from 'order.created'). */
function getDomain(action: string): string {
  return action.split('.')[0];
}

// ===========================================
// 1. Bijective coverage (actions <-> config)
// ===========================================

describe('display-config-exhaustive', () => {
  describe('bijective coverage', () => {
    it('every ACTIVITY_ACTIONS value has a config entry', () => {
      const missing: string[] = [];
      for (const action of ALL_ACTIONS) {
        if (!(action in ACTIVITY_CONFIG)) {
          missing.push(action);
        }
      }
      expect(missing).toEqual([]);
    });

    it('every ACTIVITY_CONFIG key is a valid action (no orphan configs)', () => {
      const actionSet = new Set<string>(ALL_ACTIONS);
      const orphans: string[] = [];
      for (const key of ALL_CONFIG_KEYS) {
        if (!actionSet.has(key)) {
          orphans.push(key);
        }
      }
      expect(orphans).toEqual([]);
    });

    it('action count matches config count', () => {
      expect(ALL_ACTIONS.length).toBe(ALL_CONFIG_KEYS.length);
    });
  });

  // ===========================================
  // 2. Structural validity of every config
  // ===========================================

  describe('structural validity', () => {
    it('all configs have non-empty label', () => {
      const failures: string[] = [];
      for (const action of ALL_ACTIONS) {
        const config = ACTIVITY_CONFIG[action];
        if (!config.label || config.label.trim().length === 0) {
          failures.push(action);
        }
      }
      expect(failures).toEqual([]);
    });

    it('all configs have valid severity', () => {
      const failures: string[] = [];
      for (const action of ALL_ACTIONS) {
        const config = ACTIVITY_CONFIG[action];
        if (!VALID_SEVERITIES.includes(config.severity)) {
          failures.push(`${action}: ${config.severity}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('all configs have non-empty icon', () => {
      const failures: string[] = [];
      for (const action of ALL_ACTIONS) {
        const config = ACTIVITY_CONFIG[action];
        if (!config.icon || config.icon.trim().length === 0) {
          failures.push(action);
        }
      }
      expect(failures).toEqual([]);
    });

    it('all configs have colorClass starting with text-', () => {
      const failures: string[] = [];
      for (const action of ALL_ACTIONS) {
        const config = ACTIVITY_CONFIG[action];
        if (!config.colorClass || !config.colorClass.startsWith('text-')) {
          failures.push(`${action}: ${config.colorClass}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('all configs have boolean requiresResolution', () => {
      const failures: string[] = [];
      for (const action of ALL_ACTIONS) {
        const config = ACTIVITY_CONFIG[action];
        if (typeof config.requiresResolution !== 'boolean') {
          failures.push(`${action}: ${typeof config.requiresResolution}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });

  // ===========================================
  // 3. Security action severity invariants
  // ===========================================

  describe('security action severity', () => {
    it('all security.auth.* actions have SECURITY severity', () => {
      const secAuthActions = ALL_ACTIONS.filter((a) => a.startsWith('security.auth.'));
      expect(secAuthActions.length).toBeGreaterThan(0);
      const failures: string[] = [];
      for (const action of secAuthActions) {
        if (ACTIVITY_CONFIG[action].severity !== 'SECURITY') {
          failures.push(`${action}: ${ACTIVITY_CONFIG[action].severity}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('all security.api.* actions have SECURITY severity', () => {
      const secApiActions = ALL_ACTIONS.filter((a) => a.startsWith('security.api.'));
      expect(secApiActions.length).toBeGreaterThan(0);
      const failures: string[] = [];
      for (const action of secApiActions) {
        if (ACTIVITY_CONFIG[action].severity !== 'SECURITY') {
          failures.push(`${action}: ${ACTIVITY_CONFIG[action].severity}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('all security.access.* actions have SECURITY severity', () => {
      const secAccessActions = ALL_ACTIONS.filter((a) => a.startsWith('security.access.'));
      expect(secAccessActions.length).toBeGreaterThan(0);
      for (const action of secAccessActions) {
        expect(ACTIVITY_CONFIG[action].severity).toBe('SECURITY');
      }
    });

    it('all security.data.* actions have SECURITY severity', () => {
      const secDataActions = ALL_ACTIONS.filter((a) => a.startsWith('security.data.'));
      expect(secDataActions.length).toBeGreaterThan(0);
      for (const action of secDataActions) {
        expect(ACTIVITY_CONFIG[action].severity).toBe('SECURITY');
      }
    });

    it('all security.system.* actions have SECURITY severity', () => {
      const secSysActions = ALL_ACTIONS.filter((a) => a.startsWith('security.system.'));
      expect(secSysActions.length).toBeGreaterThan(0);
      for (const action of secSysActions) {
        expect(ACTIVITY_CONFIG[action].severity).toBe('SECURITY');
      }
    });
  });

  // ===========================================
  // 4. Resolution / sticky invariants
  // ===========================================

  describe('resolution and sticky invariants', () => {
    it('placement.failed requires resolution', () => {
      expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.PLACEMENT_FAILED].requiresResolution).toBe(true);
    });

    it('placement.rejected requires resolution', () => {
      expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.PLACEMENT_REJECTED].requiresResolution).toBe(true);
    });

    it('automation.dead_letter requires resolution', () => {
      expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER].requiresResolution).toBe(true);
    });

    it('informational lifecycle actions do not require resolution', () => {
      const nonSticky: ActivityAction[] = [
        ACTIVITY_ACTIONS.ORDER_CREATED,
        ACTIVITY_ACTIONS.CLIENT_CREATED,
        ACTIVITY_ACTIONS.TASK_CREATED,
        ACTIVITY_ACTIONS.TASK_COMPLETED,
        ACTIVITY_ACTIONS.EMAIL_REPLIED,
        ACTIVITY_ACTIONS.EMAIL_ARCHIVED,
        ACTIVITY_ACTIONS.PLACEMENT_COMPLETED,
        ACTIVITY_ACTIONS.ORG_CREATED,
        ACTIVITY_ACTIONS.DATA_MIGRATION_COMPLETED,
      ];
      for (const action of nonSticky) {
        expect(
          ACTIVITY_CONFIG[action].requiresResolution,
          `${action} should not require resolution`,
        ).toBe(false);
      }
    });
  });

  // ===========================================
  // 5. Resolution mapping integrity
  // ===========================================

  describe('resolution mapping integrity', () => {
    it('every resolution mapping source exists in ACTIVITY_CONFIG', () => {
      const sources = Object.keys(RESOLUTION_MAPPING) as ActivityAction[];
      const missing: string[] = [];
      for (const src of sources) {
        if (!(src in ACTIVITY_CONFIG)) {
          missing.push(src);
        }
      }
      expect(missing).toEqual([]);
    });

    it('every resolution mapping target exists in ACTIVITY_CONFIG', () => {
      const missing: string[] = [];
      for (const [src, targets] of Object.entries(RESOLUTION_MAPPING)) {
        for (const target of targets as ActivityAction[]) {
          if (!(target in ACTIVITY_CONFIG)) {
            missing.push(`${src} -> ${target}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it('no action resolves itself', () => {
      const selfResolving: string[] = [];
      for (const [src, targets] of Object.entries(RESOLUTION_MAPPING)) {
        if ((targets as ActivityAction[]).includes(src as ActivityAction)) {
          selfResolving.push(src);
        }
      }
      expect(selfResolving).toEqual([]);
    });
  });

  // ===========================================
  // 6. SEVERITY_ORDER completeness & ordering
  // ===========================================

  describe('SEVERITY_ORDER', () => {
    it('covers all 5 severity levels', () => {
      for (const sev of VALID_SEVERITIES) {
        expect(sev in SEVERITY_ORDER).toBe(true);
      }
    });

    it('is strictly ordered: CRITICAL < SECURITY < ERROR < WARNING < INFO', () => {
      expect(SEVERITY_ORDER.CRITICAL).toBeLessThan(SEVERITY_ORDER.SECURITY);
      expect(SEVERITY_ORDER.SECURITY).toBeLessThan(SEVERITY_ORDER.ERROR);
      expect(SEVERITY_ORDER.ERROR).toBeLessThan(SEVERITY_ORDER.WARNING);
      expect(SEVERITY_ORDER.WARNING).toBeLessThan(SEVERITY_ORDER.INFO);
    });

    it('sortBySeverity produces correct order (CRITICAL first, INFO last)', () => {
      const items = [
        { severity: 'INFO' as Severity, id: 1 },
        { severity: 'CRITICAL' as Severity, id: 2 },
        { severity: 'WARNING' as Severity, id: 3 },
        { severity: 'SECURITY' as Severity, id: 4 },
        { severity: 'ERROR' as Severity, id: 5 },
      ];
      const sorted = sortBySeverity(items);
      expect(sorted.map((s) => s.severity)).toEqual([
        'CRITICAL',
        'SECURITY',
        'ERROR',
        'WARNING',
        'INFO',
      ]);
    });

    it('sortBySeverity does not mutate input', () => {
      const items = [
        { severity: 'INFO' as Severity },
        { severity: 'CRITICAL' as Severity },
      ];
      const copy = [...items];
      sortBySeverity(items);
      expect(items).toEqual(copy);
    });
  });

  // ===========================================
  // 7. Helper function behavior
  // ===========================================

  describe('helper functions', () => {
    it('getActivityConfig returns null for unknown action', () => {
      expect(getActivityConfig('bogus.nonexistent')).toBeNull();
      expect(getActivityConfig('')).toBeNull();
    });

    it('getActivityConfig returns correct config for known actions', () => {
      const config = getActivityConfig(ACTIVITY_ACTIONS.ORDER_CREATED);
      expect(config).not.toBeNull();
      expect(config!.label).toBe('Order Created');
      expect(config!.severity).toBe('INFO');
    });

    it('isActionSticky returns true for sticky actions', () => {
      expect(isActionSticky(ACTIVITY_ACTIONS.PLACEMENT_FAILED)).toBe(true);
      expect(isActionSticky(ACTIVITY_ACTIONS.PLACEMENT_REJECTED)).toBe(true);
      expect(isActionSticky(ACTIVITY_ACTIONS.EMAIL_SYNC_FAILED)).toBe(true);
      expect(isActionSticky(ACTIVITY_ACTIONS.SECURITY_AUTH_ACCOUNT_LOCKED)).toBe(true);
    });

    it('isActionSticky returns false for non-sticky actions', () => {
      expect(isActionSticky(ACTIVITY_ACTIONS.ORDER_CREATED)).toBe(false);
      expect(isActionSticky(ACTIVITY_ACTIONS.TASK_COMPLETED)).toBe(false);
      expect(isActionSticky(ACTIVITY_ACTIONS.EMAIL_ARCHIVED)).toBe(false);
    });

    it('isActionSticky returns false for unknown action', () => {
      expect(isActionSticky('bogus.unknown')).toBe(false);
    });

    it('getActionsToResolve returns empty array for non-resolving actions', () => {
      expect(getActionsToResolve(ACTIVITY_ACTIONS.ORDER_CREATED)).toEqual([]);
      expect(getActionsToResolve(ACTIVITY_ACTIONS.TASK_COMPLETED)).toEqual([]);
      expect(getActionsToResolve('bogus.action')).toEqual([]);
    });

    it('getActionsToResolve returns correct targets for resolving actions', () => {
      const targets = getActionsToResolve(ACTIVITY_ACTIONS.PLACEMENT_VERIFIED);
      expect(targets).toContain(ACTIVITY_ACTIONS.PLACEMENT_AWAITING_VERIFICATION);
    });
  });

  // ===========================================
  // 8. Label uniqueness
  // ===========================================

  describe('label uniqueness', () => {
    it('no two actions share the same label', () => {
      const labelToActions = new Map<string, string[]>();
      for (const action of ALL_ACTIONS) {
        const label = ACTIVITY_CONFIG[action].label;
        const existing = labelToActions.get(label) ?? [];
        existing.push(action);
        labelToActions.set(label, existing);
      }
      const duplicates: string[] = [];
      for (const [label, actions] of labelToActions) {
        if (actions.length > 1) {
          duplicates.push(`"${label}" -> [${actions.join(', ')}]`);
        }
      }
      // Pattern Detected appears on both automation.pattern_detected and agent.pattern_detected
      // — allow known domain-specific duplicates but flag new ones
      const knownDuplicateLabels = ['Pattern Detected'];
      const unexpected = duplicates.filter(
        (d) => !knownDuplicateLabels.some((kd) => d.startsWith(`"${kd}"`)),
      );
      expect(unexpected).toEqual([]);
    });
  });

  // ===========================================
  // 9. Domain consistency
  // ===========================================

  describe('domain consistency', () => {
    it('all order.* actions use INFO or WARNING severity (not SECURITY)', () => {
      const orderActions = ALL_ACTIONS.filter((a) => getDomain(a) === 'order');
      expect(orderActions.length).toBeGreaterThan(0);
      for (const action of orderActions) {
        const sev = ACTIVITY_CONFIG[action].severity;
        expect(
          ['INFO', 'WARNING'].includes(sev),
          `${action} has unexpected severity ${sev}`,
        ).toBe(true);
      }
    });

    it('all client.* actions use INFO severity', () => {
      const clientActions = ALL_ACTIONS.filter((a) => getDomain(a) === 'client');
      expect(clientActions.length).toBeGreaterThan(0);
      for (const action of clientActions) {
        expect(ACTIVITY_CONFIG[action].severity).toBe('INFO');
      }
    });

    it('all knowledge.* actions use INFO severity', () => {
      const knowledgeActions = ALL_ACTIONS.filter((a) => getDomain(a) === 'knowledge');
      expect(knowledgeActions.length).toBeGreaterThan(0);
      for (const action of knowledgeActions) {
        expect(ACTIVITY_CONFIG[action].severity).toBe('INFO');
      }
    });

    it('all oaem.* actions use INFO or WARNING severity', () => {
      const oaemActions = ALL_ACTIONS.filter((a) => getDomain(a) === 'oaem');
      expect(oaemActions.length).toBeGreaterThan(0);
      for (const action of oaemActions) {
        const sev = ACTIVITY_CONFIG[action].severity;
        expect(
          ['INFO', 'WARNING'].includes(sev),
          `${action} has unexpected severity ${sev}`,
        ).toBe(true);
      }
    });

    it('all commandbar.* actions use INFO severity', () => {
      const cbActions = ALL_ACTIONS.filter((a) => getDomain(a) === 'commandbar');
      expect(cbActions.length).toBeGreaterThan(0);
      for (const action of cbActions) {
        expect(ACTIVITY_CONFIG[action].severity).toBe('INFO');
      }
    });
  });

  // ===========================================
  // 10. Icon consistency within domains
  // ===========================================

  describe('icon consistency within domains', () => {
    it('task category actions all use the Tag icon', () => {
      const catActions: ActivityAction[] = [
        ACTIVITY_ACTIONS.TASK_CATEGORY_CREATED,
        ACTIVITY_ACTIONS.TASK_CATEGORY_UPDATED,
        ACTIVITY_ACTIONS.TASK_CATEGORY_DELETED,
      ];
      for (const action of catActions) {
        expect(ACTIVITY_CONFIG[action].icon).toBe('Tag');
      }
    });

    it('email template actions all use the FileText icon', () => {
      const templateActions: ActivityAction[] = [
        ACTIVITY_ACTIONS.EMAIL_TEMPLATE_CREATED,
        ACTIVITY_ACTIONS.EMAIL_TEMPLATE_UPDATED,
        ACTIVITY_ACTIONS.EMAIL_TEMPLATE_DELETED,
      ];
      for (const action of templateActions) {
        expect(ACTIVITY_CONFIG[action].icon).toBe('FileText');
      }
    });

    it('org lifecycle actions use Building2 for created/updated', () => {
      expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.ORG_CREATED].icon).toBe('Building2');
      expect(ACTIVITY_CONFIG[ACTIVITY_ACTIONS.ORG_UPDATED].icon).toBe('Building2');
    });

    it('failure actions have warning or error severity', () => {
      const failureActions = ALL_ACTIONS.filter(
        (a) => a.endsWith('.failed') || a.endsWith('_failed') || a === ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER,
      );
      expect(failureActions.length).toBeGreaterThan(0);
      for (const action of failureActions) {
        const severity = ACTIVITY_CONFIG[action].severity;
        expect(
          ['WARNING', 'ERROR', 'CRITICAL', 'SECURITY'].includes(severity),
          `${action} has severity "${severity}" — failure actions should be WARNING or higher`,
        ).toBe(true);
      }
    });
  });

  // ===========================================
  // 11. Quantitative sanity checks
  // ===========================================

  describe('quantitative sanity', () => {
    it('has at least 64 action types defined', () => {
      expect(ALL_ACTIONS.length).toBeGreaterThanOrEqual(64);
    });

    it('every action string contains a dot separator', () => {
      for (const action of ALL_ACTIONS) {
        expect(action).toContain('.');
      }
    });

    it('no action string contains whitespace', () => {
      for (const action of ALL_ACTIONS) {
        expect(action).not.toMatch(/\s/);
      }
    });
  });
});
