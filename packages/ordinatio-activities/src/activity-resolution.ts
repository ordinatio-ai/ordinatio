// ===========================================
// ORDINATIO ACTIVITIES — Resolution & Helpers
// ===========================================
// Resolution mapping (which actions resolve
// other actions), and helper functions for
// querying activity configuration.
// ===========================================

import { ACTIVITY_ACTIONS, type ActivityAction } from './activity-actions';
import { ACTIVITY_CONFIG } from './activity-display-config';
import { SEVERITY_ORDER, type ActivityDisplayConfig, type Severity } from './types';

/** Resolution mapping: when action X occurs, it resolves actions Y. */
export const RESOLUTION_MAPPING: Partial<Record<ActivityAction, ActivityAction[]>> = {
  [ACTIVITY_ACTIONS.PLACEMENT_VERIFIED]: [
    ACTIVITY_ACTIONS.PLACEMENT_AWAITING_VERIFICATION,
  ],
  [ACTIVITY_ACTIONS.PLACEMENT_COMPLETED]: [
    ACTIVITY_ACTIONS.PLACEMENT_VERIFIED,
    ACTIVITY_ACTIONS.PLACEMENT_AWAITING_VERIFICATION,
  ],
  [ACTIVITY_ACTIONS.PLACEMENT_PENDING]: [
    ACTIVITY_ACTIONS.PLACEMENT_REJECTED,
    ACTIVITY_ACTIONS.PLACEMENT_FAILED,
  ],
  [ACTIVITY_ACTIONS.PLACEMENT_PROCESSING]: [
    ACTIVITY_ACTIONS.PLACEMENT_PENDING,
    ACTIVITY_ACTIONS.PLACEMENT_REJECTED,
    ACTIVITY_ACTIONS.PLACEMENT_FAILED,
  ],
  [ACTIVITY_ACTIONS.EMAIL_SYNC_COMPLETED]: [
    ACTIVITY_ACTIONS.EMAIL_SYNC_FAILED,
  ],
  [ACTIVITY_ACTIONS.EMAIL_ACCOUNT_CONNECTED]: [
    ACTIVITY_ACTIONS.EMAIL_ACCOUNT_DISCONNECTED,
  ],
  [ACTIVITY_ACTIONS.AUTOMATION_COMPLETED]: [
    ACTIVITY_ACTIONS.AUTOMATION_FAILED,
  ],
  [ACTIVITY_ACTIONS.AUTOMATION_TRIGGERED]: [
    ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER,
    ACTIVITY_ACTIONS.AUTOMATION_FAILED,
  ],
  [ACTIVITY_ACTIONS.SECURITY_AUDIT_COMPLETED]: [
    ACTIVITY_ACTIONS.SECURITY_AUDIT_FAILED,
  ],
};

/** Get configuration for an action. */
export function getActivityConfig(action: string): ActivityDisplayConfig | null {
  return ACTIVITY_CONFIG[action as ActivityAction] ?? null;
}

/** Check if an action is sticky (requires resolution). */
export function isActionSticky(action: string): boolean {
  const config = getActivityConfig(action);
  return config?.requiresResolution ?? false;
}

/** Get actions that should be resolved when a given action occurs. */
export function getActionsToResolve(action: string): ActivityAction[] {
  return RESOLUTION_MAPPING[action as ActivityAction] ?? [];
}

/** Sort activities by severity (most severe first). */
export function sortBySeverity<T extends { severity: Severity }>(activities: T[]): T[] {
  return [...activities].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}
