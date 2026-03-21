// ===========================================
// ACTION REGISTRY INDEX
// ===========================================
// Exports and initializes all action handlers.
// Provides dependency injection types for SaaS extraction.
// ===========================================
// DEPENDS ON: All action files, registry, types, default-deps
// USED BY: action-executor, automation tests
// ===========================================

// Re-export registry types and functions
export {
  registerAction,
  getActionHandler,
  isActionRegistered,
  getRegisteredActions,
  clearActionRegistry,
  completedResult,
  failedResult,
  skippedResult,
  type ActionHandler,
  type ActionResult,
  type ExecutionContext,
} from './registry';

// Re-export dependency injection types
export type {
  ActionDependencies,
  IClientService,
  IContactService,
  ITagService,
  IOrderService,
  IEmailService,
  IEmailProvider,
  ITaskService,
  IScheduledEmailService,
  IActivityService,
} from './types';

// Re-export default dependencies for custom configurations
export {
  getDependencies,
  ClientNotFoundError,
  ContactNotFoundError,
  ContactExistsError,
  ContactAlreadyConvertedError,
  TagNotFoundError,
} from './default-deps';

// Re-export individual action executors for direct use with custom dependencies
export { executeCreateClient, executeUpdateClient, executeAddTagToClient, executeRemoveTagFromClient, executeConvertContactToClient } from './clients';
export { executeCreateContact, executeUpdateContact, executeAddTagToContact, executeRemoveTagFromContact } from './contacts';
export { executeUpdateOrderStatus } from './orders';
export { executeSendEmail, executeReplyToEmail, executeForwardEmail, getValidAccessToken } from './email-send';
export { executeArchiveEmail, executeLinkEmailToClient, executeScheduleEmail, executeCancelScheduledEmail, executeCreateTaskFromEmail } from './email-tasks';
export { executeCreateTask, executeUpdateTask, executeAssignTask, executeCompleteTask, executeReopenTask } from './tasks';
export { executeCallWebhook, executeLogActivity, executeDelay } from './system';

// Import registration functions
import { registerEmailActions } from './email';
import { registerTaskActions } from './tasks';
import { registerClientActions } from './clients';
import { registerContactActions } from './contacts';
import { registerOrderActions } from './orders';
import { registerSystemActions } from './system';

// Track if actions have been registered
let actionsRegistered = false;

/**
 * Initialize all action handlers
 * Call this once at application startup
 */
export function initializeActionHandlers(): void {
  if (actionsRegistered) {
    return; // Already registered
  }

  // Register all action handlers by category
  registerEmailActions();
  registerTaskActions();
  registerClientActions();
  registerContactActions();
  registerOrderActions();
  registerSystemActions();

  actionsRegistered = true;
}

/**
 * Reset action registration (for testing)
 */
export function resetActionHandlers(): void {
  const { clearActionRegistry } = require('./registry');
  clearActionRegistry();
  actionsRegistered = false;
}
