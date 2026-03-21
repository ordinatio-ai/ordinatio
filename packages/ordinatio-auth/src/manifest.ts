// ===========================================
// @ordinatio/auth — SecurityManifest (Agentic Responses)
// ===========================================
// Every auth response includes a machine-readable manifest
// telling agents exactly what to do next.
// ===========================================

/**
 * Agent-actionable response codes.
 * An agent reads suggestedAction to decide what to do without human parsing.
 */
export type AgentAction =
  | 'ALLOW'
  | 'RETRY_WITH_BACKOFF'
  | 'REQUEST_MFA_CHALLENGE'
  | 'TERMINATE_SESSION'
  | 'BLOCK_AND_NOTIFY_ADMIN'
  | 'PROMPT_PASSWORD_CHANGE'
  | 'REQUIRE_REAUTHENTICATION'
  | 'ROTATE_TOKEN'
  | 'RATE_LIMIT'
  | 'NOTIFY_SECURITY_TEAM';

/**
 * Machine-readable security recommendation attached to every auth response.
 */
export interface SecurityManifest {
  /** What the agent should do */
  suggestedAction: AgentAction;
  /** How confident the system is (0-1) */
  confidence: number;
  /** Whether a human should review before acting */
  requiresHumanReview: boolean;
  /** Optional context for the agent */
  context?: Record<string, unknown>;
}

/**
 * Build a SecurityManifest with sensible defaults.
 */
export function buildManifest(
  suggestedAction: AgentAction,
  confidence: number,
  requiresHumanReview = false,
  context?: Record<string, unknown>,
): SecurityManifest {
  return {
    suggestedAction,
    confidence: Math.max(0, Math.min(1, confidence)),
    requiresHumanReview,
    ...(context ? { context } : {}),
  };
}
