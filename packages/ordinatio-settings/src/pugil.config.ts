// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/settings to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'settings.test.ts':          'unit',
  'user-preferences.test.ts':  'unit',
  'encryption.test.ts':        'chaos',
  'history.test.ts':           'chaos',
  'merkle.test.ts':            'chaos',
  'proposals.test.ts':         'chaos',
};

export const PUGIL_SUBJECT = '@ordinatio/settings';
