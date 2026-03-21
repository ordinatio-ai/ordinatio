// ===========================================
// ORDINATIO ACTIVITIES — Action Constants
// ===========================================
// All activity action constants. Pure data,
// no dependencies.
// ===========================================

export const ACTIVITY_ACTIONS = {
  // Order lifecycle
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_DUPLICATED: 'order.duplicated',
  ORDER_DRAFT_SAVED: 'order.draft_saved',
  ORDER_PLACEMENT_RETRIED: 'order.placement_retried',
  ORDER_DELIVERY_SYNCED: 'order.delivery_synced',

  // Placement lifecycle
  PLACEMENT_PENDING: 'placement.pending',
  PLACEMENT_PROCESSING: 'placement.processing',
  PLACEMENT_AWAITING_VERIFICATION: 'placement.awaiting_verification',
  PLACEMENT_VERIFIED: 'placement.verified',
  PLACEMENT_REJECTED: 'placement.rejected',
  PLACEMENT_ACTIVATING: 'placement.activating',
  PLACEMENT_COMPLETED: 'placement.completed',
  PLACEMENT_FAILED: 'placement.failed',

  // Client lifecycle
  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_MEASUREMENTS_UPDATED: 'client.measurements_updated',
  CLIENT_FIT_PROFILE_CREATED: 'client.fit_profile_created',
  CLIENT_FIT_PROFILE_UPDATED: 'client.fit_profile_updated',
  CLIENT_NOTE_ADDED: 'client.note_added',

  // Email lifecycle
  EMAIL_ACCOUNT_CONNECTED: 'email.account_connected',
  EMAIL_ACCOUNT_DISCONNECTED: 'email.account_disconnected',
  EMAIL_SYNC_COMPLETED: 'email.sync_completed',
  EMAIL_SYNC_FAILED: 'email.sync_failed',
  EMAIL_ARCHIVED: 'email.archived',
  EMAIL_REPLIED: 'email.replied',
  EMAIL_TASK_CREATED: 'email.task_created',
  EMAIL_LINKED_TO_CLIENT: 'email.linked_to_client',

  // Task lifecycle
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_COMPLETED: 'task.completed',
  TASK_REOPENED: 'task.reopened',
  TASK_DELETED: 'task.deleted',

  // Task V2 lifecycle
  TASK_STARTED: 'task.started',
  TASK_BLOCKED: 'task.blocked',
  TASK_UNBLOCKED: 'task.unblocked',
  TASK_ASSIGNED: 'task.assigned',
  INTENT_CREATED: 'intent.created',
  INTENT_SATISFIED: 'intent.satisfied',
  INTENT_FAILED: 'intent.failed',

  // Task category lifecycle
  TASK_CATEGORY_CREATED: 'task.category_created',
  TASK_CATEGORY_UPDATED: 'task.category_updated',
  TASK_CATEGORY_DELETED: 'task.category_deleted',

  // Automation lifecycle
  AUTOMATION_TRIGGERED: 'automation.triggered',
  AUTOMATION_COMPLETED: 'automation.completed',
  AUTOMATION_FAILED: 'automation.failed',
  AUTOMATION_DEAD_LETTER: 'automation.dead_letter',

  // Security & Maintenance
  SECURITY_AUDIT_COMPLETED: 'security.audit_completed',
  SECURITY_AUDIT_FAILED: 'security.audit_failed',
  DEPENDENCY_UPDATE_AVAILABLE: 'dependency.update_available',
  DEPENDENCY_UPDATE_APPLIED: 'dependency.update_applied',

  // Security Events
  SECURITY_AUTH_LOGIN_SUCCESS: 'security.auth.login_success',
  SECURITY_AUTH_LOGIN_FAILED: 'security.auth.login_failed',
  SECURITY_AUTH_LOGOUT: 'security.auth.logout',
  SECURITY_AUTH_PASSWORD_CHANGED: 'security.auth.password_changed',
  SECURITY_AUTH_SESSION_EXPIRED: 'security.auth.session_expired',
  SECURITY_AUTH_ACCOUNT_LOCKED: 'security.auth.account_locked',
  SECURITY_AUTH_SUSPICIOUS: 'security.auth.suspicious_activity',
  SECURITY_CSRF_FAILED: 'security.api.csrf_failed',
  SECURITY_RATE_LIMIT: 'security.api.rate_limit_exceeded',
  SECURITY_PERMISSION_DENIED: 'security.access.permission_denied',
  SECURITY_API_KEY_USED: 'security.api.key_used',
  SECURITY_HEADER_MISSING: 'security.api.header_missing',
  SECURITY_INVALID_INPUT: 'security.api.invalid_input_blocked',
  SECURITY_DATA_EXPORTED: 'security.data.exported',
  SECURITY_VULNERABILITY: 'security.system.vulnerability_detected',
  SECURITY_ANOMALY: 'security.system.anomaly_detected',

  // Agent memory lifecycle
  AGENT_MEMORY_CREATED: 'agent.memory_created',
  AGENT_MEMORY_EXPIRED: 'agent.memory_expired',
  AGENT_MEMORY_RECALLED: 'agent.memory_recalled',
  AGENT_PREFERENCE_NOTED: 'agent.preference_noted',
  AGENT_PATTERN_DETECTED: 'agent.pattern_detected',
  AGENT_FOLLOWUP_SET: 'agent.followup_set',

  // Knowledge system lifecycle
  KNOWLEDGE_FIELD_CREATED: 'knowledge.field_created',
  KNOWLEDGE_FIELD_APPROVED: 'knowledge.field_approved',
  KNOWLEDGE_FIELD_DISMISSED: 'knowledge.field_dismissed',
  KNOWLEDGE_FIELD_SUGGESTED: 'knowledge.field_suggested',
  KNOWLEDGE_VALUE_SET: 'knowledge.value_set',
  KNOWLEDGE_BATCH_COMPLETED: 'knowledge.batch_completed',

  // Email template lifecycle
  EMAIL_TEMPLATE_CREATED: 'email.template_created',
  EMAIL_TEMPLATE_UPDATED: 'email.template_updated',
  EMAIL_TEMPLATE_DELETED: 'email.template_deleted',

  // AI chat drawer lifecycle
  COMMAND_BAR_SEARCH: 'commandbar.search',
  COMMAND_BAR_AI_QUERY: 'commandbar.ai_query',
  COMMAND_BAR_REPORT_GENERATED: 'commandbar.report_generated',

  // Guided tour lifecycle
  COMMAND_BAR_TOUR_STARTED: 'commandbar.tour_started',
  COMMAND_BAR_TOUR_COMPLETED: 'commandbar.tour_completed',

  // Agent suggestion lifecycle
  AGENT_SUGGESTION_CREATED: 'agent.suggestion_created',
  AGENT_SUGGESTION_DISMISSED: 'agent.suggestion_dismissed',

  // Automation patterns
  AUTOMATION_PATTERN_DETECTED: 'automation.pattern_detected',

  // Agent knowledge + preferences lifecycle
  AGENT_KNOWLEDGE_SEEDED: 'agent.knowledge_seeded',
  AGENT_KNOWLEDGE_RESET: 'agent.knowledge_reset',
  AGENT_PREFERENCE_SET: 'agent.preference_set',
  AGENT_PREFERENCE_REMOVED: 'agent.preference_removed',

  // Organization lifecycle
  ORG_CREATED: 'org.created',
  ORG_UPDATED: 'org.updated',
  ORG_DEACTIVATED: 'org.deactivated',
  ORG_REACTIVATED: 'org.reactivated',
  ORG_DATABASE_PROVISIONED: 'org.database_provisioned',
  ORG_PROVISIONING_FAILED: 'org.provisioning_failed',
  ORG_MEMBER_ADDED: 'org.member_added',
  ORG_MEMBER_REMOVED: 'org.member_removed',
  ORG_MEMBER_ROLE_CHANGED: 'org.member_role_changed',
  ORG_SWITCHED: 'org.switched',

  // Data migration lifecycle
  DATA_MIGRATION_STARTED: 'migration.started',
  DATA_MIGRATION_COMPLETED: 'migration.completed',
  DATA_MIGRATION_FAILED: 'migration.failed',
  DATA_MIGRATION_CANCELLED: 'migration.cancelled',
  DATA_MIGRATION_ROLLED_BACK: 'migration.rolled_back',
  DATA_MIGRATION_VERIFIED: 'migration.verified',

  // OAEM Protocol lifecycle
  OAEM_CAPSULE_RECEIVED: 'oaem.capsule_received',
  OAEM_CAPSULE_VERIFIED: 'oaem.capsule_verified',
  OAEM_ACTION_EXECUTED: 'oaem.action_executed',
  OAEM_TRUST_POLICY_UPDATED: 'oaem.trust_policy_updated',
} as const;

/** Union type of all activity action string values. */
export type ActivityAction = typeof ACTIVITY_ACTIONS[keyof typeof ACTIVITY_ACTIONS];
