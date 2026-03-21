// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/auth to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'lockout.test.ts':        'unit',
  'password.test.ts':       'unit',
  'session.test.ts':        'unit',
  'csrf.test.ts':           'unit',
  'capability.test.ts':     'unit',
  'store.test.ts':          'unit',
  'adversarial.test.ts':    'adversarial',
  'angry-mob.test.ts':      'adversarial',
  'property-based.test.ts': 'chaos',
  'temporal-chaos.test.ts': 'chaos',
  'concurrency.test.ts':    'concurrency',
  'poisoned-store.test.ts': 'chaos',
};

export const PUGIL_SUBJECT = '@ordinatio/auth';
