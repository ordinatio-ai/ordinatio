// IHS
/**
 * Email Engine Module Covenant (C-03)
 *
 * Tier 2 — ACT (What Communicates and Does)
 *
 * The Email Engine manages asynchronous structured communication. Its agentic
 * innovation is three-layer storage: MIME → structured JSON → context summary.
 * Intent classification at ingest. An agent scans 200 emails via 200 context
 * summaries (~8,000 tokens) instead of 200 HTML bodies (100,000+ tokens).
 *
 * This is the first Module Covenant — the reference implementation that every
 * subsequent module follows.
 */

import type { ModuleCovenant } from '../covenant/types';

export const EMAIL_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'email-engine',
    canonicalId: 'C-03',
    version: '0.1.0',
    description:
      'Asynchronous structured communication engine. Three-layer storage: raw MIME → structured JSON (intent, entities, sentiment) → context summary for LLM windows. Multi-provider: Gmail, Outlook, IMAP/SMTP.',
    status: 'canonical',
    tier: 'act',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'EmailAccount',
        description: 'Connected email provider account with OAuth tokens and sync state',
        hasContextLayer: false, // Config entity, not content
      },
      {
        name: 'EmailMessage',
        description: 'Individual email message with sender, recipients, subject, body, attachments, and thread membership',
        hasContextLayer: true, // Primary entity — Layer B (structured) + Layer C (context summary)
      },
      {
        name: 'EmailTemplate',
        description: 'Pre-saved email template with merge variables for consistent communication',
        hasContextLayer: false, // Config entity
      },
      {
        name: 'ScheduledEmail',
        description: 'Email queued for future delivery with scheduling metadata',
        hasContextLayer: false, // Transient entity
      },
      {
        name: 'EmailTask',
        description: 'Task created from or linked to an email, with assignment and due date',
        hasContextLayer: true, // Tasks benefit from context summaries
      },
    ],

    events: [
      {
        id: 'email.received',
        description: 'New email received and synced from provider',
        payloadShape: '{ emailId, from, subject, intent, entityType: "EmailMessage" }',
      },
      {
        id: 'email.sent',
        description: 'Email sent via provider (reply, draft-send, or scheduled)',
        payloadShape: '{ emailId, to, subject, inReplyTo?, threadId? }',
      },
      {
        id: 'email.archived',
        description: 'Email archived (removed from inbox)',
        payloadShape: '{ emailId, archivedBy }',
      },
      {
        id: 'email.linked',
        description: 'Email linked to a client or order entity',
        payloadShape: '{ emailId, linkedEntityType, linkedEntityId }',
      },
      {
        id: 'email.task_created',
        description: 'Task created from an email',
        payloadShape: '{ taskId, emailId, title, assigneeId? }',
      },
      {
        id: 'email.template_used',
        description: 'Email template was applied to compose a message',
        payloadShape: '{ templateId, emailId }',
      },
      {
        id: 'email.scheduled',
        description: 'Email scheduled for future delivery',
        payloadShape: '{ scheduledEmailId, scheduledFor }',
      },
      // OAEM Protocol events
      {
        id: 'oaem.capsule_received',
        description: 'OAEM capsule parsed from incoming email',
        payloadShape: '{ emailId, threadId, trustTier, intent, verified: boolean }',
      },
      {
        id: 'oaem.action_executed',
        description: 'Capsule action was executed against the system',
        payloadShape: '{ emailId, threadId, actionType, success: boolean }',
      },
      {
        id: 'oaem.trust_policy_updated',
        description: 'OAEM trust policy was modified',
        payloadShape: '{ updatedBy, changes: string[] }',
      },
    ],

    subscriptions: [
      'entity-registry.entity_updated', // Re-extract context when linked entities change
      'auth-engine.session_expired',     // Handle token refresh
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities (the tool surface agents discover)
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe (auto-approved) ---
    {
      id: 'email.read_inbox',
      description: 'List inbox emails with pagination, filtering, and thread grouping',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'page', type: 'number', required: false, description: 'Page number (1-based)' },
        { name: 'pageSize', type: 'number', required: false, description: 'Items per page (default 20, max 100)' },
        { name: 'search', type: 'string', required: false, description: 'Search by subject, sender, or content' },
        { name: 'threadGrouping', type: 'boolean', required: false, description: 'Group emails by thread' },
      ],
      output: '{ emails: EmailMessage[], total: number, hasMore: boolean }',
      whenToUse: 'When you need to see what emails are in the inbox, check for new messages, or search for specific communications.',
      pitfalls: ['Full body content is lazy-loaded — use email.read_message for complete content'],
    },
    {
      id: 'email.read_message',
      description: 'Get a single email with full body content, attachments, and thread context',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'The email ID to fetch' },
      ],
      output: '{ email: EmailMessage, bodyHtml: string, bodyText: string, attachments: Attachment[] }',
      whenToUse: 'When you need to read the full content of a specific email, view attachments, or understand the complete message.',
    },
    {
      id: 'email.read_thread',
      description: 'Get all emails in a conversation thread',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'threadId', type: 'string', required: true, description: 'The thread ID' },
      ],
      output: '{ emails: EmailMessage[], threadLength: number }',
      whenToUse: 'When you need the full conversation history to understand context before replying or taking action.',
    },
    {
      id: 'email.search',
      description: 'Search emails across all fields — subject, sender, body content, linked entities',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'query', type: 'string', required: true, description: 'Natural language or keyword search query' },
        { name: 'dateFrom', type: 'string', required: false, description: 'ISO date for start range' },
        { name: 'dateTo', type: 'string', required: false, description: 'ISO date for end range' },
        { name: 'from', type: 'string', required: false, description: 'Filter by sender email or name' },
      ],
      output: '{ results: EmailMessage[], total: number }',
      whenToUse: 'When you need to find specific emails by content, sender, date range, or related entities.',
    },
    {
      id: 'email.list_templates',
      description: 'List available email templates',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ templates: EmailTemplate[] }',
      whenToUse: 'When you need to see what pre-built templates are available before composing an email.',
    },
    {
      id: 'email.list_scheduled',
      description: 'List emails scheduled for future delivery',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ scheduledEmails: ScheduledEmail[] }',
      whenToUse: 'When you need to check what emails are queued for sending, review their timing, or manage the queue.',
    },

    // --- Suggest (configurable) ---
    {
      id: 'email.draft',
      description: 'Create an email draft for human review before sending. PREFERRED over direct send.',
      type: 'mutation',
      risk: 'suggest',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'to', type: 'string', required: true, description: 'Recipient email address' },
        { name: 'subject', type: 'string', required: true, description: 'Email subject line' },
        { name: 'bodyHtml', type: 'string', required: true, description: 'HTML body content' },
        { name: 'inReplyTo', type: 'string', required: false, description: 'Email ID being replied to' },
        { name: 'threadId', type: 'string', required: false, description: 'Thread to continue' },
        { name: 'templateId', type: 'string', required: false, description: 'Template to use as base' },
      ],
      output: '{ draftId: string, preview: string }',
      whenToUse: 'When you want to compose an email for a human to review and send. ALWAYS prefer drafts over direct send for client-facing emails.',
      pitfalls: [
        'Always use draft instead of send for client-facing emails — approval gate',
        'Check if a template exists before composing from scratch',
      ],
    },
    {
      id: 'email.link_to_entity',
      description: 'Associate an email with a client, order, or other entity for relationship tracking',
      type: 'mutation',
      risk: 'suggest',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'The email to link' },
        { name: 'entityType', type: 'string', required: true, description: 'Target entity type', allowedValues: ['Client', 'Order', 'Contact'] },
        { name: 'entityId', type: 'string', required: true, description: 'Target entity ID' },
      ],
      output: '{ linked: boolean }',
      whenToUse: 'When an email clearly relates to a specific client or order and should be associated for future reference.',
    },

    // --- Act (configurable, default requires approval in enterprise mode) ---
    {
      id: 'email.send',
      description: 'Send an email immediately. Use email.draft instead when possible.',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'to', type: 'string', required: true, description: 'Recipient email address' },
        { name: 'subject', type: 'string', required: true, description: 'Email subject line' },
        { name: 'bodyHtml', type: 'string', required: true, description: 'HTML body content' },
        { name: 'inReplyTo', type: 'string', required: false, description: 'Email ID being replied to' },
      ],
      output: '{ messageId: string, sentAt: string }',
      whenToUse: 'When an email must be sent immediately (time-sensitive operational communication). For client-facing emails, ALWAYS prefer email.draft.',
      pitfalls: [
        'Sending is irreversible — prefer drafts for anything client-facing',
        'Ensure the recipient is correct before sending',
        'Check for existing thread context before composing a standalone email',
      ],
    },
    {
      id: 'email.reply',
      description: 'Reply to an existing email in its thread',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'The email to reply to' },
        { name: 'bodyHtml', type: 'string', required: true, description: 'Reply body content' },
      ],
      output: '{ messageId: string, sentAt: string }',
      whenToUse: 'When replying to an existing conversation. Read the full thread first (email.read_thread) to ensure appropriate context.',
      pitfalls: ['Always read thread context before replying'],
    },
    {
      id: 'email.create_task',
      description: 'Convert an email into an actionable task with assignment and due date',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'The source email' },
        { name: 'title', type: 'string', required: true, description: 'Task title' },
        { name: 'description', type: 'string', required: false, description: 'Task description' },
        { name: 'dueDate', type: 'string', required: false, description: 'ISO date for due date' },
        { name: 'assigneeId', type: 'string', required: false, description: 'User ID to assign to' },
        { name: 'categoryId', type: 'string', required: false, description: 'Task category ID' },
      ],
      output: '{ taskId: string }',
      whenToUse: 'When an email contains action items that should be tracked as tasks.',
    },
    {
      id: 'email.schedule',
      description: 'Schedule an email for future delivery at a specific time',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'to', type: 'string', required: true, description: 'Recipient email address' },
        { name: 'subject', type: 'string', required: true, description: 'Email subject line' },
        { name: 'bodyHtml', type: 'string', required: true, description: 'HTML body content' },
        { name: 'scheduledFor', type: 'string', required: true, description: 'ISO datetime to send' },
      ],
      output: '{ scheduledEmailId: string, scheduledFor: string }',
      whenToUse: 'When an email should be sent at a specific future time (e.g., business hours, follow-up timing).',
    },
    {
      id: 'email.cancel_scheduled',
      description: 'Cancel a scheduled email before it is sent',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'scheduledEmailId', type: 'string', required: true, description: 'The scheduled email to cancel' },
      ],
      output: '{ cancelled: boolean }',
      whenToUse: 'When a scheduled email is no longer needed or the situation has changed.',
    },
    {
      id: 'email.archive',
      description: 'Archive an email — removes from inbox but preserves in provider and local DB',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'The email to archive' },
      ],
      output: '{ archived: boolean }',
      whenToUse: 'When an email has been processed and should be removed from the active inbox.',
    },
    {
      id: 'email.manage_template',
      description: 'Create, update, or delete email templates',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'action', type: 'string', required: true, description: 'CRUD action', allowedValues: ['create', 'update', 'delete'] },
        { name: 'templateId', type: 'string', required: false, description: 'Template ID (for update/delete)' },
        { name: 'name', type: 'string', required: false, description: 'Template name' },
        { name: 'subject', type: 'string', required: false, description: 'Template subject with merge variables' },
        { name: 'bodyHtml', type: 'string', required: false, description: 'Template body with merge variables' },
      ],
      output: '{ templateId: string, action: string }',
      whenToUse: 'When managing the library of reusable email templates.',
    },
    {
      id: 'email.sync',
      description: 'Trigger a manual sync of emails from the provider',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ synced: number, newEmails: number }',
      whenToUse: 'When you need to ensure the latest emails are available (normally runs automatically).',
    },

    // --- Govern (always requires approval) ---
    {
      id: 'email.disconnect_account',
      description: 'Disconnect email account — cascades to all synced emails and tasks. IRREVERSIBLE.',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'accountId', type: 'string', required: true, description: 'The account to disconnect' },
        { name: 'confirmDelete', type: 'boolean', required: true, description: 'Must be true to confirm deletion' },
      ],
      output: '{ disconnected: boolean, deletedEmails: number, deletedTasks: number }',
      whenToUse: 'RARELY. Only when the user explicitly wants to disconnect their email account. This deletes all synced data.',
      pitfalls: [
        'This is IRREVERSIBLE — all synced emails and tasks are deleted',
        'Always confirm with the user before proceeding',
        'Consider archiving important data first',
      ],
    },

    // ─── OAEM Protocol Capabilities ───

    // --- Observe ---
    {
      id: 'oaem.inspect_capsule',
      description: 'Parse and inspect an OAEM capsule from an email — returns intent, actions, trust tier',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'Email message ID' },
      ],
      output: '{ capsule: CapsulePayload | null, trustTier: 0|1|2, verified: boolean }',
      whenToUse: 'When you need to understand the structured intent and state of an email that contains an OAEM capsule.',
    },
    {
      id: 'oaem.read_thread_state',
      description: 'Get the current thread ledger state for an OAEM thread',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'threadId', type: 'string', required: true, description: 'OAEM thread ID' },
      ],
      output: '{ threadId: string, state: ThreadState, stateVersion: number, latestHash: string }',
      whenToUse: 'When you need to understand the current state of a conversation — what is pending, completed, and exchanged.',
    },
    {
      id: 'oaem.verify_chain',
      description: 'Validate the hash chain integrity for an OAEM thread',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'threadId', type: 'string', required: true, description: 'OAEM thread ID' },
      ],
      output: '{ valid: boolean, brokenAt?: number, conflicts: string[] }',
      whenToUse: 'When you suspect tampering or data integrity issues in a conversation thread.',
    },

    // --- Suggest ---
    {
      id: 'oaem.suggest_reply',
      description: 'Generate a capsule payload for a reply — does NOT send, just builds for review',
      type: 'mutation',
      risk: 'suggest',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'threadId', type: 'string', required: true, description: 'Thread to reply to' },
        { name: 'intent', type: 'string', required: true, description: 'Reply intent type' },
        { name: 'actions', type: 'array', required: false, description: 'Actions to include' },
        { name: 'data', type: 'object', required: false, description: 'Structured data for thread state' },
      ],
      output: '{ capsule: CapsulePayload, encoded: string, html: string }',
      whenToUse: 'When composing a reply that should carry structured intent. Build capsule first, review, then send.',
      pitfalls: ['Always review built capsule before sending'],
    },

    // --- Act ---
    {
      id: 'oaem.execute_actions',
      description: 'Execute verified capsule actions — only for Tier 1+ capsules',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'emailId', type: 'string', required: true, description: 'Email containing the capsule' },
        { name: 'actionIndex', type: 'number', required: false, description: 'Specific action index (default: all)' },
      ],
      output: '{ executed: number, results: Array<{ action: string, success: boolean, error?: string }> }',
      whenToUse: 'When a verified capsule contains actions to execute (update record, confirm decision).',
      pitfalls: [
        'NEVER execute Tier 0 (untrusted) capsule actions',
        'process_invoice and approve_change require Tier 2',
        'Always verify thread chain before financial actions',
      ],
    },

    // --- Govern ---
    {
      id: 'oaem.manage_policy',
      description: 'View or update OAEM trust policy — controls trusted domains, allowed actions, monetary limits',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'action', type: 'string', required: true, description: '"get" or "update"' },
        { name: 'policy', type: 'object', required: false, description: 'Updated policy (for update)' },
      ],
      output: '{ policy: TrustPolicy }',
      whenToUse: 'When an admin needs to configure trust tiers, domain allowlists, or action permissions.',
      pitfalls: ['Only admins should modify trust policy'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session', 'auth.validate_token'],
    },
    {
      moduleId: 'entity-registry',
      required: true,
      capabilities: ['entity.resolve', 'entity.link'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
    {
      moduleId: 'automation-fabric',
      required: false,
      capabilities: ['automation.emit_event'],
    },
    {
      moduleId: 'notification-engine',
      required: false,
      capabilities: ['notification.send'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants (Book V)
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'No inbound message is silently dropped — every synced email is stored and indexed',
      'Layer B (structured) is always derivable from Layer A (raw MIME/HTML)',
      'Layer C (context summary) is always derivable from Layer B (structured JSON)',
      'Every sent email has an audit trail entry',
      'Email content is tenant-scoped — never leaks across organizations',
      'OAuth tokens are refreshed automatically before expiry',
      'Thread grouping preserves conversation order',
    ],
    neverHappens: [
      'An email is sent without an audit entry',
      'Raw email content (Layer A) is modified after storage',
      'Email data crosses tenant boundaries',
      'OAuth credentials are exposed in logs or error messages',
      'A scheduled email is sent before its scheduled time',
      'An archived email reappears in the inbox without explicit action',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Email Engine health check — stub implementation',
    checkedAt: new Date(),
    details: {
      accountConnected: false,
      lastSyncAt: null,
      pendingScheduled: 0,
    },
  }),
};
