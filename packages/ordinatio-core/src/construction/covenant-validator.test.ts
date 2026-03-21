// IHS
import { describe, it, expect } from 'vitest';
import { validateCovenant, validateAllCovenants } from './covenant-validator';
import type { ModuleCovenant } from '../covenant/types';

import {
  EMAIL_ENGINE_COVENANT,
  ENTITY_REGISTRY_COVENANT,
  AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT,
  WORKFLOW_ENGINE_COVENANT,
  AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT,
  SECURITY_ENGINE_COVENANT,
  AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT,
  AGENT_ENGINE_COVENANT,
  JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT,
  COMMERCE_ENGINE_COVENANT,
  KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT,
  INVENTORY_ENGINE_COVENANT,
} from '../covenants';

// ---------------------------------------------------------------------------
// Helper: minimal valid covenant for mutation tests
// ---------------------------------------------------------------------------

function makeValidCovenant(overrides: Partial<ModuleCovenant> = {}): ModuleCovenant {
  return {
    identity: {
      id: 'test-module',
      canonicalId: 'X-01',
      version: '0.1.0',
      description: 'A test module for validation purposes',
      status: 'experimental',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestEntity', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: 'test.created', description: 'Entity created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: 'test.read',
        description: 'Read test data',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read test data from the system.',
      },
      {
        id: 'test.write',
        description: 'Write test data',
        type: 'mutation',
        risk: 'act',
        dataSensitivity: 'internal',
        inputs: [{ name: 'data', type: 'object', required: true, description: 'Data to write' }],
        output: '{ success: boolean }',
        whenToUse: 'When you need to persist test data.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Test data is always consistent'],
      neverHappens: ['Data corruption never occurs'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// All 17 existing covenants pass validation
// ---------------------------------------------------------------------------

const ALL_COVENANTS: readonly ModuleCovenant[] = [
  EMAIL_ENGINE_COVENANT,
  ENTITY_REGISTRY_COVENANT,
  AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT,
  WORKFLOW_ENGINE_COVENANT,
  AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT,
  SECURITY_ENGINE_COVENANT,
  AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT,
  AGENT_ENGINE_COVENANT,
  JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT,
  COMMERCE_ENGINE_COVENANT,
  KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT,
  INVENTORY_ENGINE_COVENANT,
];

describe('Covenant Validator', () => {
  describe('validates all 17 existing covenants', () => {
    it.each(ALL_COVENANTS.map(c => [c.identity.id, c]))(
      '%s passes with zero errors',
      (_id, covenant) => {
        const result = validateCovenant(covenant as ModuleCovenant);
        expect(result.valid).toBe(true);
        expect(result.errorCount).toBe(0);
      },
    );
  });

  describe('validateAllCovenants', () => {
    it('validates all 17 covenants with cross-referencing', () => {
      const results = validateAllCovenants(ALL_COVENANTS);
      expect(results).toHaveLength(17);
      for (const result of results) {
        expect(result.valid).toBe(true);
        expect(result.errorCount).toBe(0);
      }
    });
  });

  describe('identity checks', () => {
    it('rejects empty id', () => {
      const c = makeValidCovenant({ identity: { ...makeValidCovenant().identity, id: '' } });
      const result = validateCovenant(c);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.path === 'identity.id')).toBe(true);
    });

    it('rejects non-kebab-case id', () => {
      const c = makeValidCovenant({ identity: { ...makeValidCovenant().identity, id: 'TestModule' } });
      const result = validateCovenant(c);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.path === 'identity.id')).toBe(true);
    });

    it('rejects invalid canonicalId', () => {
      const c = makeValidCovenant({ identity: { ...makeValidCovenant().identity, canonicalId: 'Z-99' } });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'identity.canonicalId')).toBe(true);
    });

    it('rejects invalid version', () => {
      const c = makeValidCovenant({ identity: { ...makeValidCovenant().identity, version: 'v1' } });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'identity.version')).toBe(true);
    });

    it('rejects missing dedication', () => {
      const c = makeValidCovenant({
        identity: { ...makeValidCovenant().identity, dedication: 'NONE' as 'IHS' },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'identity.dedication')).toBe(true);
    });
  });

  describe('domain checks', () => {
    it('warns on empty entities', () => {
      const c = makeValidCovenant({
        domain: { entities: [], events: [], subscriptions: [] },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'domain.entities' && i.severity === 'warning')).toBe(true);
    });

    it('warns on non-PascalCase entity name', () => {
      const c = makeValidCovenant({
        domain: {
          entities: [{ name: 'lowercaseEntity', description: 'Bad name', hasContextLayer: false }],
          events: [],
          subscriptions: [],
        },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path.includes('entities') && i.message.includes('PascalCase'))).toBe(true);
    });

    it('rejects duplicate event IDs', () => {
      const c = makeValidCovenant({
        domain: {
          entities: [{ name: 'TestEntity', description: 'Test', hasContextLayer: false }],
          events: [
            { id: 'test.created', description: 'Created', payloadShape: '{}' },
            { id: 'test.created', description: 'Duplicate', payloadShape: '{}' },
          ],
          subscriptions: [],
        },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.message.includes('Duplicate event'))).toBe(true);
    });
  });

  describe('capability checks', () => {
    it('rejects empty capabilities', () => {
      const c = makeValidCovenant({ capabilities: [] });
      const result = validateCovenant(c);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.path === 'capabilities')).toBe(true);
    });

    it('rejects duplicate capability IDs', () => {
      const base = makeValidCovenant();
      const c = makeValidCovenant({
        capabilities: [base.capabilities[0], base.capabilities[0]],
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.message.includes('Duplicate capability'))).toBe(true);
    });

    it('rejects invalid capability ID format', () => {
      const c = makeValidCovenant({
        capabilities: [{
          ...makeValidCovenant().capabilities[0],
          id: 'no-dots-here',
        }],
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path.includes('capabilities') && i.message.includes('pattern'))).toBe(true);
    });

    it('info when capabilities span only one risk level', () => {
      const base = makeValidCovenant();
      const c = makeValidCovenant({
        capabilities: [
          { ...base.capabilities[0], id: 'test.read_a', risk: 'observe' },
          { ...base.capabilities[0], id: 'test.read_b', risk: 'observe' },
        ],
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.severity === 'info' && i.message.includes('risk levels'))).toBe(true);
    });
  });

  describe('dependency checks', () => {
    it('rejects self-dependency', () => {
      const c = makeValidCovenant({
        dependencies: [{ moduleId: 'test-module', required: true, capabilities: ['test.read'] }],
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.message.includes('depend on itself'))).toBe(true);
    });

    it('warns on unknown dependency when knownModuleIds provided', () => {
      const c = makeValidCovenant({
        dependencies: [{ moduleId: 'nonexistent-module', required: true, capabilities: ['foo.bar'] }],
      });
      const result = validateCovenant(c, ['test-module', 'other-module']);
      expect(result.issues.some(i => i.message.includes('Unknown module'))).toBe(true);
    });
  });

  describe('invariant checks', () => {
    it('rejects empty alwaysTrue', () => {
      const c = makeValidCovenant({
        invariants: { alwaysTrue: [], neverHappens: ['Never fails'] },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'invariants.alwaysTrue')).toBe(true);
    });

    it('rejects empty neverHappens', () => {
      const c = makeValidCovenant({
        invariants: { alwaysTrue: ['Always true'], neverHappens: [] },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'invariants.neverHappens')).toBe(true);
    });

    it('rejects empty string invariants', () => {
      const c = makeValidCovenant({
        invariants: { alwaysTrue: ['Valid', ''], neverHappens: ['Valid'] },
      });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.message.includes('Empty invariant'))).toBe(true);
    });
  });

  describe('health check', () => {
    it('rejects non-function healthCheck', () => {
      const c = makeValidCovenant({ healthCheck: 'not a function' as unknown as ModuleCovenant['healthCheck'] });
      const result = validateCovenant(c);
      expect(result.issues.some(i => i.path === 'healthCheck')).toBe(true);
    });
  });

  describe('valid covenant passes cleanly', () => {
    it('returns valid with zero issues for a well-formed covenant', () => {
      const result = validateCovenant(makeValidCovenant());
      expect(result.valid).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.moduleId).toBe('test-module');
    });
  });
});
