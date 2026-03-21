// ===========================================
// AGENT COGNITION — Role Behavior Plans
// ===========================================
// Not just role metadata, but HOW a role
// approaches work. Behavioral operating
// patterns that shape agent reasoning.
// ===========================================

/**
 * Behavioral plan for a role.
 * Describes how the role normally approaches work,
 * not just what it has access to.
 */
export interface RoleBehaviorPlan {
  /** Role ID this plan belongs to. */
  roleId: string;

  /** Ordered approach to work (what to do first, second, etc.). */
  approachOrder: string[];

  /** What to prefer when multiple strategies are available. */
  preferences: RolePreference[];

  /** When to escalate instead of acting. */
  escalationRules: string[];

  /** When to summarize progress. */
  summarizationRules: string[];

  /** Mandatory behaviors. */
  mandatoryBehaviors: string[];
}

export interface RolePreference {
  /** What to prefer. */
  prefer: string;
  /** Over what alternative. */
  over: string;
  /** Why. */
  reason: string;
}

// ---- Registry ----

const behaviorPlans = new Map<string, RoleBehaviorPlan>();

/**
 * Register a behavior plan for a role.
 */
export function registerBehaviorPlan(plan: RoleBehaviorPlan): void {
  behaviorPlans.set(plan.roleId, plan);
}

/**
 * Get the behavior plan for a role.
 */
export function getBehaviorPlan(roleId: string): RoleBehaviorPlan | undefined {
  return behaviorPlans.get(roleId);
}

/**
 * Clear all behavior plans (for testing).
 */
export function clearBehaviorPlans(): void {
  behaviorPlans.clear();
}

/**
 * Format a behavior plan as a prompt section.
 * Injected into the system prompt to guide agent behavior.
 */
export function formatBehaviorForPrompt(plan: RoleBehaviorPlan): string {
  const sections: string[] = [];

  sections.push('## Operating Pattern');
  sections.push('');
  sections.push('When approaching any request, follow this order:');
  for (let i = 0; i < plan.approachOrder.length; i++) {
    sections.push(`${i + 1}. ${plan.approachOrder[i]}`);
  }

  if (plan.preferences.length > 0) {
    sections.push('');
    sections.push('## Preferences');
    for (const pref of plan.preferences) {
      sections.push(`- Prefer "${pref.prefer}" over "${pref.over}" — ${pref.reason}`);
    }
  }

  if (plan.escalationRules.length > 0) {
    sections.push('');
    sections.push('## Escalation');
    for (const rule of plan.escalationRules) {
      sections.push(`- ${rule}`);
    }
  }

  if (plan.mandatoryBehaviors.length > 0) {
    sections.push('');
    sections.push('## Mandatory');
    for (const behavior of plan.mandatoryBehaviors) {
      sections.push(`- ${behavior}`);
    }
  }

  return sections.join('\n');
}
