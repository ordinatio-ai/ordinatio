// ===========================================
// EMAIL ACTIONS
// ===========================================
// Handlers for email-related automation actions.
// Re-exports from email-send.ts and email-tasks.ts.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: email-send, email-tasks, registry
// USED BY: action-executor, automation tests
// ===========================================

import { registerAction } from './registry';

// Import action handlers from extracted modules
import {
  executeSendEmail,
  executeReplyToEmail,
  executeForwardEmail,
  getValidAccessToken,
} from './email-send';

import {
  executeArchiveEmail,
  executeLinkEmailToClient,
  executeScheduleEmail,
  executeCancelScheduledEmail,
  executeCreateTaskFromEmail,
} from './email-tasks';

// ===========================================
// REGISTER ALL EMAIL ACTIONS
// ===========================================

export function registerEmailActions(): void {
  // Wrap the exported functions to match the registry signature
  registerAction('SEND_EMAIL', (actionId, config, context) =>
    executeSendEmail(actionId, config, context)
  );
  registerAction('REPLY_TO_EMAIL', (actionId, config, context) =>
    executeReplyToEmail(actionId, config, context)
  );
  registerAction('ARCHIVE_EMAIL', (actionId, config, context) =>
    executeArchiveEmail(actionId, config, context)
  );
  registerAction('FORWARD_EMAIL', (actionId, config, context) =>
    executeForwardEmail(actionId, config, context)
  );
  registerAction('LINK_EMAIL_TO_CLIENT', (actionId, config, context) =>
    executeLinkEmailToClient(actionId, config, context)
  );
  registerAction('SCHEDULE_EMAIL', (actionId, config, context) =>
    executeScheduleEmail(actionId, config, context)
  );
  registerAction('CANCEL_SCHEDULED_EMAIL', (actionId, config, context) =>
    executeCancelScheduledEmail(actionId, config, context)
  );
  registerAction('CREATE_TASK_FROM_EMAIL', (actionId, config, context) =>
    executeCreateTaskFromEmail(actionId, config, context)
  );
}

// Re-export individual action handlers for testing
export {
  executeSendEmail,
  executeReplyToEmail,
  executeForwardEmail,
  executeArchiveEmail,
  executeLinkEmailToClient,
  executeScheduleEmail,
  executeCancelScheduledEmail,
  executeCreateTaskFromEmail,
  getValidAccessToken,
};
