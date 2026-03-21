// ===========================================
// @ordinatio/security — Security Intents
// ===========================================
// Named security operations — uniform language for
// agents interacting with the security control plane.
// ===========================================

import type { SecurityDb, SecurityCallbacks } from '../types';
import type { IntentResult, SecurityPlaybook } from './policy-types';
import { SecurityIntent } from './policy-types';
import type { PrincipalContext } from '../principal-context';
import { evaluateTrust } from '../trust/trust-evaluator';
import type { TrustInput } from './policy-types';
import { getPlaybookForAlert } from './playbooks';

/**
 * Resolve a security intent — dispatches to the appropriate handler.
 * Provides a uniform API for agents to interact with security.
 */
export async function resolveIntent(
  intent: SecurityIntent,
  context: {
    principal?: PrincipalContext;
    trustInput?: TrustInput;
    alertType?: string;
    eventId?: string;
    reason?: string;
  },
  db: SecurityDb,
  callbacks?: SecurityCallbacks
): Promise<IntentResult> {
  switch (intent) {
    case SecurityIntent.VERIFY_IDENTITY:
      return handleVerifyIdentity(context);

    case SecurityIntent.EVALUATE_TRUST:
      return handleEvaluateTrust(context);

    case SecurityIntent.APPROVE_HIGH_RISK:
      return handleApproveHighRisk(context, callbacks);

    case SecurityIntent.QUARANTINE_EVENT:
      return handleQuarantineEvent(context, db, callbacks);

    case SecurityIntent.ROTATE_KEYS:
      return handleRotateKeys(context, callbacks);

    case SecurityIntent.ESCALATE_TO_HUMAN:
      return handleEscalateToHuman(context, callbacks);

    default:
      return {
        intent,
        success: false,
        message: `Unknown security intent: ${intent}`,
      };
  }
}

function handleVerifyIdentity(context: {
  principal?: PrincipalContext;
}): IntentResult {
  if (!context.principal) {
    return {
      intent: SecurityIntent.VERIFY_IDENTITY,
      success: false,
      message: 'No principal context provided for identity verification',
    };
  }

  const { principal } = context;
  const verified = !!principal.principalId && !!principal.principalType;

  return {
    intent: SecurityIntent.VERIFY_IDENTITY,
    success: verified,
    message: verified
      ? `Identity verified: ${principal.principalType}:${principal.principalId}`
      : 'Identity verification failed: missing required fields',
    data: { principalId: principal.principalId, principalType: principal.principalType },
  };
}

function handleEvaluateTrust(context: {
  trustInput?: TrustInput;
}): IntentResult {
  if (!context.trustInput) {
    return {
      intent: SecurityIntent.EVALUATE_TRUST,
      success: false,
      message: 'No trust input provided for evaluation',
    };
  }

  const evaluation = evaluateTrust(context.trustInput);

  return {
    intent: SecurityIntent.EVALUATE_TRUST,
    success: true,
    message: `Trust evaluated: tier ${evaluation.trustTier}, score ${evaluation.trustScore}/100`,
    data: {
      trustTier: evaluation.trustTier,
      trustScore: evaluation.trustScore,
      reasons: evaluation.reasons,
    },
  };
}

function handleApproveHighRisk(
  context: { reason?: string },
  callbacks?: SecurityCallbacks
): IntentResult {
  callbacks?.log?.warn('High-risk approval requested', { reason: context.reason });

  return {
    intent: SecurityIntent.APPROVE_HIGH_RISK,
    success: false,
    message: 'High-risk actions require human approval — escalating',
    data: { requiresHuman: true, reason: context.reason },
  };
}

async function handleQuarantineEvent(
  context: { eventId?: string; reason?: string },
  db: SecurityDb,
  callbacks?: SecurityCallbacks
): Promise<IntentResult> {
  if (!context.eventId) {
    return {
      intent: SecurityIntent.QUARANTINE_EVENT,
      success: false,
      message: 'No eventId provided for quarantine',
    };
  }

  const event = await db.activityLog.findUnique({ where: { id: context.eventId } });
  if (!event) {
    return {
      intent: SecurityIntent.QUARANTINE_EVENT,
      success: false,
      message: `Event ${context.eventId} not found`,
    };
  }

  const metadata = (event.metadata as Record<string, unknown>) ?? {};
  await db.activityLog.update({
    where: { id: context.eventId },
    data: {
      metadata: {
        ...metadata,
        quarantined: true,
        quarantinedAt: new Date().toISOString(),
        quarantineReason: context.reason ?? 'Security intent',
      },
    },
  });

  callbacks?.log?.warn('Event quarantined', { eventId: context.eventId, reason: context.reason });

  return {
    intent: SecurityIntent.QUARANTINE_EVENT,
    success: true,
    message: `Event ${context.eventId} quarantined`,
    data: { eventId: context.eventId },
  };
}

function handleRotateKeys(
  context: { reason?: string },
  callbacks?: SecurityCallbacks
): IntentResult {
  callbacks?.log?.info('Key rotation requested', { reason: context.reason });

  return {
    intent: SecurityIntent.ROTATE_KEYS,
    success: false,
    message: 'Key rotation must be performed by the app layer — returning advisory',
    data: {
      advisory: 'Invoke your key rotation service and update all dependent systems',
      reason: context.reason,
    },
  };
}

function handleEscalateToHuman(
  context: { reason?: string },
  callbacks?: SecurityCallbacks
): IntentResult {
  callbacks?.log?.warn('Escalation to human requested', { reason: context.reason });

  return {
    intent: SecurityIntent.ESCALATE_TO_HUMAN,
    success: true,
    message: 'Escalated to human operator',
    data: { requiresHuman: true, reason: context.reason },
  };
}

/**
 * Get the appropriate playbook for a security intent + alert combination.
 */
export function getPlaybookForIntent(
  intent: SecurityIntent,
  alertType?: string
): SecurityPlaybook | null {
  if (alertType) {
    return getPlaybookForAlert(alertType);
  }
  return null;
}
