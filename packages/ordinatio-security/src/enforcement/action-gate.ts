// ===========================================
// @ordinatio/security — Enforcement: Action Gate
// ===========================================
// Central gate: blacklist → nonce → threshold → policy.
// Every block/throttle includes recovery guidance.
// ===========================================

import type { SecurityDb, SecurityCallbacks } from '../types';
import type { BlockResult, SecurityPolicy, PolicyContext } from '../policy/policy-types';
import type { PrincipalContext } from '../principal-context';
import type { NonceStore } from '../replay/nonce-store';
import type { CompositeBlacklist } from './blacklist';
import { evaluatePolicy } from '../policy/policy-engine';
import { countSecurityEventsInWindow } from '../event-queries';

export interface ActionGateConfig {
  blacklist?: CompositeBlacklist;
  nonceStore?: NonceStore;
  policies?: SecurityPolicy[];
  /** Max events per principal in a 5-min window before throttling */
  throttleThreshold?: number;
  /** Base throttle delay in ms (doubles per excess event) */
  baseThrottleMs?: number;
}

/**
 * Should the proposed action be blocked?
 * Checks in order: blacklist → nonce → event threshold → policy.
 * Returns recovery guidance on any block/throttle.
 */
export async function shouldBlockAction(
  db: SecurityDb,
  context: {
    principal: PrincipalContext;
    action: string;
    ip?: string;
    nonce?: string;
    resource?: string;
  },
  config: ActionGateConfig,
  callbacks?: SecurityCallbacks
): Promise<BlockResult> {
  // 1. Blacklist check
  if (config.blacklist) {
    const result = config.blacklist.isBlacklisted({
      ip: context.ip,
      principalId: context.principal.principalId,
      orgId: context.principal.orgId,
    });

    if (result.blocked) {
      callbacks?.log?.warn('Action blocked by blacklist', {
        dimension: result.dimension,
        key: result.key,
        action: context.action,
      });

      return {
        blocked: true,
        reason: `Blocked: ${result.dimension} ${result.key} is blacklisted`,
        recovery: {
          nextAction: 'Wait for blacklist expiry or contact administrator',
          safeAlternatives: ['Request blacklist review', 'Use a different identity'],
        },
      };
    }
  }

  // 2. Nonce replay check
  if (config.nonceStore && context.nonce) {
    const result = config.nonceStore.checkAndSet(context.nonce);
    if (!result.valid) {
      callbacks?.log?.warn('Action blocked by nonce replay', {
        nonce: context.nonce,
        reason: result.reason,
        action: context.action,
      });

      return {
        blocked: true,
        reason: `Blocked: nonce ${result.reason}`,
        recovery: {
          nextAction: 'Generate a new unique nonce and retry',
          safeAlternatives: ['Regenerate request with fresh nonce'],
        },
      };
    }
  }

  // 3. Event threshold (throttling)
  const throttleThreshold = config.throttleThreshold ?? 50;
  const baseThrottleMs = config.baseThrottleMs ?? 1000;

  try {
    const recentCount = await countSecurityEventsInWindow(db, {
      eventType: `security.api.rate_limit_exceeded` as never,
      windowMinutes: 5,
      userId: context.principal.principalId,
    });

    if (recentCount >= throttleThreshold) {
      const excess = recentCount - throttleThreshold;
      const throttleMs = getThrottleDelay(excess, baseThrottleMs);

      callbacks?.log?.warn('Action throttled by event threshold', {
        principalId: context.principal.principalId,
        recentCount,
        throttleMs,
      });

      return {
        blocked: false,
        throttleMs,
        reason: `Throttled: ${recentCount} events in 5-min window (threshold: ${throttleThreshold})`,
        recovery: {
          nextAction: `Wait ${throttleMs}ms before retrying`,
          safeAlternatives: ['Reduce request frequency', 'Batch operations'],
        },
      };
    }
  } catch {
    // Don't block on threshold check failure — fail open
  }

  // 4. Policy evaluation
  if (config.policies && config.policies.length > 0) {
    const policyContext: PolicyContext = {
      principal: context.principal,
      action: context.action,
      resource: context.resource,
    };

    const decision = evaluatePolicy(policyContext, config.policies);

    if (decision.decision === 'deny') {
      callbacks?.log?.warn('Action blocked by policy', {
        policyId: decision.policyId,
        action: context.action,
      });

      return {
        blocked: true,
        reason: `Blocked by policy: ${decision.policyName ?? decision.policyId}`,
        recovery: decision.recommendation,
      };
    }

    if (decision.decision === 'escalate') {
      return {
        blocked: false,
        reason: `Requires human approval: ${decision.policyName ?? decision.policyId}`,
        recovery: decision.recommendation,
      };
    }
  }

  return { blocked: false };
}

/**
 * Calculate exponential backoff delay based on excess event count.
 * Doubles for each event past the threshold, capped at 60s.
 */
export function getThrottleDelay(excess: number, baseMs = 1000): number {
  const delay = baseMs * Math.pow(2, Math.min(excess, 6)); // Cap at 2^6 = 64x
  return Math.min(delay, 60_000); // Hard cap at 60 seconds
}
