// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/domus to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'compose-handlers.test.ts':     'unit',
  'registry.test.ts':             'unit',
  'add-module.test.ts':           'unit',
  'init.test.ts':                 'unit',
  'factory-integration.test.ts':  'integration',
  'email-entities.test.ts':       'integration',
  'tasks-entities.test.ts':       'integration',
  'adversarial.test.ts':          'adversarial',
};

export const PUGIL_SUBJECT = '@ordinatio/domus';
