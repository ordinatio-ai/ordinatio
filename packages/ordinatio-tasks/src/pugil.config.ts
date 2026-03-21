// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/tasks to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'task-mutations.test.ts':    'unit',
  'task-queries.test.ts':      'unit',
  'task-category.test.ts':     'unit',
  'task-history.test.ts':      'unit',
  'task-dependencies.test.ts': 'unit',
  'task-templates.test.ts':    'unit',
  'task-health.test.ts':       'unit',
  'task-intents.test.ts':      'unit',
};

export const PUGIL_SUBJECT = '@ordinatio/tasks';
