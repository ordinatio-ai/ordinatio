// IHS
import { describe, it, expect } from 'vitest';
import { runConflictGate } from './conflict-gate';
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
// Helper
// ---------------------------------------------------------------------------

function makeCleanCovenant(overrides: Partial<ModuleCovenant> = {}): ModuleCovenant {
  return {
    identity: {
      id: 'new-clean-module',
      canonicalId: 'L-99',
      version: '0.1.0',
      description: 'A clean module with no conflicts to existing covenants',
      status: 'local',
      tier: 'being',
      dedication: 'IHS',
    },
    domain: {
      entities: [{ name: 'UniqueNewEntity', description: 'Unique entity', hasContextLayer: false }],
      events: [{ id: 'newclean.created', description: 'Entity created', payloadShape: '{ id: string }' }],
      subscriptions: [],
    },
    capabilities: [
      {
        id: 'newclean.read',
        description: 'Read new data from the clean module',
        type: 'query',
        risk: 'observe',
        dataSensitivity: 'none',
        inputs: [],
        output: '{ data: object }',
        whenToUse: 'When you need to read from the clean module.',
      },
      {
        id: 'newclean.write',
        description: 'Write new data to the clean module',
        type: 'mutation',
        risk: 'act',
        dataSensitivity: 'internal',
        inputs: [{ name: 'data', type: 'object', required: true, description: 'Data to write' }],
        output: '{ success: boolean }',
        whenToUse: 'When you need to write to the clean module.',
      },
    ],
    dependencies: [],
    invariants: {
      alwaysTrue: ['Data integrity is maintained'],
      neverHappens: ['Data corruption occurs'],
    },
    healthCheck: async () => ({ healthy: true, message: 'OK', checkedAt: new Date() }),
    ...overrides,
  };
}

const ALL_COVENANTS: readonly ModuleCovenant[] = [
  EMAIL_ENGINE_COVENANT, ENTITY_REGISTRY_COVENANT, AUTH_ENGINE_COVENANT,
  TASK_ENGINE_COVENANT, WORKFLOW_ENGINE_COVENANT, AUTOMATION_FABRIC_COVENANT,
  SETTINGS_ENGINE_COVENANT, SECURITY_ENGINE_COVENANT, AUDIT_LEDGER_COVENANT,
  SEARCH_ENGINE_COVENANT, AGENT_ENGINE_COVENANT, JOB_ENGINE_COVENANT,
  FINANCE_ENGINE_COVENANT, COMMERCE_ENGINE_COVENANT, KNOWLEDGE_ENGINE_COVENANT,
  REPORTING_ENGINE_COVENANT, INVENTORY_ENGINE_COVENANT,
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conflict Gate', () => {
  it('clean module vs 17 existing covenants passes', () => {
    const result = runConflictGate(makeCleanCovenant(), ALL_COVENANTS);
    expect(result.gate).toBe('conflict');
    expect(result.verdict).toBe('pass');
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('detects duplicate capability ID', () => {
    // Use a capability ID from entity-registry
    const cov = makeCleanCovenant({
      capabilities: [
        {
          id: 'entity.search', // Exists in ENTITY_REGISTRY_COVENANT
          description: 'Duplicate capability test for conflict detection',
          type: 'query',
          risk: 'observe',
          dataSensitivity: 'none',
          inputs: [],
          output: '{ data: object }',
          whenToUse: 'When you need to test duplicate capability detection.',
        },
      ],
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('entity.search'),
        }),
      ]),
    );
  });

  it('detects duplicate event ID', () => {
    // Use an event from entity-registry
    const cov = makeCleanCovenant({
      domain: {
        entities: [{ name: 'UniqueNewEntity', description: 'Unique', hasContextLayer: false }],
        events: [{ id: 'entity.created', description: 'Duplicate event', payloadShape: '{ id: string }' }],
        subscriptions: [],
      },
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('entity.created'),
        }),
      ]),
    );
  });

  it('warns on entity name collision', () => {
    const cov = makeCleanCovenant({
      domain: {
        entities: [{ name: 'Entity', description: 'Collides with entity-registry', hasContextLayer: false }],
        events: [{ id: 'newclean.created', description: 'Created', payloadShape: '{ id: string }' }],
        subscriptions: [],
      },
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('Entity'),
        }),
      ]),
    );
  });

  it('warns on dangling subscription', () => {
    const cov = makeCleanCovenant({
      domain: {
        entities: [{ name: 'UniqueNewEntity', description: 'Unique', hasContextLayer: false }],
        events: [{ id: 'newclean.created', description: 'Created', payloadShape: '{ id: string }' }],
        subscriptions: ['nonexistent.event_that_nobody_emits'],
      },
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('nonexistent.event_that_nobody_emits'),
        }),
      ]),
    );
  });

  it('does not warn on subscriptions to own events', () => {
    const cov = makeCleanCovenant({
      domain: {
        entities: [{ name: 'UniqueNewEntity', description: 'Unique', hasContextLayer: false }],
        events: [{ id: 'newclean.created', description: 'Created', payloadShape: '{ id: string }' }],
        subscriptions: ['newclean.created'], // subscribing to own event
      },
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    const subIssues = result.issues.filter(i => i.message.includes('newclean.created'));
    expect(subIssues).toHaveLength(0);
  });

  it('detects missing required dependency', () => {
    const cov = makeCleanCovenant({
      dependencies: [
        { moduleId: 'nonexistent-module', required: true, capabilities: ['nonexistent.read'] },
      ],
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    expect(result.verdict).toBe('fail');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('nonexistent-module'),
        }),
      ]),
    );
  });

  it('warns on missing optional dependency', () => {
    const cov = makeCleanCovenant({
      dependencies: [
        { moduleId: 'optional-nonexistent', required: false, capabilities: ['optional.read'] },
      ],
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('optional-nonexistent'),
        }),
      ]),
    );
  });

  it('passes when existing dependency is registered', () => {
    const cov = makeCleanCovenant({
      dependencies: [
        { moduleId: 'entity-registry', required: true, capabilities: ['entity.search'] },
      ],
    });
    const result = runConflictGate(cov, ALL_COVENANTS);
    const depIssues = result.issues.filter(i => i.message.includes('entity-registry'));
    expect(depIssues).toHaveLength(0);
  });

  it('passes with empty existing covenants', () => {
    const result = runConflictGate(makeCleanCovenant(), []);
    expect(result.verdict).toBe('pass');
  });

  it('measures positive duration', () => {
    const result = runConflictGate(makeCleanCovenant(), ALL_COVENANTS);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
