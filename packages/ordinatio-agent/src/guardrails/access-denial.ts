// ===========================================
// AGENT FRAMEWORK — ACCESS DENIAL MESSAGES
// ===========================================
// Clear, categorized user-facing messages when
// tool access is denied. Three categories:
// admin-disabled, provider-policy, system-error.
// ===========================================

export type AccessDenialReason = 'module_disabled' | 'provider_policy' | 'system_error';

interface DenialContext {
  module?: string;
  provider?: string;
  sensitivity?: string;
  ref?: string;
}

/**
 * Get a user-facing message for when tool access is denied.
 */
export function getAccessDenialMessage(
  reason: AccessDenialReason,
  context: DenialContext,
): string {
  switch (reason) {
    case 'module_disabled':
      return `This capability has been disabled by your administrator. If you need access, contact them to enable the ${context.module ?? 'requested'} module in Settings > AI & Agents.`;

    case 'provider_policy':
      return `The current AI provider (${context.provider ?? 'unknown'}) doesn't have permission to access ${context.sensitivity ?? 'this'}-level data. Your administrator can switch providers in Settings > AI & Agents.`;

    case 'system_error':
      return `I wasn't able to reach the ${context.module ?? 'requested'} system. This might be a temporary issue. If it persists, contact your system administrator to investigate.${context.ref ? ` Error ref: ${context.ref}` : ''}`;

    default:
      return 'This action is not available right now. Please try again or contact your administrator.';
  }
}
