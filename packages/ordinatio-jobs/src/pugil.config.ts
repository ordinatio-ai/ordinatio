// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/jobs v2.0 to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  // Core job execution
  'job-registry.test.ts':         'unit',
  'cron-scheduler.test.ts':       'unit',
  'health.test.ts':               'unit',
  'errors.test.ts':               'unit',
  'bullmq-adapter.test.ts':       'integration',
  'state-machine.test.ts':        'unit',
  'dependency-resolver.test.ts':  'unit',
  'idempotency.test.ts':          'unit',
  'recovery.test.ts':             'unit',
  'worker-validation.test.ts':    'unit',
  'side-effects.test.ts':         'unit',

  // Core job advanced suites
  'policy-truth-table.test.ts':   'adversarial',
  'hypermedia.test.ts':           'integration',
  'adversarial.test.ts':          'adversarial',
  'concurrency.test.ts':          'concurrency',
  'chaos.test.ts':                'chaos',

  // DAG execution engine
  'dag-validator.test.ts':        'unit',
  'dag-executor.test.ts':         'integration',

  // Automation engine
  'automation-smoke.test.ts':     'integration',
  'intent-layer.test.ts':         'unit',
  'plan-automation.test.ts':      'integration',
  'automation-posture.test.ts':   'unit',
  'trust-gate.test.ts':           'unit',
  'memory-artifact.test.ts':      'unit',
  'simulation.test.ts':           'integration',
  'blueprint.test.ts':            'unit',
  'hypermedia-automation.test.ts': 'integration',
  'refinements.test.ts':          'unit',
};

export const PUGIL_SUBJECT = '@ordinatio/jobs';
