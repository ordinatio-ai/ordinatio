// IHS
import { describe, it, expect } from 'vitest';
import {
  createModuleRegistry,
  createModuleRegistryFromCovenants,
  registerModule,
  deregisterModule,
  lookupModule,
  getCapabilitiesForModule,
  findCapabilityOwner,
  findConflicts,
  getAllModules,
  getModuleCount,
} from './module-registry';
import type { ModuleCovenant } from '../covenant/types';
import type { AdmissionDecision } from './types';
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
// Helper
// ---------------------------------------------------------------------------

const ALL_COVENANTS: readonly ModuleCovenant[] = [
  EMAIL_ENGINE_COVENANT, ENTITY_REGISTRY_COVENANT, AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT, WORKFLOW_ENGINE_COVENANT, AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT, SECURITY_ENGINE_COVENANT, AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT, AGENT_ENGINE_COVENANT, JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT, COMMERCE_ENGINE_COVENANT, KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT, INVENTORY_ENGINE_COVENANT,
];

function makeTestCovenant(id = 'test-module'): ModuleCovenant {
  return {
    identity: {
      id,
      canonicalId: 'L-99',
      version: '0.1.0',
      description: 'A test module for registry testing purposes',
      status: 'local',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'TestRegistryEntity', description: 'A test entity', hasContextLayer: false }],
      events: [{ id: `${id}.created`, description: 'Created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: `${id}.read`,
        description: 'Read test registry data',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read test registry data.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Data integrity holds'],
      neverHappens: ['Corruption occurs'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
  };
}

function makeDecision(moduleId: string): AdmissionDecision {
  return {
    moduleId,
    moduleStatus: 'local',
    verdict: 'admitted',
    gates: [],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    decidedAt: new Date(),
    durationMs: 0,
    rejectionReasons: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Module Registry', () => {
  describe('createModuleRegistry', () => {
    it('creates an empty registry', () => {
      const reg = createModuleRegistry();
      expect(getModuleCount(reg)).toBe(0);
      expect(getAllModules(reg)).toHaveLength(0);
    });
  });

  describe('createModuleRegistryFromCovenants', () => {
    it('bootstraps from all 17 covenants', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      expect(getModuleCount(reg)).toBe(17);
    });

    it('indexes all capabilities from 17 covenants', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      // entity-registry has entity.search
      expect(findCapabilityOwner(reg, 'entity.search')).toBe('entity-registry');
    });

    it('indexes all events from covenants', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      // entity-registry emits entity.created
      const entry = lookupModule(reg, 'entity-registry');
      expect(entry?.eventIds).toContain('entity.created');
    });
  });

  describe('registerModule / deregisterModule', () => {
    it('registers a module and increases count', () => {
      const reg = createModuleRegistry();
      const cov = makeTestCovenant();
      const updated = registerModule(reg, cov, makeDecision('test-module'));
      expect(getModuleCount(updated)).toBe(1);
      expect(getModuleCount(reg)).toBe(0); // original unchanged
    });

    it('deregisters a module and decreases count', () => {
      const reg = createModuleRegistry();
      const cov = makeTestCovenant();
      const registered = registerModule(reg, cov, makeDecision('test-module'));
      const deregistered = deregisterModule(registered, 'test-module');
      expect(getModuleCount(deregistered)).toBe(0);
      expect(getModuleCount(registered)).toBe(1); // original unchanged
    });

    it('deregister of non-existent module returns same structure', () => {
      const reg = createModuleRegistry();
      const result = deregisterModule(reg, 'nonexistent');
      expect(getModuleCount(result)).toBe(0);
    });
  });

  describe('lookupModule', () => {
    it('finds a registered module', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      const entry = lookupModule(reg, 'email-engine');
      expect(entry).toBeDefined();
      expect(entry!.covenant.identity.id).toBe('email-engine');
    });

    it('returns undefined for unknown module', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      expect(lookupModule(reg, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getCapabilitiesForModule', () => {
    it('returns capabilities for a registered module', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      const caps = getCapabilitiesForModule(reg, 'entity-registry');
      expect(caps.length).toBeGreaterThan(0);
      expect(caps).toContain('entity.search');
    });

    it('returns empty array for unknown module', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      expect(getCapabilitiesForModule(reg, 'nonexistent')).toHaveLength(0);
    });
  });

  describe('findCapabilityOwner', () => {
    it('finds owner of a known capability', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      expect(findCapabilityOwner(reg, 'entity.search')).toBe('entity-registry');
    });

    it('returns undefined for unknown capability', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      expect(findCapabilityOwner(reg, 'nonexistent.action')).toBeUndefined();
    });
  });

  describe('findConflicts', () => {
    it('detects duplicate capability', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      const cov = makeTestCovenant('conflict');
      const conflicting: ModuleCovenant = {
        ...cov,
        capabilities: [{
          id: 'entity.search', // exists in entity-registry
          description: 'Conflicting capability for testing',
          type: 'query',
          risk: 'observe',
          dataSensitivity: 'none',
          inputs: [],
          output: '{ data: object }',
          whenToUse: 'Testing conflict detection in registry.',
        }],
      };
      const issues = findConflicts(reg, conflicting);
      expect(issues.some(i => i.severity === 'error' && i.message.includes('entity.search'))).toBe(true);
    });

    it('detects duplicate event', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      const cov = makeTestCovenant('conflict');
      const conflicting: ModuleCovenant = {
        ...cov,
        domain: {
          ...cov.domain,
          events: [{ id: 'entity.created', description: 'Dup', payloadShape: '{ id: string }' }],
        },
      };
      const issues = findConflicts(reg, conflicting);
      expect(issues.some(i => i.severity === 'error' && i.message.includes('entity.created'))).toBe(true);
    });

    it('reports no conflicts for clean module', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      const clean = makeTestCovenant('clean-no-conflict');
      const issues = findConflicts(reg, clean);
      expect(issues.filter(i => i.severity === 'error')).toHaveLength(0);
    });
  });

  describe('immutability', () => {
    it('register does not mutate original', () => {
      const reg = createModuleRegistry();
      const cov = makeTestCovenant();
      const _updated = registerModule(reg, cov, makeDecision('test-module'));
      expect(getModuleCount(reg)).toBe(0); // unchanged
    });

    it('deregister does not mutate original', () => {
      const cov = makeTestCovenant();
      const reg = registerModule(createModuleRegistry(), cov, makeDecision('test-module'));
      const _removed = deregisterModule(reg, 'test-module');
      expect(getModuleCount(reg)).toBe(1); // unchanged
    });
  });

  describe('getAllModules', () => {
    it('returns all entries', () => {
      const reg = createModuleRegistryFromCovenants(ALL_COVENANTS);
      const all = getAllModules(reg);
      expect(all).toHaveLength(17);
    });
  });
});
