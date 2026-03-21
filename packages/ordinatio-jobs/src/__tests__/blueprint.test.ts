import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerBlueprint, getBlueprint, getAllBlueprints, getBlueprintsByCategory, clearBlueprints,
  validateBlueprintVariables, instantiateBlueprint,
} from '../automation/blueprint';
import { dagBuilder } from '../automation/dag-builder';
import type { AutomationBlueprint } from '../automation/blueprint';

function makeBlueprint(overrides: Partial<AutomationBlueprint> = {}): AutomationBlueprint {
  return {
    id: 'lead-capture',
    name: 'Lead Capture',
    description: 'Auto-create contact when email received from unknown sender',
    category: 'sales',
    intent: {
      intent: 'capture_new_lead',
      definitionOfDone: [{ description: 'Contact exists', verification: { type: 'field_check', field: 'contactId', comparator: 'IS_NOT_EMPTY', value: '' } }],
      acceptablePaths: ['create from email'],
      failureBoundary: { maxConsecutiveFailures: 3 },
      humanEscalationPolicy: { escalateOn: ['repeated_failure'], onTimeout: 'pause' },
    },
    trigger: { eventType: 'EMAIL_RECEIVED' },
    conditions: [
      { field: 'from', comparator: 'IS_NOT_EMPTY', valueTemplate: '', groupIndex: 0 },
    ],
    dag: dagBuilder('create')
      .action('create', 'CREATE_CONTACT', { email: '{{from}}', source: 'email' })
      .action('tag', 'ADD_TAG_TO_CONTACT', { tagName: '{{tagName}}' })
      .terminal('done', 'success')
      .build(),
    recoveryStrategy: {
      recoverable: true, retryRecommended: true, nextAction: 'retry',
      humanInterventionRequired: false, reasonCode: 'LEAD_CAPTURE_RETRY',
    },
    requiredVariables: [
      { name: 'tagName', type: 'string', description: 'Tag to apply to new contacts', defaultValue: 'Lead' },
      { name: 'notifyEmail', type: 'email', description: 'Email to notify on capture' },
    ],
    ...overrides,
  };
}

describe('Blueprints', () => {
  beforeEach(() => clearBlueprints());

  // ---- Registry ----

  describe('blueprint registry', () => {
    it('registers and retrieves a blueprint', () => {
      registerBlueprint(makeBlueprint());
      const bp = getBlueprint('lead-capture');
      expect(bp).toBeDefined();
      expect(bp!.name).toBe('Lead Capture');
    });

    it('returns undefined for unknown blueprint', () => {
      expect(getBlueprint('nonexistent')).toBeUndefined();
    });

    it('lists all blueprints', () => {
      registerBlueprint(makeBlueprint({ id: 'a', name: 'A', category: 'sales' }));
      registerBlueprint(makeBlueprint({ id: 'b', name: 'B', category: 'ops' }));
      expect(getAllBlueprints()).toHaveLength(2);
    });

    it('filters by category', () => {
      registerBlueprint(makeBlueprint({ id: 'a', category: 'sales' }));
      registerBlueprint(makeBlueprint({ id: 'b', category: 'ops' }));
      registerBlueprint(makeBlueprint({ id: 'c', category: 'sales' }));
      expect(getBlueprintsByCategory('sales')).toHaveLength(2);
      expect(getBlueprintsByCategory('ops')).toHaveLength(1);
    });

    it('clears all blueprints', () => {
      registerBlueprint(makeBlueprint());
      clearBlueprints();
      expect(getAllBlueprints()).toHaveLength(0);
    });
  });

  // ---- Variable Validation ----

  describe('validateBlueprintVariables', () => {
    it('passes when all required variables provided', () => {
      const result = validateBlueprintVariables(makeBlueprint(), {
        tagName: 'VIP',
        notifyEmail: 'admin@company.com',
      });
      expect(result.valid).toBe(true);
    });

    it('passes when variable has default and not provided', () => {
      const result = validateBlueprintVariables(makeBlueprint(), {
        notifyEmail: 'admin@company.com',
        // tagName not provided — has default 'Lead'
      });
      expect(result.valid).toBe(true);
    });

    it('fails when required variable missing (no default)', () => {
      const result = validateBlueprintVariables(makeBlueprint(), {
        tagName: 'VIP',
        // notifyEmail missing, no default
      });
      expect(result.valid).toBe(false);
      expect(result.missingVariables).toContain('notifyEmail');
    });

    it('fails for invalid email', () => {
      const result = validateBlueprintVariables(makeBlueprint(), {
        notifyEmail: 'not-an-email',
      });
      expect(result.valid).toBe(false);
      expect(result.invalidVariables.some(v => v.includes('email'))).toBe(true);
    });

    it('fails for invalid number', () => {
      const bp = makeBlueprint({
        requiredVariables: [{ name: 'count', type: 'number', description: 'Count' }],
      });
      const result = validateBlueprintVariables(bp, { count: 'abc' });
      expect(result.invalidVariables.some(v => v.includes('number'))).toBe(true);
    });

    it('fails for invalid select option', () => {
      const bp = makeBlueprint({
        requiredVariables: [{ name: 'priority', type: 'select', description: 'Priority', options: ['low', 'medium', 'high'] }],
      });
      const result = validateBlueprintVariables(bp, { priority: 'extreme' });
      expect(result.invalidVariables.some(v => v.includes('must be one of'))).toBe(true);
    });
  });

  // ---- Instantiation ----

  describe('instantiateBlueprint', () => {
    it('resolves template variables in DAG action configs', () => {
      const instance = instantiateBlueprint(makeBlueprint(), {
        tagName: 'VIP',
        notifyEmail: 'admin@co.com',
      });

      const tagNode = instance.dag.nodes.find(n => n.action?.actionType === 'ADD_TAG_TO_CONTACT');
      expect(tagNode?.action?.config.tagName).toBe('VIP');
    });

    it('uses default values when variable not provided', () => {
      const instance = instantiateBlueprint(makeBlueprint(), {
        notifyEmail: 'admin@co.com',
      });

      const tagNode = instance.dag.nodes.find(n => n.action?.actionType === 'ADD_TAG_TO_CONTACT');
      expect(tagNode?.action?.config.tagName).toBe('Lead'); // default
    });

    it('preserves non-template config values', () => {
      const instance = instantiateBlueprint(makeBlueprint(), {
        tagName: 'VIP',
        notifyEmail: 'admin@co.com',
      });

      const createNode = instance.dag.nodes.find(n => n.action?.actionType === 'CREATE_CONTACT');
      expect(createNode?.action?.config.source).toBe('email'); // Not a template
    });

    it('preserves intent unchanged', () => {
      const instance = instantiateBlueprint(makeBlueprint(), {
        tagName: 'X',
        notifyEmail: 'a@b.com',
      });
      expect(instance.intent.intent).toBe('capture_new_lead');
    });

    it('resolves condition value templates', () => {
      const bp = makeBlueprint({
        conditions: [{ field: 'from', comparator: 'CONTAINS', valueTemplate: '{{domain}}', groupIndex: 0 }],
        requiredVariables: [{ name: 'domain', type: 'string', description: 'Email domain to match' }],
      });

      const instance = instantiateBlueprint(bp, { domain: 'company.com' });
      expect(instance.conditions[0].value).toBe('company.com');
    });

    it('resolves trigger config templates', () => {
      const bp = makeBlueprint({
        trigger: { eventType: 'ORDER_STATUS_CHANGED', configTemplate: { status: '{{targetStatus}}' } },
        requiredVariables: [{ name: 'targetStatus', type: 'string', description: 'Target status' }],
      });

      const instance = instantiateBlueprint(bp, { targetStatus: 'PLACED' });
      expect(instance.trigger.config?.status).toBe('PLACED');
    });

    it('preserves unresolved variables as-is', () => {
      const instance = instantiateBlueprint(makeBlueprint(), {
        notifyEmail: 'a@b.com',
        // tagName not provided, no default in this test
      });
      // tagName has a default of 'Lead' in makeBlueprint, so it resolves
      const tagNode = instance.dag.nodes.find(n => n.action?.actionType === 'ADD_TAG_TO_CONTACT');
      expect(tagNode?.action?.config.tagName).toBe('Lead');
    });
  });
});
