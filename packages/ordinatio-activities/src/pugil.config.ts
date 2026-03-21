// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/activities to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename -> Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  // Unit tests — core functionality
  'activities.test.ts':               'unit',
  'activity-actions.test.ts':         'unit',
  'activity-display-config.test.ts':  'unit',
  'activity-resolution.test.ts':      'unit',
  'errors.test.ts':                   'unit',
  'sequence-learner.test.ts':         'unit',
  'missing-beats.test.ts':            'unit',
  'cadence.test.ts':                  'unit',
  'intent-inference.test.ts':         'unit',
  'pulse.test.ts':                    'unit',
  'agent-tools.test.ts':              'unit',

  // Integration tests
  'integration.test.ts':              'integration',

  // Adversarial tests — security mob + edge cases
  'security-mob.test.ts':             'adversarial',
  'security.test.ts':                 'adversarial',
  'ironclad-pulse.test.ts':           'adversarial',

  // Chaos tests — concurrency, callbacks, large-scale
  'concurrency.test.ts':              'concurrency',
  'callback-errors.test.ts':          'chaos',
  'large-scale.test.ts':              'chaos',
  'display-config-exhaustive.test.ts': 'chaos',
};

export const PUGIL_SUBJECT = '@ordinatio/activities';
