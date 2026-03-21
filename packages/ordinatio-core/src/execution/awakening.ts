// IHS
/**
 * Awakening Classification (Book IV §IV)
 *
 * Classifies trigger events into Book IV's 4 awakening categories:
 * structural, environmental, intellectual, temporal.
 *
 * "The machine sleeps. An event arrives. The machine classifies,
 * then either awakens or returns to dormancy."
 *
 * DEPENDS ON: execution/types (ExecutionTrigger)
 *             execution/machine-types (AwakeningCategory, AWAKENING_PATTERNS)
 */

import type { ExecutionTrigger } from './types';
import type { AwakeningCategory } from './machine-types';
import { AWAKENING_PATTERNS } from './machine-types';

/** Source patterns that indicate noise (should not trigger awakening) */
const NOISE_PATTERNS: readonly string[] = [
  'heartbeat',
  'ping',
  'healthcheck',
  'health_check',
  'keepalive',
  'noop',
] as const;

/**
 * Classify a trigger event into one of Book IV's 4 awakening categories.
 *
 * Classification rules:
 * - cron → temporal
 * - continuation → intellectual (resumed human interaction)
 * - user → intellectual
 * - system → environmental
 * - event → pattern-matched against AWAKENING_PATTERNS, default environmental
 */
export function classifyAwakening(trigger: ExecutionTrigger): AwakeningCategory {
  switch (trigger.type) {
    case 'cron':
      return 'temporal';
    case 'continuation':
      return 'intellectual';
    case 'user':
      return 'intellectual';
    case 'system':
      return 'environmental';
    case 'event': {
      const source = trigger.source.toLowerCase();
      for (const pattern of AWAKENING_PATTERNS) {
        if (pattern.patterns.some(p => source.includes(p))) {
          return pattern.category;
        }
      }
      return 'environmental';
    }
    default:
      return 'environmental';
  }
}

/**
 * Determine if a trigger should actually awaken the machine.
 * Returns false for noise events (heartbeats, pings, health checks).
 */
export function isAwakeningRequired(trigger: ExecutionTrigger): boolean {
  const source = trigger.source.toLowerCase();
  return !NOISE_PATTERNS.some(p => source.includes(p));
}
