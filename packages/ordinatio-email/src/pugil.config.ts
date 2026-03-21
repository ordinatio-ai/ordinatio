// IHS
/**
 * Pugil Test Category Configuration
 *
 * Maps each test file in @ordinatio/email to its Pugil test category.
 * Used by the Pugil reporter to classify test results in trial_report artifacts.
 */

import type { PugilTestCategory } from '@ordinatio/core';

/** Maps test filename → Pugil test category */
export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'account.test.ts':                 'unit',
  'gmail-mime.test.ts':              'unit',
  'gmail.test.ts':                   'unit',
  'imap-smtp.test.ts':               'unit',
  'outlook.test.ts':                 'unit',
  'scheduled.test.ts':               'unit',
  'sync-service.test.ts':            'unit',
  'template-renderer.test.ts':       'unit',
  'templates.test.ts':               'unit',
  'discovery-service.test.ts':       'unit',
  'mx-resolver.test.ts':             'unit',
  'capsule.test.ts':                 'unit',
  'ledger.test.ts':                  'unit',
  'signing.test.ts':                 'unit',
  'trust.test.ts':                   'unit',
  'oaem-security.test.ts':           'adversarial',
  'oaem-extraction-torture.test.ts': 'adversarial',
  'oaem-durability.test.ts':         'chaos',
  'oaem-invariants.test.ts':         'chaos',
};

export const PUGIL_SUBJECT = '@ordinatio/email';
