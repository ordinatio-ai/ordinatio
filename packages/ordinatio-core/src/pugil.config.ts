// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/core to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from './council/pugil-bridge';

/** Maps test filename -> Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  // Council
  'artifact-helpers.test.ts':       'unit',
  'artifact-validator.test.ts':     'unit',
  'office-briefs.test.ts':          'unit',
  'pugil-bridge.test.ts':           'unit',

  // Crypto
  'symmetric.test.ts':              'unit',

  // Construction
  'boundary-checker.test.ts':       'unit',
  'builders-questions.test.ts':     'unit',
  'complexity-meter.test.ts':       'unit',
  'covenant-validator.test.ts':     'unit',
  'module-scaffolder.test.ts':      'unit',

  // Governance
  'proposals.test.ts':              'unit',

  // Construction — integration
  'pre-disputation-audit.test.ts':  'integration',

  // Council — integration
  'council-orchestrator.test.ts':   'integration',

  // Admission — integration
  'admission-pipeline.test.ts':     'integration',

  // Execution — integration
  'intermittent-machine.test.ts':   'integration',

  // Admission — chaos
  'conflict-gate.test.ts':          'chaos',
  'governance-gate.test.ts':        'chaos',
  'permission-gate.test.ts':        'chaos',
  'sandbox-gate.test.ts':           'chaos',
  'structural-gate.test.ts':        'chaos',
  'module-registry.test.ts':        'chaos',
  'council-admission.test.ts':      'chaos',

  // Execution — chaos
  'artifact-builder.test.ts':       'chaos',
  'awakening.test.ts':              'chaos',
  'budget.test.ts':                 'chaos',
  'governance-eval.test.ts':        'chaos',
};

export const PUGIL_SUBJECT = '@ordinatio/core';
