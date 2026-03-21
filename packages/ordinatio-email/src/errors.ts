// ===========================================
// EMAIL ENGINE — ERROR REGISTRY
// ===========================================
// Consolidated error codes for the email engine.
// Merges EMAIL_100-502 + TEMPLATE_100-109.
// Rule 8: code + ref + runtime context.
// ===========================================

// -------------------------------------------
// Error helper — generates timestamped refs
// -------------------------------------------

export function emailError(code: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: Array<string | { step: string; check: string }>;
  context: Record<string, unknown>;
} {
  const def = EMAIL_ENGINE_ERRORS[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'EMAIL',
      description: `Unknown error code: ${code}`,
      severity: 'error',
      recoverable: false,
      diagnosis: [],
      context: context || {},
    };
  }

  return {
    code: def.code,
    ref: `${def.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'EMAIL',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

/** Alias for template-specific errors */
export const templateError = emailError;

// -------------------------------------------
// EMAIL_100-104: Account (connect/disconnect/OAuth)
// -------------------------------------------

const EMAIL_ERRORS_ACCOUNT = {
  EMAIL_100: {
    code: 'EMAIL_100',
    file: 'account-queries.ts',
    function: 'getActiveAccount',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to email account endpoints.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth session cookie is present',
      'Verify getSession() returns a valid user',
    ],
  },
  EMAIL_101: {
    code: 'EMAIL_101',
    file: 'account-mutations.ts',
    function: 'connectAccount',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Gmail OAuth callback failed — code exchange error.',
    diagnosis: [
      'OAuth authorization code may have expired (codes are single-use, 10-min TTL)',
      'Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local',
      'Verify GOOGLE_REDIRECT_URI matches the registered redirect URI in Google Cloud Console',
    ],
  },
  EMAIL_102: {
    code: 'EMAIL_102',
    file: 'account-mutations.ts',
    function: 'disconnectAccount',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to disconnect Gmail account.',
    diagnosis: [
      'Database error when deactivating email account',
      'Check DATABASE_URL connectivity',
      'Verify account ID exists in EmailAccount table',
    ],
  },
  EMAIL_103: {
    code: 'EMAIL_103',
    file: 'account-mutations.ts',
    function: 'connectAccount',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Gmail OAuth state mismatch — possible CSRF or stale callback.',
    diagnosis: [
      'User may have opened multiple OAuth windows',
      'State token may have expired between redirect and callback',
    ],
  },
  EMAIL_104: {
    code: 'EMAIL_104',
    file: 'account-mutations.ts',
    function: 'connectAccount',
    httpStatus: 503,
    severity: 'error' as const,
    recoverable: true,
    description: 'Google OAuth credentials not configured in environment.',
    diagnosis: [
      'Check .env.local for GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      'Verify GOOGLE_REDIRECT_URI is set',
    ],
  },
} as const;

// -------------------------------------------
// EMAIL_200-206: Messages (inbox/detail/reply/link)
// -------------------------------------------

const EMAIL_ERRORS_MESSAGES = {
  EMAIL_200: {
    code: 'EMAIL_200',
    file: 'message-queries.ts',
    function: 'getInboxEmails',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to email messages endpoint.',
    diagnosis: ['User session expired or missing'],
  },
  EMAIL_201: {
    code: 'EMAIL_201',
    file: 'message-queries.ts',
    function: 'getInboxEmails',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch email messages from Gmail.',
    diagnosis: [
      'Gmail API may be down or rate-limited',
      'Access token may be expired — check EMAIL_502',
    ],
  },
  EMAIL_202: {
    code: 'EMAIL_202',
    file: 'message-queries.ts',
    function: 'getEmail',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Email message not found.',
    diagnosis: ['Email ID does not exist in database'],
  },
  EMAIL_203: {
    code: 'EMAIL_203',
    file: 'message-mutations.ts',
    function: 'replyToEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to send email reply.',
    diagnosis: [
      'Gmail API rejected the reply — check access token validity',
      'Original email thread may no longer exist in Gmail',
    ],
  },
  EMAIL_204: {
    code: 'EMAIL_204',
    file: 'message-mutations.ts',
    function: 'replyToEmail',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Email body validation failed.',
    diagnosis: ['Request body missing required fields (bodyHtml)'],
  },
  EMAIL_205: {
    code: 'EMAIL_205',
    file: 'message-mutations.ts',
    function: 'linkEmailToClient',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to link email to client.',
    diagnosis: ['Database error updating EmailMessage.clientId'],
  },
  EMAIL_206: {
    code: 'EMAIL_206',
    file: 'message-mutations.ts',
    function: 'forwardEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to forward email.',
    diagnosis: ['Gmail API rejected the forward request'],
  },
} as const;

// -------------------------------------------
// EMAIL_300-310: Attachments & transcription
// -------------------------------------------

const EMAIL_ERRORS_ATTACHMENTS = {
  EMAIL_300: {
    code: 'EMAIL_300',
    file: 'content-service.ts',
    function: 'fetchEmailContent',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Attachment not found.',
    diagnosis: ['Attachment ID does not match any attachment on the email'],
  },
  EMAIL_301: {
    code: 'EMAIL_301',
    file: 'content-service.ts',
    function: 'fetchEmailContent',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch attachment from Gmail.',
    diagnosis: ['Gmail API returned an error for attachment download'],
  },
  EMAIL_302: {
    code: 'EMAIL_302',
    file: 'content-service.ts',
    function: 'transcribeAudioAttachments',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Transcription failed — OpenAI Whisper error.',
    diagnosis: ['OpenAI API key may be invalid or rate-limited'],
  },
  EMAIL_303: {
    code: 'EMAIL_303',
    file: 'content-service.ts',
    function: 'transcribeAudioAttachments',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Transcription failed — file too large.',
    diagnosis: ['OpenAI Whisper has a 25 MB file size limit'],
  },
  EMAIL_304: {
    code: 'EMAIL_304',
    file: 'content-service.ts',
    function: 'transcribeAudioAttachments',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Transcription failed — unsupported format.',
    diagnosis: ['Whisper supports: mp3, mp4, mpeg, mpga, m4a, wav, webm'],
  },
  EMAIL_305: {
    code: 'EMAIL_305',
    file: 'content-service.ts',
    function: 'batchTranscribe',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Batch transcription failed.',
    diagnosis: ['Check individual attachment errors in response body'],
  },
  EMAIL_310: {
    code: 'EMAIL_310',
    file: 'content-service.ts',
    function: 'transcribeAudioAttachments',
    httpStatus: 503,
    severity: 'error' as const,
    recoverable: true,
    description: 'OpenAI API key not configured.',
    diagnosis: ['Check OPENAI_API_KEY in .env.local'],
  },
} as const;

// -------------------------------------------
// EMAIL_400-421: Categories & Tasks (kept for compat)
// -------------------------------------------

const EMAIL_ERRORS_TASKS = {
  EMAIL_400: {
    code: 'EMAIL_400',
    file: 'api/email/categories/route.ts',
    function: 'GET',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to categories endpoint.',
    diagnosis: ['User session expired or missing'],
  },
  EMAIL_401: {
    code: 'EMAIL_401',
    file: 'task-category.service.ts',
    function: 'getCategories',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch email categories.',
    diagnosis: ['Database query failed'],
  },
  EMAIL_402: {
    code: 'EMAIL_402',
    file: 'api/email/categories/route.ts',
    function: 'POST',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Category validation failed.',
    diagnosis: ['Request body missing required fields (name)'],
  },
  EMAIL_403: {
    code: 'EMAIL_403',
    file: 'task-category.service.ts',
    function: 'createCategory',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create/update category.',
    diagnosis: ['Database error creating or updating TaskCategory'],
  },
  EMAIL_404: {
    code: 'EMAIL_404',
    file: 'task-category.service.ts',
    function: 'getCategory',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Category not found.',
    diagnosis: ['Category ID does not exist in TaskCategory table'],
  },
  EMAIL_410: {
    code: 'EMAIL_410',
    file: 'api/email/tasks/route.ts',
    function: 'GET',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to tasks endpoint.',
    diagnosis: ['User session expired or missing'],
  },
  EMAIL_411: {
    code: 'EMAIL_411',
    file: 'task-queries.ts',
    function: 'getTasks',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch email tasks.',
    diagnosis: ['Database query failed listing email tasks'],
  },
  EMAIL_412: {
    code: 'EMAIL_412',
    file: 'api/email/tasks/route.ts',
    function: 'POST',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Task validation failed.',
    diagnosis: ['Request body missing required fields (emailId)'],
  },
  EMAIL_413: {
    code: 'EMAIL_413',
    file: 'task-mutations.ts',
    function: 'createTaskFromEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create email task.',
    diagnosis: ['Database error creating EmailTask record'],
  },
  EMAIL_414: {
    code: 'EMAIL_414',
    file: 'task-mutations.ts',
    function: 'updateTask',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update email task.',
    diagnosis: ['Database error updating EmailTask record'],
  },
  EMAIL_415: {
    code: 'EMAIL_415',
    file: 'task-queries.ts',
    function: 'getTask',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Email task not found.',
    diagnosis: ['Task ID does not exist'],
  },
  EMAIL_420: {
    code: 'EMAIL_420',
    file: 'task-mutations.ts',
    function: 'completeTask',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to complete task.',
    diagnosis: ['Database error updating task status to COMPLETED'],
  },
  EMAIL_421: {
    code: 'EMAIL_421',
    file: 'task-mutations.ts',
    function: 'reopenTask',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to reopen task.',
    diagnosis: ['Database error updating task status to OPEN'],
  },
} as const;

// -------------------------------------------
// EMAIL_430-502: Scheduled, Archive, Drafts, Templates, Sync
// -------------------------------------------

const EMAIL_ERRORS_OPS = {
  EMAIL_430: {
    code: 'EMAIL_430',
    file: 'scheduled-queries.ts',
    function: 'getScheduledEmails',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Unauthenticated request to scheduled email endpoint.',
    diagnosis: ['User session expired or missing'],
  },
  EMAIL_431: {
    code: 'EMAIL_431',
    file: 'scheduled-mutations.ts',
    function: 'scheduleEmail',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Scheduled email validation failed.',
    diagnosis: ['scheduledAt must be a future date'],
  },
  EMAIL_432: {
    code: 'EMAIL_432',
    file: 'scheduled-mutations.ts',
    function: 'scheduleEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create scheduled email.',
    diagnosis: ['Database error creating ScheduledEmail record'],
  },
  EMAIL_433: {
    code: 'EMAIL_433',
    file: 'scheduled-mutations.ts',
    function: 'cancelScheduledEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to cancel scheduled email.',
    diagnosis: ['Database error updating ScheduledEmail status to CANCELLED'],
  },
  EMAIL_434: {
    code: 'EMAIL_434',
    file: 'scheduled-queries.ts',
    function: 'getScheduledEmail',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Scheduled email not found.',
    diagnosis: ['Scheduled email ID does not exist'],
  },
  EMAIL_440: {
    code: 'EMAIL_440',
    file: 'archive-service.ts',
    function: 'archiveEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to archive email.',
    diagnosis: ['Database error updating EmailMessage status to ARCHIVED'],
  },
  EMAIL_441: {
    code: 'EMAIL_441',
    file: 'archive-service.ts',
    function: 'unarchiveEmail',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to unarchive email.',
    diagnosis: ['Database error updating EmailMessage status back to INBOX'],
  },
  EMAIL_450: {
    code: 'EMAIL_450',
    file: 'api/email/drafts/route.ts',
    function: 'POST',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Draft creation failed.',
    diagnosis: ['Gmail API rejected the draft creation'],
  },
  EMAIL_451: {
    code: 'EMAIL_451',
    file: 'api/email/drafts/route.ts',
    function: 'POST',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Draft validation failed.',
    diagnosis: ['Request body missing required fields (to, subject, bodyHtml)'],
  },
  EMAIL_452: {
    code: 'EMAIL_452',
    file: 'api/email/drafts/[id]/route.ts',
    function: 'GET',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Draft not found.',
    diagnosis: ['Draft ID does not exist in Gmail'],
  },
  EMAIL_460: {
    code: 'EMAIL_460',
    file: 'template-queries.ts',
    function: 'getTemplateById',
    httpStatus: 404,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Email template not found.',
    diagnosis: ['Template ID does not exist in database'],
  },
  EMAIL_461: {
    code: 'EMAIL_461',
    file: 'template-mutations.ts',
    function: 'createTemplate',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Template validation failed.',
    diagnosis: ['Request body missing required fields (name, subject, bodyHtml)'],
  },
  EMAIL_462: {
    code: 'EMAIL_462',
    file: 'template-mutations.ts',
    function: 'createTemplate',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create/update template.',
    diagnosis: ['Database error creating or updating email template'],
  },
  EMAIL_480: {
    code: 'EMAIL_480',
    file: 'api/email/drafts/route.ts',
    function: 'GET',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to fetch email drafts list.',
    diagnosis: ['Gmail API returned an error listing drafts'],
  },
  EMAIL_481: {
    code: 'EMAIL_481',
    file: 'api/email/drafts/[id]/route.ts',
    function: 'PUT',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update draft.',
    diagnosis: ['Gmail API rejected the draft update'],
  },
  EMAIL_482: {
    code: 'EMAIL_482',
    file: 'api/email/drafts/[id]/route.ts',
    function: 'DELETE',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to delete draft.',
    diagnosis: ['Gmail API rejected the draft deletion'],
  },
  EMAIL_500: {
    code: 'EMAIL_500',
    file: 'sync-service.ts',
    function: 'syncEmails',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Email sync failed.',
    diagnosis: ['Gmail API returned an error during sync'],
  },
  EMAIL_501: {
    code: 'EMAIL_501',
    file: 'sync-service.ts',
    function: 'syncEmails',
    httpStatus: 429,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Gmail API rate limit exceeded.',
    diagnosis: ['Too many requests to Gmail API in short period'],
  },
  EMAIL_502: {
    code: 'EMAIL_502',
    file: 'account-queries.ts',
    function: 'getValidAccessToken',
    httpStatus: 401,
    severity: 'error' as const,
    recoverable: true,
    description: 'Gmail token expired — re-auth required.',
    diagnosis: [
      'Access token expired and refresh token failed',
      'User may need to re-connect Gmail account via OAuth',
    ],
  },
} as const;

// -------------------------------------------
// TEMPLATE_100-109: Email template errors
// -------------------------------------------

const TEMPLATE_ERRORS_REGISTRY = {
  TEMPLATE_100: {
    code: 'TEMPLATE_100',
    file: 'template-queries.ts',
    function: 'getTemplateById',
    httpStatus: 404,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Email template not found.',
    diagnosis: [
      'Verify template exists in EmailTemplate table',
      'Template may have been deleted by another user',
    ],
  },
  TEMPLATE_101: {
    code: 'TEMPLATE_101',
    file: 'template-mutations.ts',
    function: 'createTemplate',
    httpStatus: 400,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Template validation failed.',
    diagnosis: ['name, category, subject, and bodyHtml are required'],
  },
  TEMPLATE_102: {
    code: 'TEMPLATE_102',
    file: 'template-mutations.ts',
    function: 'createTemplate',
    httpStatus: 409,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Duplicate template name.',
    diagnosis: ['A template with this name already exists'],
  },
  TEMPLATE_103: {
    code: 'TEMPLATE_103',
    file: 'template-mutations.ts',
    function: 'removeTemplate',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: false,
    description: 'Failed to delete template.',
    diagnosis: ['Template may have been deleted already'],
  },
  TEMPLATE_104: {
    code: 'TEMPLATE_104',
    file: 'template-renderer.ts',
    function: 'renderTemplate',
    httpStatus: 200,
    severity: 'low' as const,
    recoverable: true,
    description: 'Template rendered with missing variables.',
    diagnosis: ['Verify all {{variables}} have matching context data'],
  },
  TEMPLATE_105: {
    code: 'TEMPLATE_105',
    file: 'template-mutations.ts',
    function: 'removeTemplate',
    httpStatus: 403,
    severity: 'medium' as const,
    recoverable: false,
    description: 'Cannot delete a default template.',
    diagnosis: ['Set isActive to false to hide the template instead'],
  },
  TEMPLATE_106: {
    code: 'TEMPLATE_106',
    file: 'template-queries.ts',
    function: 'listTemplates',
    httpStatus: 500,
    severity: 'high' as const,
    recoverable: true,
    description: 'Failed to fetch templates.',
    diagnosis: ['Verify DATABASE_URL is reachable'],
  },
  TEMPLATE_107: {
    code: 'TEMPLATE_107',
    file: 'template-mutations.ts',
    function: 'seedDefaults',
    httpStatus: 500,
    severity: 'high' as const,
    recoverable: true,
    description: 'Failed to seed default templates.',
    diagnosis: ['Seed template names may conflict with existing data'],
  },
  TEMPLATE_108: {
    code: 'TEMPLATE_108',
    file: 'api/email-templates/use/route.ts',
    function: 'POST',
    httpStatus: 400,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Agent attempted to use an invalid or inactive template.',
    diagnosis: ['Verify template exists and isActive is true'],
  },
  TEMPLATE_109: {
    code: 'TEMPLATE_109',
    file: 'template-mutations.ts',
    function: 'updateTemplate',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Failed to update template.',
    diagnosis: ['Template may have been deleted'],
  },
} as const;

// -------------------------------------------
// DISCOVERY + MULTI-PROVIDER ERRORS (EMAIL_600-650)
// -------------------------------------------

const EMAIL_ERRORS_DISCOVERY = {
  EMAIL_600: {
    code: 'EMAIL_600',
    file: 'discovery/discovery-service.ts',
    function: 'discoverProvider',
    httpStatus: 422,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Email domain discovery failed — no providers found.',
    diagnosis: ['Check domain spelling', 'Domain may not have MX records', 'Try manual IMAP settings'],
  },
  EMAIL_601: {
    code: 'EMAIL_601',
    file: 'discovery/mx-resolver.ts',
    function: 'resolveMx',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'DNS MX lookup failed.',
    diagnosis: ['DNS resolver may be unreachable', 'Domain may not exist'],
  },
  EMAIL_602: {
    code: 'EMAIL_602',
    file: 'discovery/autoconfig-client.ts',
    function: 'fetchAutoconfig',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'Mozilla autoconfig fetch failed.',
    diagnosis: ['Autoconfig endpoint may not exist for this domain', 'Network timeout'],
  },
  EMAIL_603: {
    code: 'EMAIL_603',
    file: 'discovery/srv-resolver.ts',
    function: 'resolveSrvRecords',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'RFC 6186 SRV record lookup failed.',
    diagnosis: ['Domain may not publish SRV records for email'],
  },
  EMAIL_604: {
    code: 'EMAIL_604',
    file: 'discovery/port-prober.ts',
    function: 'probeHost',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'Port probe failed — all standard email ports unreachable.',
    diagnosis: ['Firewall may be blocking connections', 'Host may not exist'],
  },
  EMAIL_605: {
    code: 'EMAIL_605',
    file: 'discovery/provider-intelligence.ts',
    function: 'checkIntelligence',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'Provider intelligence lookup failed.',
    diagnosis: ['Database may be unreachable'],
  },
  EMAIL_610: {
    code: 'EMAIL_610',
    file: 'providers/imap-smtp.ts',
    function: 'ImapSmtpProvider.constructor',
    httpStatus: 400,
    severity: 'medium' as const,
    recoverable: true,
    description: 'IMAP/SMTP setup failed — invalid credentials or server settings.',
    diagnosis: ['Verify IMAP host, port, and security settings', 'Check username and password', 'Some providers require app passwords'],
  },
  EMAIL_611: {
    code: 'EMAIL_611',
    file: 'providers/imap-client.ts',
    function: 'connect',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'IMAP connection failed.',
    diagnosis: ['Check IMAP host and port', 'Verify TLS/SSL settings', 'Check firewall rules'],
  },
  EMAIL_612: {
    code: 'EMAIL_612',
    file: 'providers/smtp-client.ts',
    function: 'sendEmail',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'SMTP send failed.',
    diagnosis: ['Check SMTP host and port', 'Verify authentication', 'Check recipient address'],
  },
  EMAIL_613: {
    code: 'EMAIL_613',
    file: 'providers/imap-client.ts',
    function: 'fetchMessages',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'IMAP message fetch failed.',
    diagnosis: ['Connection may have timed out', 'Mailbox may not exist'],
  },
  EMAIL_614: {
    code: 'EMAIL_614',
    file: 'providers/imap-client.ts',
    function: 'moveMessage',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'IMAP message move/archive failed.',
    diagnosis: ['Target folder may not exist', 'Message may have been deleted'],
  },
  EMAIL_615: {
    code: 'EMAIL_615',
    file: 'providers/imap-smtp.ts',
    function: 'testConnection',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'IMAP/SMTP connection test failed.',
    diagnosis: ['Check credentials', 'Verify server addresses and ports'],
  },
  EMAIL_620: {
    code: 'EMAIL_620',
    file: 'providers/outlook.ts',
    function: 'OutlookProvider.exchangeCodeForTokens',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Outlook OAuth token exchange failed.',
    diagnosis: ['Check MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET', 'Auth code may have expired'],
  },
  EMAIL_621: {
    code: 'EMAIL_621',
    file: 'providers/outlook-operations.ts',
    function: 'listMessages',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Microsoft Graph API message fetch failed.',
    diagnosis: ['Access token may be expired', 'Check Graph API permissions'],
  },
  EMAIL_622: {
    code: 'EMAIL_622',
    file: 'providers/outlook-operations.ts',
    function: 'sendEmail',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Outlook send failed via Graph API.',
    diagnosis: ['Check Mail.Send permission', 'Verify recipient address'],
  },
  EMAIL_623: {
    code: 'EMAIL_623',
    file: 'providers/outlook-auth.ts',
    function: 'refreshAccessToken',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Outlook token refresh failed.',
    diagnosis: ['Refresh token may have expired (90-day inactivity)', 'Re-authenticate required'],
  },
  EMAIL_630: {
    code: 'EMAIL_630',
    file: 'self-healing/recovery.ts',
    function: 'attemptRecovery',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Self-healing recovery attempt failed.',
    diagnosis: ['All recovery strategies exhausted', 'Manual intervention required'],
  },
  EMAIL_631: {
    code: 'EMAIL_631',
    file: 'self-healing/recovery.ts',
    function: 'diagnoseConnection',
    httpStatus: 500,
    severity: 'low' as const,
    recoverable: true,
    description: 'Connection diagnosis could not determine root cause.',
    diagnosis: ['Network may be intermittent', 'Check provider status page'],
  },
  EMAIL_640: {
    code: 'EMAIL_640',
    file: 'account-mutations.ts',
    function: 'addAccount',
    httpStatus: 400,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Failed to add email account.',
    diagnosis: ['Email may already be connected', 'Invalid provider type'],
  },
  EMAIL_641: {
    code: 'EMAIL_641',
    file: 'account-mutations.ts',
    function: 'removeAccount',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Failed to remove email account.',
    diagnosis: ['Account may not exist', 'Database error'],
  },
  EMAIL_642: {
    code: 'EMAIL_642',
    file: 'account-mutations.ts',
    function: 'setPrimaryAccount',
    httpStatus: 400,
    severity: 'low' as const,
    recoverable: true,
    description: 'Failed to set primary email account.',
    diagnosis: ['Account may not exist or be inactive'],
  },
  EMAIL_650: {
    code: 'EMAIL_650',
    file: 'self-healing/recovery.ts',
    function: 'autoHeal',
    httpStatus: 500,
    severity: 'medium' as const,
    recoverable: true,
    description: 'Auto-healing triggered but could not restore connection.',
    diagnosis: ['Provider may be down', 'Credentials may have been revoked'],
  },
} as const;

// -------------------------------------------
// MERGED REGISTRY
// -------------------------------------------

export const EMAIL_ENGINE_ERRORS: Record<string, {
  code: string;
  file: string;
  function: string;
  httpStatus: number;
  severity: string;
  recoverable: boolean;
  description: string;
  diagnosis: readonly string[] | Array<string | { step: string; check: string }>;
}> = {
  ...EMAIL_ERRORS_ACCOUNT,
  ...EMAIL_ERRORS_MESSAGES,
  ...EMAIL_ERRORS_ATTACHMENTS,
  ...EMAIL_ERRORS_TASKS,
  ...EMAIL_ERRORS_OPS,
  ...TEMPLATE_ERRORS_REGISTRY,
  ...EMAIL_ERRORS_DISCOVERY,
};

/** Backward-compatible exports */
export const EMAIL_ERRORS = EMAIL_ENGINE_ERRORS;
export const TEMPLATE_ERRORS = TEMPLATE_ERRORS_REGISTRY;
