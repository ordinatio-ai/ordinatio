// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/security to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  // Layer 1: Logging
  'event-logger.test.ts':      'unit',
  'event-config.test.ts':      'unit',
  'event-helpers.test.ts':     'unit',
  'event-queries.test.ts':     'unit',
  'event-convenience.test.ts': 'unit',
  'errors.test.ts':            'unit',

  // Layer 2: Detection
  'alert-management.test.ts':  'unit',
  'alert-detection.test.ts':   'unit',
  'alert-recovery.test.ts':    'unit',

  // Layer 3: Policy + Trust
  'trust-evaluator.test.ts':   'unit',
  'policy-engine.test.ts':     'unit',
  'security-intents.test.ts':  'unit',
  'playbooks.test.ts':         'unit',
  'principal-context.test.ts': 'unit',

  // Layer 4: Enforcement
  'enforcement.test.ts':       'unit',
  'nonce-store.test.ts':       'unit',

  // Layer 5: Integrity
  'integrity.test.ts':         'unit',

  // Infrastructure
  'security-audit.test.ts':    'unit',
  'security-headers.test.ts':  'unit',
  'security-posture.test.ts':  'unit',
  'security-summary.test.ts':  'unit',

  // Adversarial
  'tampering.test.ts':           'adversarial',
  'adversarial-input.test.ts':   'adversarial',
  'race-conditions.test.ts':     'adversarial',
  'time-edge.test.ts':           'adversarial',

  // Enterprise
  'policy-truth-table.test.ts':  'integration',
  'fail-safe.test.ts':           'chaos',
  'key-rotation.test.ts':        'unit',
  'threshold-edges.test.ts':     'integration',
  'posture-snapshots.test.ts':   'integration',
  'hypermedia-contract.test.ts': 'integration',
  'recovery-paths.test.ts':      'integration',
  'stress.test.ts':              'concurrency',
  'chaos.test.ts':               'chaos',
  'red-team.test.ts':            'adversarial',
  'regression-corpus.test.ts':   'integration',
  'replay-attacks.test.ts':      'adversarial',
  'tamper-chain.test.ts':        'adversarial',
  'summary-contract.test.ts':    'integration',
};

export const PUGIL_SUBJECT = '@ordinatio/security';
