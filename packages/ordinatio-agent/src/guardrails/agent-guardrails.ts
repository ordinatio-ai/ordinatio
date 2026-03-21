// ===========================================
// AGENT FRAMEWORK — MODULE GUARDRAILS
// ===========================================
// Admin-configurable module access controls.
// No default guardrail list — accept guardrails
// as parameter. Apps define their own modules.
// ===========================================

import type { AgentTool, AgentGuardrail } from '../types';

// ===========================================
// FILTER FUNCTIONS
// ===========================================

/** Always-enabled module names that cannot be disabled. */
const ALWAYS_ENABLED = new Set(['memory', 'auth', 'chat']);

/**
 * Filter tools by enabled modules.
 * Tools in always-enabled modules (memory, auth, chat) pass through regardless.
 *
 * @param tools - All tools for a role
 * @param guardrails - Current guardrail configuration
 * @returns Filtered tools — only those in enabled modules
 */
export function filterToolsByGuardrails(
  tools: AgentTool[],
  guardrails: AgentGuardrail[],
): AgentTool[] {
  const disabledModules = new Set(
    guardrails.filter((g) => !g.enabled).map((g) => g.module),
  );

  if (disabledModules.size === 0) return tools;

  return tools.filter((tool) => {
    if (ALWAYS_ENABLED.has(tool.module)) {
      return true;
    }
    return !disabledModules.has(tool.module);
  });
}

/**
 * Check if a specific module is enabled in the guardrails.
 * Always-enabled modules (memory, auth, chat) always return true.
 *
 * @param module - Module name to check
 * @param guardrails - Current guardrail configuration
 * @returns true if the module is enabled
 */
export function isModuleEnabled(
  module: string,
  guardrails: AgentGuardrail[],
): boolean {
  if (ALWAYS_ENABLED.has(module)) {
    return true;
  }
  const guardrail = guardrails.find((g) => g.module === module);
  return guardrail?.enabled ?? true; // Default to enabled if not in list
}

/**
 * Generate a DB key for storing guardrails per role.
 */
export function guardrailsKey(roleId: string): string {
  return `agent_guardrails_${roleId}`;
}
