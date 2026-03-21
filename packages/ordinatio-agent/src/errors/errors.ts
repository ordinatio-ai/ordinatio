// ===========================================
// AGENT FRAMEWORK — ENHANCED ERROR BUILDER (v2)
// ===========================================
// Merges static registry metadata with runtime
// context. Returns a self-documenting error
// object for API responses and logs.
// ===========================================

import { AGENT_ERRORS, type AgentErrorEntry } from './error-registry';

// ---- Types ----

export interface AgentErrorResult {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  file: string;
  function: string;
  description: string;
  severity: string;
  httpStatus: number;
  recoverable: boolean;
  diagnosis: string[];
  context?: Record<string, unknown>;
}

// ---- Builder ----

/**
 * Enhanced error builder (v2).
 * Merges static registry metadata with runtime context.
 * Returns a self-documenting error object for API responses and logs.
 *
 * Basic usage:   const { ref } = agentError('AGENT_820');
 * Enhanced usage: const err = agentError('AGENT_840', { role, layer, tags });
 *
 * Unknown codes are handled gracefully — returns a generic error with the code.
 */
export function agentError(
  code: string,
  context?: Record<string, unknown>,
): AgentErrorResult {
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
  const meta: AgentErrorEntry | undefined = AGENT_ERRORS[code];

  return {
    code,
    ref: `${code}-${ts}`,
    timestamp: now.toISOString(),
    module: 'AGENT',
    file: meta?.file ?? 'unknown',
    function: meta?.function ?? 'unknown',
    description: meta?.description ?? `Unknown agent error (${code})`,
    severity: meta?.severity ?? 'error',
    httpStatus: meta?.httpStatus ?? 500,
    recoverable: meta?.recoverable ?? false,
    diagnosis: meta?.diagnosis ?? [],
    ...(context ? { context } : {}),
  };
}

// ---- Re-exports ----

export { AGENT_ERRORS } from './error-registry';
export type { AgentErrorEntry } from './error-registry';
