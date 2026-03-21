// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/entities to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'field-definitions.test.ts':  'unit',
  'ledger.test.ts':             'unit',
  'search.test.ts':             'unit',
  'contacts.test.ts':           'unit',
  'notes.test.ts':              'unit',
  'agent-knowledge.test.ts':    'unit',
  'interactions.test.ts':       'unit',
  'preferences.test.ts':        'unit',
  'analytics.test.ts':          'unit',
  'suggestions.test.ts':        'unit',
  'contact-fields-seed.test.ts':'unit',
  'scoring.test.ts':            'chaos',
  'decay.test.ts':              'chaos',
  'branching.test.ts':          'chaos',
  'shadow-graph.test.ts':       'chaos',
  'reflection.test.ts':         'chaos',
  'observer.test.ts':           'chaos',
  'ghost-fields.test.ts':       'chaos',
  'health.test.ts':             'chaos',
  'time-travel.test.ts':        'chaos',
  'advanced-invariants.test.ts':'adversarial',
};

export const PUGIL_SUBJECT = '@ordinatio/entities';
