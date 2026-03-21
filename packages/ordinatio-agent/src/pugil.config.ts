import type { PugilTestCategory } from '@ordinatio/core';

export const PUGIL_CATEGORY_MAP: Record<string, PugilTestCategory> = {
  'smoke.test.ts':              'integration',
  'errors.test.ts':             'unit',
  'tool-registry.test.ts':      'unit',
  'role-registry.test.ts':      'unit',
  'guardrails.test.ts':         'unit',
  'provider-policy.test.ts':    'unit',
  'provider-health.test.ts':    'unit',
  'memory-service.test.ts':     'unit',
  'memory-formatter.test.ts':   'unit',
  'tool-adapter.test.ts':       'unit',
  'orchestrator.test.ts':       'integration',
  'covenant-bridge.test.ts':    'unit',
};

export const PUGIL_SUBJECT = '@ordinatio/agent';
