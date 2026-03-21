// ===========================================
// ORDINATIO ACTIVITIES — Display Configuration
// ===========================================
// Maps each activity action to its display
// properties: label, severity, icon, color,
// and resolution requirements.
// ===========================================

import { ACTIVITY_ACTIONS, type ActivityAction } from './activity-actions';
import type { ActivityDisplayConfig } from './types';

/** Configuration for each activity action. */
export const ACTIVITY_CONFIG: Record<ActivityAction, ActivityDisplayConfig> = {
  // Order lifecycle
  [ACTIVITY_ACTIONS.ORDER_CREATED]: {
    label: 'Order Created', severity: 'INFO', icon: 'ShoppingBag',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORDER_STATUS_CHANGED]: {
    label: 'Order Status Changed', severity: 'INFO', icon: 'RefreshCw',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORDER_CANCELLED]: {
    label: 'Order Cancelled', severity: 'WARNING', icon: 'XCircle',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORDER_DUPLICATED]: {
    label: 'Order Duplicated', severity: 'INFO', icon: 'Copy',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORDER_DRAFT_SAVED]: {
    label: 'Draft Saved', severity: 'INFO', icon: 'Save',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORDER_PLACEMENT_RETRIED]: {
    label: 'Placement Retried', severity: 'WARNING', icon: 'RotateCcw',
    colorClass: 'text-amber-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORDER_DELIVERY_SYNCED]: {
    label: 'Delivery Date Synced', severity: 'INFO', icon: 'CalendarCheck',
    colorClass: 'text-green-600', requiresResolution: false,
  },

  // Placement lifecycle
  [ACTIVITY_ACTIONS.PLACEMENT_PENDING]: {
    label: 'Placement Queued', severity: 'INFO', icon: 'Clock',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_PROCESSING]: {
    label: 'Placement Processing', severity: 'INFO', icon: 'Loader2',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_AWAITING_VERIFICATION]: {
    label: 'Awaiting Verification', severity: 'WARNING', icon: 'Eye',
    colorClass: 'text-amber-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_VERIFIED]: {
    label: 'Placement Verified', severity: 'INFO', icon: 'CheckCircle',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_REJECTED]: {
    label: 'Placement Rejected', severity: 'ERROR', icon: 'XCircle',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_ACTIVATING]: {
    label: 'Activating Order', severity: 'INFO', icon: 'Zap',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_COMPLETED]: {
    label: 'Placement Completed', severity: 'INFO', icon: 'CheckCircle2',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.PLACEMENT_FAILED]: {
    label: 'Placement Failed', severity: 'CRITICAL', icon: 'AlertTriangle',
    colorClass: 'text-red-600', requiresResolution: true,
  },

  // Client lifecycle
  [ACTIVITY_ACTIONS.CLIENT_CREATED]: {
    label: 'Client Created', severity: 'INFO', icon: 'UserPlus',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.CLIENT_UPDATED]: {
    label: 'Client Updated', severity: 'INFO', icon: 'UserCog',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.CLIENT_MEASUREMENTS_UPDATED]: {
    label: 'Measurements Updated', severity: 'INFO', icon: 'Ruler',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.CLIENT_FIT_PROFILE_CREATED]: {
    label: 'Fit Profile Created', severity: 'INFO', icon: 'Shirt',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.CLIENT_FIT_PROFILE_UPDATED]: {
    label: 'Fit Profile Updated', severity: 'INFO', icon: 'Shirt',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.CLIENT_NOTE_ADDED]: {
    label: 'Note Added', severity: 'INFO', icon: 'MessageSquare',
    colorClass: 'text-blue-600', requiresResolution: false,
  },

  // Email lifecycle
  [ACTIVITY_ACTIONS.EMAIL_ACCOUNT_CONNECTED]: {
    label: 'Email Account Connected', severity: 'INFO', icon: 'Mail',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_ACCOUNT_DISCONNECTED]: {
    label: 'Email Account Disconnected', severity: 'WARNING', icon: 'MailX',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_SYNC_COMPLETED]: {
    label: 'Email Sync Completed', severity: 'INFO', icon: 'RefreshCw',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_SYNC_FAILED]: {
    label: 'Email Sync Failed', severity: 'ERROR', icon: 'AlertTriangle',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.EMAIL_ARCHIVED]: {
    label: 'Email Archived', severity: 'INFO', icon: 'Archive',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_REPLIED]: {
    label: 'Email Replied', severity: 'INFO', icon: 'Reply',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_TASK_CREATED]: {
    label: 'Email Task Created', severity: 'INFO', icon: 'ListTodo',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_LINKED_TO_CLIENT]: {
    label: 'Email Linked to Client', severity: 'INFO', icon: 'Link',
    colorClass: 'text-blue-600', requiresResolution: false,
  },

  // Task lifecycle
  [ACTIVITY_ACTIONS.TASK_CREATED]: {
    label: 'Task Created', severity: 'INFO', icon: 'CheckSquare',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_UPDATED]: {
    label: 'Task Updated', severity: 'INFO', icon: 'Edit',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_COMPLETED]: {
    label: 'Task Completed', severity: 'INFO', icon: 'CheckCircle',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_REOPENED]: {
    label: 'Task Reopened', severity: 'INFO', icon: 'RotateCcw',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_DELETED]: {
    label: 'Task Deleted', severity: 'INFO', icon: 'Trash2',
    colorClass: 'text-red-600', requiresResolution: false,
  },

  // Task V2 lifecycle
  [ACTIVITY_ACTIONS.TASK_STARTED]: {
    label: 'Task Started', severity: 'INFO', icon: 'Play',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_BLOCKED]: {
    label: 'Task Blocked', severity: 'WARNING', icon: 'AlertTriangle',
    colorClass: 'text-amber-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_UNBLOCKED]: {
    label: 'Task Unblocked', severity: 'INFO', icon: 'Unlock',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_ASSIGNED]: {
    label: 'Task Assigned', severity: 'INFO', icon: 'UserPlus',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.INTENT_CREATED]: {
    label: 'Intent Created', severity: 'INFO', icon: 'Target',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.INTENT_SATISFIED]: {
    label: 'Intent Satisfied', severity: 'INFO', icon: 'CheckCircle2',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.INTENT_FAILED]: {
    label: 'Intent Failed', severity: 'WARNING', icon: 'XCircle',
    colorClass: 'text-red-600', requiresResolution: false,
  },

  // Task category lifecycle
  [ACTIVITY_ACTIONS.TASK_CATEGORY_CREATED]: {
    label: 'Category Created', severity: 'INFO', icon: 'Tag',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_CATEGORY_UPDATED]: {
    label: 'Category Updated', severity: 'INFO', icon: 'Tag',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.TASK_CATEGORY_DELETED]: {
    label: 'Category Deleted', severity: 'INFO', icon: 'Tag',
    colorClass: 'text-red-600', requiresResolution: false,
  },

  // Automation lifecycle
  [ACTIVITY_ACTIONS.AUTOMATION_TRIGGERED]: {
    label: 'Automation Triggered', severity: 'INFO', icon: 'Zap',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AUTOMATION_COMPLETED]: {
    label: 'Automation Completed', severity: 'INFO', icon: 'CheckCircle',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AUTOMATION_FAILED]: {
    label: 'Automation Failed', severity: 'ERROR', icon: 'AlertTriangle',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.AUTOMATION_DEAD_LETTER]: {
    label: 'Automation Dead Letter', severity: 'CRITICAL', icon: 'AlertOctagon',
    colorClass: 'text-red-600', requiresResolution: true,
  },

  // Security & Maintenance
  [ACTIVITY_ACTIONS.SECURITY_AUDIT_COMPLETED]: {
    label: 'Security Audit Completed', severity: 'INFO', icon: 'Shield',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUDIT_FAILED]: {
    label: 'Security Audit Failed', severity: 'ERROR', icon: 'ShieldAlert',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.DEPENDENCY_UPDATE_AVAILABLE]: {
    label: 'Updates Available', severity: 'INFO', icon: 'Package',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.DEPENDENCY_UPDATE_APPLIED]: {
    label: 'Dependencies Updated', severity: 'INFO', icon: 'PackageCheck',
    colorClass: 'text-green-600', requiresResolution: false,
  },

  // Security Events
  [ACTIVITY_ACTIONS.SECURITY_AUTH_LOGIN_SUCCESS]: {
    label: 'Login Success', severity: 'SECURITY', icon: 'LogIn',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUTH_LOGIN_FAILED]: {
    label: 'Login Failed', severity: 'SECURITY', icon: 'LogIn',
    colorClass: 'text-yellow-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUTH_LOGOUT]: {
    label: 'Logout', severity: 'SECURITY', icon: 'LogOut',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUTH_PASSWORD_CHANGED]: {
    label: 'Password Changed', severity: 'SECURITY', icon: 'KeyRound',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUTH_SESSION_EXPIRED]: {
    label: 'Session Expired', severity: 'SECURITY', icon: 'Clock',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUTH_ACCOUNT_LOCKED]: {
    label: 'Account Locked', severity: 'SECURITY', icon: 'Lock',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.SECURITY_AUTH_SUSPICIOUS]: {
    label: 'Suspicious Activity', severity: 'SECURITY', icon: 'AlertTriangle',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.SECURITY_CSRF_FAILED]: {
    label: 'CSRF Validation Failed', severity: 'SECURITY', icon: 'ShieldX',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.SECURITY_RATE_LIMIT]: {
    label: 'Rate Limit Exceeded', severity: 'SECURITY', icon: 'Gauge',
    colorClass: 'text-yellow-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_PERMISSION_DENIED]: {
    label: 'Permission Denied', severity: 'SECURITY', icon: 'ShieldBan',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_API_KEY_USED]: {
    label: 'API Key Used', severity: 'SECURITY', icon: 'Key',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_HEADER_MISSING]: {
    label: 'Security Header Missing', severity: 'SECURITY', icon: 'ShieldAlert',
    colorClass: 'text-yellow-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_INVALID_INPUT]: {
    label: 'Invalid Input Blocked', severity: 'SECURITY', icon: 'ShieldOff',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_DATA_EXPORTED]: {
    label: 'Data Exported', severity: 'SECURITY', icon: 'Download',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.SECURITY_VULNERABILITY]: {
    label: 'Vulnerability Detected', severity: 'SECURITY', icon: 'Bug',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.SECURITY_ANOMALY]: {
    label: 'Anomaly Detected', severity: 'SECURITY', icon: 'Activity',
    colorClass: 'text-red-600', requiresResolution: true,
  },

  // Agent memory lifecycle
  [ACTIVITY_ACTIONS.AGENT_MEMORY_CREATED]: {
    label: 'Memory Created', severity: 'INFO', icon: 'Brain',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_MEMORY_EXPIRED]: {
    label: 'Memory Expired', severity: 'INFO', icon: 'Clock',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_MEMORY_RECALLED]: {
    label: 'Memory Recalled', severity: 'INFO', icon: 'Search',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_PREFERENCE_NOTED]: {
    label: 'Preference Noted', severity: 'INFO', icon: 'Heart',
    colorClass: 'text-pink-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_PATTERN_DETECTED]: {
    label: 'Pattern Detected', severity: 'INFO', icon: 'TrendingUp',
    colorClass: 'text-indigo-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_FOLLOWUP_SET]: {
    label: 'Follow-up Set', severity: 'WARNING', icon: 'BellRing',
    colorClass: 'text-amber-600', requiresResolution: false,
  },

  // Knowledge system lifecycle
  [ACTIVITY_ACTIONS.KNOWLEDGE_FIELD_CREATED]: {
    label: 'Knowledge Field Created', severity: 'INFO', icon: 'Database',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.KNOWLEDGE_FIELD_APPROVED]: {
    label: 'Knowledge Field Approved', severity: 'INFO', icon: 'CheckCircle',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.KNOWLEDGE_FIELD_DISMISSED]: {
    label: 'Knowledge Field Dismissed', severity: 'INFO', icon: 'XCircle',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.KNOWLEDGE_FIELD_SUGGESTED]: {
    label: 'Knowledge Field Suggested', severity: 'INFO', icon: 'Lightbulb',
    colorClass: 'text-amber-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.KNOWLEDGE_VALUE_SET]: {
    label: 'Knowledge Value Set', severity: 'INFO', icon: 'PenLine',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.KNOWLEDGE_BATCH_COMPLETED]: {
    label: 'Knowledge Batch Completed', severity: 'INFO', icon: 'Sparkles',
    colorClass: 'text-indigo-600', requiresResolution: false,
  },

  // Email template lifecycle
  [ACTIVITY_ACTIONS.EMAIL_TEMPLATE_CREATED]: {
    label: 'Template Created', severity: 'INFO', icon: 'FileText',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_TEMPLATE_UPDATED]: {
    label: 'Template Updated', severity: 'INFO', icon: 'FileText',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.EMAIL_TEMPLATE_DELETED]: {
    label: 'Template Deleted', severity: 'INFO', icon: 'FileText',
    colorClass: 'text-red-600', requiresResolution: false,
  },

  // AI chat drawer lifecycle
  [ACTIVITY_ACTIONS.COMMAND_BAR_SEARCH]: {
    label: 'AI Chat Search', severity: 'INFO', icon: 'Search',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.COMMAND_BAR_AI_QUERY]: {
    label: 'AI Query', severity: 'INFO', icon: 'Sparkles',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.COMMAND_BAR_REPORT_GENERATED]: {
    label: 'Report Generated', severity: 'INFO', icon: 'FileDown',
    colorClass: 'text-blue-600', requiresResolution: false,
  },

  // Guided tour lifecycle
  [ACTIVITY_ACTIONS.COMMAND_BAR_TOUR_STARTED]: {
    label: 'Tour Started', severity: 'INFO', icon: 'Map',
    colorClass: 'text-indigo-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.COMMAND_BAR_TOUR_COMPLETED]: {
    label: 'Tour Completed', severity: 'INFO', icon: 'MapCheck',
    colorClass: 'text-green-600', requiresResolution: false,
  },

  // Agent suggestion lifecycle
  [ACTIVITY_ACTIONS.AGENT_SUGGESTION_CREATED]: {
    label: 'Agent Suggested', severity: 'INFO', icon: 'Lightbulb',
    colorClass: 'text-amber-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_SUGGESTION_DISMISSED]: {
    label: 'Suggestion Dismissed', severity: 'INFO', icon: 'XCircle',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AUTOMATION_PATTERN_DETECTED]: {
    label: 'Pattern Detected', severity: 'INFO', icon: 'Zap',
    colorClass: 'text-purple-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_KNOWLEDGE_SEEDED]: {
    label: 'Knowledge Seeded', severity: 'INFO', icon: 'Database',
    colorClass: 'text-teal-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_KNOWLEDGE_RESET]: {
    label: 'Knowledge Reset', severity: 'WARNING', icon: 'RefreshCw',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_PREFERENCE_SET]: {
    label: 'Preference Set', severity: 'INFO', icon: 'Settings',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.AGENT_PREFERENCE_REMOVED]: {
    label: 'Preference Removed', severity: 'INFO', icon: 'Trash2',
    colorClass: 'text-gray-600', requiresResolution: false,
  },

  // Organization lifecycle
  [ACTIVITY_ACTIONS.ORG_CREATED]: {
    label: 'Organization Created', severity: 'INFO', icon: 'Building2',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_UPDATED]: {
    label: 'Organization Updated', severity: 'INFO', icon: 'Building2',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_DEACTIVATED]: {
    label: 'Organization Deactivated', severity: 'WARNING', icon: 'XCircle',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_REACTIVATED]: {
    label: 'Organization Reactivated', severity: 'INFO', icon: 'CheckCircle',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_DATABASE_PROVISIONED]: {
    label: 'Database Provisioned', severity: 'INFO', icon: 'Database',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_PROVISIONING_FAILED]: {
    label: 'Provisioning Failed', severity: 'ERROR', icon: 'AlertTriangle',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.ORG_MEMBER_ADDED]: {
    label: 'Member Added', severity: 'INFO', icon: 'UserPlus',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_MEMBER_REMOVED]: {
    label: 'Member Removed', severity: 'WARNING', icon: 'UserMinus',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_MEMBER_ROLE_CHANGED]: {
    label: 'Member Role Changed', severity: 'INFO', icon: 'Shield',
    colorClass: 'text-gray-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.ORG_SWITCHED]: {
    label: 'Organization Switched', severity: 'INFO', icon: 'ArrowLeftRight',
    colorClass: 'text-gray-600', requiresResolution: false,
  },

  // Data migration lifecycle
  [ACTIVITY_ACTIONS.DATA_MIGRATION_STARTED]: {
    label: 'Migration Started', severity: 'INFO', icon: 'Upload',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.DATA_MIGRATION_COMPLETED]: {
    label: 'Migration Completed', severity: 'INFO', icon: 'CheckCircle',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.DATA_MIGRATION_FAILED]: {
    label: 'Migration Failed', severity: 'ERROR', icon: 'AlertTriangle',
    colorClass: 'text-red-600', requiresResolution: true,
  },
  [ACTIVITY_ACTIONS.DATA_MIGRATION_CANCELLED]: {
    label: 'Migration Cancelled', severity: 'WARNING', icon: 'XCircle',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.DATA_MIGRATION_ROLLED_BACK]: {
    label: 'Migration Rolled Back', severity: 'WARNING', icon: 'RotateCcw',
    colorClass: 'text-orange-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.DATA_MIGRATION_VERIFIED]: {
    label: 'Migration Verified', severity: 'INFO', icon: 'ShieldCheck',
    colorClass: 'text-green-600', requiresResolution: false,
  },

  // OAEM Protocol lifecycle
  [ACTIVITY_ACTIONS.OAEM_CAPSULE_RECEIVED]: {
    label: 'OAEM Capsule Received', severity: 'INFO', icon: 'Mail',
    colorClass: 'text-teal-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.OAEM_CAPSULE_VERIFIED]: {
    label: 'OAEM Capsule Verified', severity: 'INFO', icon: 'ShieldCheck',
    colorClass: 'text-blue-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.OAEM_ACTION_EXECUTED]: {
    label: 'OAEM Action Executed', severity: 'INFO', icon: 'Play',
    colorClass: 'text-green-600', requiresResolution: false,
  },
  [ACTIVITY_ACTIONS.OAEM_TRUST_POLICY_UPDATED]: {
    label: 'OAEM Policy Updated', severity: 'WARNING', icon: 'Shield',
    colorClass: 'text-amber-600', requiresResolution: false,
  },
};
