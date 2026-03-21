# @ordinatio/email

A standalone, multi-provider email engine with OAuth + IMAP/SMTP support, auto-discovery, templates, scheduled delivery, and OAEM protocol integration.

Built as a **Canonical module** (C-03) under the [Ordinatio](../../docs/ordinatio/README.md) architecture. Zero app-layer dependencies — all side effects (activity logging, events, contact resolution) injected via callbacks.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Providers](#providers)
  - [Gmail (OAuth)](#gmail-oauth)
  - [Outlook (OAuth)](#outlook-oauth)
  - [IMAP/SMTP (Credentials)](#imapsmtp-credentials)
  - [Custom Providers](#custom-providers)
- [Auto-Discovery](#auto-discovery)
- [Email Operations](#email-operations)
  - [Account Management](#account-management)
  - [Inbox & Messages](#inbox--messages)
  - [Sync](#sync)
  - [Archive](#archive)
  - [Reply & Compose](#reply--compose)
  - [Content Fetching](#content-fetching)
- [Templates](#templates)
  - [Template CRUD](#template-crud)
  - [Variable Rendering](#variable-rendering)
  - [Default Templates](#default-templates)
- [Scheduled Emails](#scheduled-emails)
- [OAEM Protocol Integration](#oaem-protocol-integration)
- [Callback Injection Pattern](#callback-injection-pattern)
- [Error System](#error-system)
- [Validation Schemas](#validation-schemas)
- [Testing](#testing)
- [API Reference](#api-reference)

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│              @ordinatio/email            │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Providers │  │ Services │  │  Discovery    │  │
│  │           │  │          │  │               │  │
│  │  Gmail    │  │ Account  │  │ MX resolver   │  │
│  │  Outlook  │  │ Messages │  │ Autoconfig    │  │
│  │  IMAP     │  │ Sync     │  │ SRV records   │  │
│  │           │  │ Archive  │  │ Port prober   │  │
│  │           │  │ Content  │  │ Intelligence  │  │
│  │           │  │ Template │  │               │  │
│  │           │  │ Schedule │  │               │  │
│  └─────┬─────┘  └─────┬────┘  └───────┬───────┘  │
│        │              │               │          │
│  ┌─────┴──────────────┴───────────────┴───────┐  │
│  │            types / errors / schemas         │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
         ↕ PrismaClient        ↕ Callbacks
   (database injected)   (side effects injected)
```

**Key design principles:**

- **Provider-agnostic** — Gmail, Outlook, and any IMAP/SMTP server through a unified interface
- **Callback injection** — No imports from the host application; activity logging, event emission, contact resolution, and OAEM protocol support are injected at runtime
- **Database-injected** — Accepts a `PrismaClient` instance; works with any tenant database
- **Error-coded** — 179 error codes with timestamped references, severity levels, and diagnosis steps (Rule 8)
- **Schema-validated** — 11 Zod schemas for all inputs

---

## Quick Start

```bash
# Install (within pnpm workspace)
pnpm add @ordinatio/email

# Or reference as workspace dependency
# package.json: "@ordinatio/email": "workspace:*"
```

```typescript
import {
  getProvider,
  getActiveAccount,
  syncEmails,
  getInboxEmails,
  replyToEmail,
  discoverProvider,
} from '@ordinatio/email';

// Get the active email provider
const account = await getActiveAccount(db);
const provider = getProvider(account.provider.toLowerCase());

// Sync emails from provider
await syncEmails(db, {
  onActivity: (action, desc, data) => console.log(action, desc),
  onEmailSynced: async (email) => { /* extract context */ },
});

// Read inbox
const { emails, total } = await getInboxEmails(db, {
  status: 'INBOX',
  maxResults: 50,
});

// Auto-discover provider settings for a new email address
const discovery = await discoverProvider('user@acmecorp.com');
// → { domain: 'acmecorp.com', providers: [{ type: 'imap', settings: {...} }] }
```

---

## Providers

Three built-in providers, plus a registry for custom providers.

### Gmail (OAuth)

```typescript
import { GmailProvider } from '@ordinatio/email';

const gmail = new GmailProvider();
gmail.authType;          // 'oauth'
gmail.getCapabilities(); // { supportsLabels: true, supportsNativeThreading: true, ... }

// OAuth flow
const authUrl = gmail.getAuthUrl('state-token');
const tokens = await gmail.exchangeCodeForTokens(code);
const refreshed = await gmail.refreshAccessToken(tokens.refreshToken);

// Operations
const { messages, nextCursor } = await gmail.listMessages(tokens.accessToken, {
  maxResults: 50,
  after: new Date('2026-01-01'),
});
const full = await gmail.getMessage(tokens.accessToken, messageId);
await gmail.archiveMessage(tokens.accessToken, messageId);
await gmail.sendMessage(tokens.accessToken, { to, subject, bodyHtml });
```

**Environment variables:**
```bash
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=http://localhost:3000/api/email/callback/gmail
```

### Outlook (OAuth)

```typescript
import { OutlookProvider } from '@ordinatio/email';

const outlook = new OutlookProvider();
outlook.authType;          // 'oauth'
outlook.getCapabilities(); // { supportsFolders: true, maxAttachmentSize: 157286400, ... }

// OAuth flow (Microsoft MSAL)
const authUrl = outlook.getAuthUrl('state-token');
const tokens = await outlook.exchangeCodeForTokens(code);

// Operations use Microsoft Graph API
const { messages } = await outlook.listMessages(tokens.accessToken);
await outlook.archiveMessage(tokens.accessToken, messageId); // Moves to Archive folder
```

**Environment variables:**
```bash
MICROSOFT_CLIENT_ID=xxx
MICROSOFT_CLIENT_SECRET=xxx
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/email/callback/outlook
```

### IMAP/SMTP (Credentials)

Works with any email provider that supports IMAP and SMTP.

```typescript
import { ImapSmtpProvider } from '@ordinatio/email';
import type { ImapSmtpCredentials } from '@ordinatio/email';

const imap = new ImapSmtpProvider();
imap.authType; // 'credentials'

// Test connection before saving
const credentials: ImapSmtpCredentials = {
  imapHost: 'imap.fastmail.com',
  imapPort: 993,
  imapSecurity: 'ssl',
  smtpHost: 'smtp.fastmail.com',
  smtpPort: 465,
  smtpSecurity: 'ssl',
  username: 'user@fastmail.com',
  password: 'app-password-here',
};

const test = await imap.testConnection(credentials);
// → { success: true, imapConnected: true, smtpConnected: true, folderCount: 12, messageCount: 1847 }

// Operations
const { messages } = await imap.listMessages(JSON.stringify(credentials));
```

### Custom Providers

Register your own provider implementation:

```typescript
import { registerProvider } from '@ordinatio/email';
import type { EmailProvider } from '@ordinatio/email';

class ProtonMailProvider implements EmailProvider {
  readonly providerId = 'protonmail';
  readonly authType = 'credentials' as const;
  // ... implement required methods
}

registerProvider('protonmail', () => new ProtonMailProvider());
```

### Provider Capabilities

Each provider declares its capabilities:

```typescript
interface ProviderCapabilities {
  supportsOAuth: boolean;
  supportsPushNotifications: boolean;
  supportsNativeArchive: boolean;
  supportsNativeThreading: boolean;
  supportsServerSearch: boolean;
  supportsLabels: boolean;      // Gmail-specific
  supportsFolders: boolean;     // IMAP-specific
  archiveAction: 'label_remove' | 'move_folder' | 'flag';
  maxAttachmentSize: number;    // bytes
}
```

| Capability | Gmail | Outlook | IMAP/SMTP |
|-----------|-------|---------|-----------|
| OAuth | Yes | Yes | No |
| Push notifications | Yes | Yes (webhooks) | No |
| Native threading | Yes (`threadId`) | Yes (`conversationId`) | No |
| Native archive | Yes (remove INBOX label) | Yes (move to Archive folder) | Flag-based |
| Server search | Yes (full-text) | Yes (OData filter) | IMAP SEARCH |
| Max attachment | 25 MB | 150 MB | Varies |

---

## Auto-Discovery

Automatically detect email provider settings from an email address.

```typescript
import { discoverProvider } from '@ordinatio/email';

const result = await discoverProvider('user@acmecorp.com', {
  // Optional: query your own intelligence database
  queryIntelligence: async (domain) => {
    return db.emailProviderDiscovery.findFirst({ where: { domain } });
  },
  // Optional: record successful connections for future users
  recordIntelligence: async (domain, settings) => {
    await db.emailProviderDiscovery.upsert({ ... });
  },
});

console.log(result);
// {
//   domain: 'acmecorp.com',
//   providers: [{
//     type: 'imap',
//     displayName: 'Acme Corp Mail',
//     authMethod: 'password',
//     settings: { imapHost: 'imap.acmecorp.com', imapPort: 993, ... },
//     confidence: 0.9
//   }],
//   source: 'mozilla_autoconfig',
//   durationMs: 340
// }
```

### Discovery Pipeline

Strategies are tried in order, stopping on first success:

| Priority | Strategy | Speed | Confidence |
|----------|----------|-------|------------|
| 1 | **Provider Intelligence** — learned from past connections | Instant | Very high |
| 2 | **Known Provider Match** — MX records (`*google*` = Gmail) | Fast | High |
| 3 | **Mozilla Autoconfig** — `autoconfig.{domain}/mail/config-v1.1.xml` | Medium | High |
| 4 | **RFC 6186 SRV Records** — `_imaps._tcp.{domain}` | Medium | Medium |
| 5 | **Port Probing** — TCP/TLS on ports 993, 143, 587, 465 | Slow | Low |

Provider Intelligence is **cross-tenant shared** — when one user connects to `@acmecorp.com`, all future users on that domain get instant detection.

---

## Email Operations

### Account Management

```typescript
import { getActiveAccount, connectAccount, disconnectAccount, getValidAccessToken } from '@ordinatio/email';

// Get the currently active account
const account = await getActiveAccount(db);
// → { id, email, provider, isActive, lastSyncAt, ... }

// Connect a new account (OAuth providers)
const { id, email } = await connectAccount(db, 'gmail', code, 'user@gmail.com', callbacks);

// Refresh an expired OAuth token
const freshToken = await getValidAccessToken(db, accountId);

// Disconnect and clean up
await disconnectAccount(db, accountId, callbacks);
```

### Inbox & Messages

```typescript
import { getInboxEmails, getInboxThreads, getEmail, getClientEmails } from '@ordinatio/email';

// List inbox messages (paginated)
const { emails, total } = await getInboxEmails(db, {
  status: 'INBOX',       // or 'ARCHIVED'
  maxResults: 50,
  cursor: 'last-id',     // cursor-based pagination
  search: 'invoice',     // full-text search
});

// Get threaded conversations
const threads = await getInboxThreads(db, { maxResults: 20 });

// Get a single email with full body
const email = await getEmail(db, emailId);

// Get all emails linked to a client
const clientEmails = await getClientEmails(db, clientId);
```

### Sync

```typescript
import { syncEmails, logSyncFailure } from '@ordinatio/email';

// Sync emails from all active accounts
await syncEmails(db, {
  onActivity: (action, desc, data) => { /* log to activity feed */ },
  onEvent: (event) => { /* emit automation trigger */ },
  resolveContact: async (email, name) => { /* find or create contact */ },
  onEmailSynced: async (emailData) => { /* extract context for LLM */ },
  sanitizeHtml: (html) => { /* strip scripts */ },
  oaem: {
    parseCapsule: async (ctx) => { /* extract OAEM capsule */ },
    onCapsuleVerified: async (result) => { /* persist to ledger */ },
  },
});

// Log sync failures with error codes
await logSyncFailure(error, db);
```

### Archive

```typescript
import { archiveEmail } from '@ordinatio/email';

await archiveEmail(db, emailId, userId, callbacks);
// Provider-aware: removes INBOX label (Gmail), moves to Archive folder (Outlook), flags (IMAP)
```

### Reply & Compose

```typescript
import { replyToEmail } from '@ordinatio/email';

await replyToEmail(db, {
  emailId: 'msg-123',
  bodyHtml: '<p>Thanks for your order!</p>',
  accessToken: token,
}, callbacks);
```

### Content Fetching

```typescript
import { fetchEmailContent } from '@ordinatio/email';

// Fetch full body + attachments (lazy-loaded on first access)
const content = await fetchEmailContent(db, emailId, {
  sanitizeHtml: (html) => sanitize(html),
});
```

---

## Templates

Email templates with variable rendering, categories, and default seeding.

### Template CRUD

```typescript
import { createTemplate, updateTemplate, removeTemplate, listTemplates } from '@ordinatio/email';

// Create
const template = await createTemplate(db, {
  name: 'Order Confirmation',
  category: 'order',
  subject: 'Your order {{orderNumber}} is confirmed',
  bodyHtml: '<p>Dear {{clientName}}, your {{garmentType}} order is confirmed.</p>',
}, callbacks);

// List by category
const templates = await listTemplates(db, { category: 'order' });

// Update
await updateTemplate(db, template.id, { subject: 'Updated subject' }, callbacks);

// Delete (default templates protected)
await removeTemplate(db, template.id, callbacks);
```

### Variable Rendering

```typescript
import { renderTemplate, extractPlaceholders, AVAILABLE_VARIABLES } from '@ordinatio/email';

// See all available variables
console.log(AVAILABLE_VARIABLES);
// [
//   { key: 'clientName', label: 'Client Name', category: 'client' },
//   { key: 'orderNumber', label: 'Order Number', category: 'order' },
//   { key: 'clothierName', label: 'Clothier Name', category: 'clothier' },
//   ...
// ]

// Extract placeholders from a template
const placeholders = extractPlaceholders('Hello {{clientName}}, your {{garmentType}} is ready.');
// → ['clientName', 'garmentType']

// Render with variables
const rendered = renderTemplate(
  { subject: 'Order {{orderNumber}}', bodyHtml: '<p>Hi {{clientName}}</p>' },
  { clientName: 'John Smith', orderNumber: 'ORD-001' }
);
// → { subject: 'Order ORD-001', bodyHtml: '<p>Hi John Smith</p>' }
```

### Default Templates

The engine ships with default templates that auto-seed on first access:

| Category | Templates |
|----------|-----------|
| `fitting` | Fitting appointment confirmation, fitting reminder |
| `order` | Order confirmation, order ready for pickup |
| `fabric` | Fabric arrived notification |
| `welcome` | New client welcome |
| `followup` | Post-delivery follow-up |

```typescript
import { ensureDefaults, resetToDefaults } from '@ordinatio/email';

// Auto-seed defaults (idempotent)
await ensureDefaults(db);

// Reset all templates to factory defaults
await resetToDefaults(db, callbacks);
```

---

## Scheduled Emails

Queue emails for future delivery with retry logic.

```typescript
import {
  scheduleEmail,
  cancelScheduledEmail,
  getScheduledEmails,
  getPendingToSend,
  markAsProcessing,
  markAsSent,
  markAsFailed,
  retryScheduledEmail,
} from '@ordinatio/email';

// Schedule for later
const scheduled = await scheduleEmail(db, {
  toEmail: 'client@example.com',
  subject: 'Your fitting is tomorrow',
  bodyHtml: '<p>Just a reminder...</p>',
  scheduledFor: new Date('2026-03-10T09:00:00Z'),
}, callbacks);

// Cancel before sending
await cancelScheduledEmail(db, scheduled.id, callbacks);

// Worker polling: find emails due for delivery
const due = await getPendingToSend(db);
for (const email of due) {
  await markAsProcessing(db, email.id);
  try {
    // ... send via provider ...
    await markAsSent(db, email.id, callbacks);
  } catch (err) {
    await markAsFailed(db, email.id, err.message, callbacks);
  }
}

// Retry a failed email
await retryScheduledEmail(db, failedEmailId);
```

**Status lifecycle:** `PENDING` -> `PROCESSING` -> `SENT` | `FAILED`

---

## OAEM Protocol Integration

The email engine integrates with the OAEM protocol layer (bundled at `src/oaem/`) via the `OaemCallbacks` interface. OAEM exports are available from the main `@ordinatio/email` entry point or via the `@ordinatio/email/oaem` subpath.

```typescript
import type { OaemCallbacks } from '@ordinatio/email';

const oaemCallbacks: OaemCallbacks = {
  // Outgoing: build and inject capsule before sending
  buildCapsule: async (context) => {
    const capsule = encodeCapsule({ intent: 'proposal_offer', ... });
    const signed = await signCapsule(capsule, privateKey, options);
    const augmented = embedCapsule(context.bodyHtml, capsule, { signature: signed });
    return { bodyHtml: augmented, capsuleRaw: capsule };
  },

  // Incoming: parse and verify capsule from received email
  parseCapsule: async (context) => {
    const extracted = extractCapsule(context.bodyHtml);
    if (!extracted?.found) return { found: false, trustTier: 0, verified: false };
    const trust = await evaluateTrust(extracted.payload, extracted.signature, trustContext);
    return { found: true, capsule: extracted.payload, trustTier: trust.tier, verified: trust.signatureValid };
  },

  // After verification: persist to thread ledger
  onCapsuleVerified: async (result) => {
    await db.oaemThreadLedger.upsert({ ... });
  },
};
```

---

## Callback Injection Pattern

The engine has zero imports from any host application. All side effects are supplied via typed callback interfaces:

```typescript
// Activity logging (e.g., to an activity feed)
interface ActivityLogger {
  (action: EmailActivityAction, description: string, data?: EmailActivityData): Promise<void>;
}

// Event emission (e.g., to trigger automations)
interface EventEmitter {
  (event: { type: string; data: Record<string, unknown> }): Promise<void>;
}

// Contact resolution (e.g., create CRM contacts from email senders)
interface ContactResolver {
  (email: string, name?: string): Promise<{ id: string } | null>;
}

// HTML sanitization (e.g., strip script tags from email body)
interface HtmlSanitizer {
  (html: string): string;
}

// Context extraction (e.g., extract structured data for LLM context windows)
interface EmailContextExtractor {
  (emailData: { subject: string; fromEmail: string; snippet: string; bodyHtml?: string }): Promise<void>;
}
```

### Composing Callbacks

```typescript
const callbacks: EmailMutationCallbacks = {
  onActivity: async (action, description, data) => {
    await createActivity(db, { action, description, metadata: data });
  },
  onEvent: async (event) => {
    await emitTriggerEvent(event.type, event.data);
  },
};

// Pass to any mutation
await connectAccount(db, 'gmail', code, email, callbacks);
await replyToEmail(db, input, callbacks);
await archiveEmail(db, emailId, userId, callbacks);
```

---

## Error System

179 error codes following the Rule 8 pattern. Every error includes a unique timestamped reference for debugging.

```typescript
import { emailError, EMAIL_ENGINE_ERRORS } from '@ordinatio/email';

// Generate an error with ref
const { code, ref, timestamp, description, diagnosis } = emailError('EMAIL_101');
// → {
//   code: 'EMAIL_101',
//   ref: 'EMAIL_101-20260305T120000',
//   description: 'OAuth token exchange failed',
//   severity: 'error',
//   recoverable: true,
//   diagnosis: ['Check OAuth client credentials', 'Verify redirect URI matches', ...]
// }

// With runtime context
const error = emailError('EMAIL_601', { domain: 'acmecorp.com', source: 'mx_resolver' });
```

### Error Code Ranges

| Range | Module | Count |
|-------|--------|-------|
| `EMAIL_100-104` | Account (OAuth, connect/disconnect) | 5 |
| `EMAIL_200-206` | Messages (inbox, detail, reply, link) | 7 |
| `EMAIL_300-310` | Attachments & transcription | 11 |
| `EMAIL_400-421` | Categories & tasks (legacy) | 22 |
| `EMAIL_430-502` | Scheduled, archive, drafts, templates, sync | 73 |
| `EMAIL_600-650` | Discovery + multi-provider | 51 |
| `TEMPLATE_100-109` | Email templates | 10 |

Each error entry includes:

```typescript
{
  file: string;          // Source file
  function: string;      // Function name
  httpStatus: number;    // Suggested HTTP status code
  severity: 'low' | 'medium' | 'error' | 'warn';
  recoverable: boolean;  // Can the user retry?
  description: string;   // Human-readable description
  diagnosis: string[];   // Steps to investigate
}
```

---

## Validation Schemas

11 Zod schemas for runtime input validation:

```typescript
import {
  ConnectAccountSchema,
  ScheduleEmailSchema,
  CreateEmailTemplateSchema,
  GetInboxMessagesQuerySchema,
  // ...
} from '@ordinatio/email';

// Validate input
const result = ScheduleEmailSchema.safeParse(userInput);
if (!result.success) {
  return { error: result.error.flatten().fieldErrors };
}
```

| Schema | Used For |
|--------|----------|
| `EmailProviderSchema` | Provider type validation (`gmail`, `outlook`, `imap`) |
| `ConnectAccountSchema` | OAuth connection input |
| `ScheduleEmailSchema` | Schedule email input (to, subject, body, scheduledFor) |
| `GetScheduledEmailsQuerySchema` | Scheduled email list query params |
| `GetInboxMessagesQuerySchema` | Inbox query params (search, status, pagination) |
| `CreateDraftSchema` | Draft creation input |
| `CreateEmailTemplateSchema` | Template creation |
| `UpdateEmailTemplateSchema` | Template update |
| `RenderEmailTemplateSchema` | Template render (template + variables) |
| `UseEmailTemplateSchema` | Apply template to compose |
| `ScheduledEmailStatusSchema` | Status enum validation |

---

## Testing

```bash
# Run all tests
pnpm --filter @ordinatio/email test:run

# Run with watch
pnpm --filter @ordinatio/email test

# TypeScript check
pnpm --filter @ordinatio/email exec tsc --noEmit
```

**527 tests** across 19 test files (11 core + 8 OAEM):

| File | Tests | Coverage |
|------|-------|----------|
| `account.test.ts` | 11 | OAuth flow, token refresh, disconnection |
| `templates.test.ts` | 31 | CRUD, rendering, defaults, categories |
| `template-renderer.test.ts` | 18 | Variables, placeholders, edge cases |
| `scheduled.test.ts` | 24 | Scheduling, cancellation, retry, status |
| `sync-service.test.ts` | 39 | Multi-provider sync, failures, contacts |
| `providers/gmail.test.ts` | 42 | OAuth, messages, MIME, archive |
| `providers/gmail-mime.test.ts` | 29 | RFC 2822 MIME encoding, attachments |
| `providers/outlook.test.ts` | 31 | Graph API, OAuth, send, archive |
| `providers/imap-smtp.test.ts` | 26 | IMAP connect, SMTP, TLS, folders |
| `discovery/discovery-service.test.ts` | 25 | Multi-source pipeline, confidence |
| `discovery/mx-resolver.test.ts` | 16 | MX lookup, known provider matching |
| `oaem/capsule/capsule.test.ts` | — | CBOR encoding, dual-prefix embedding |
| `oaem/signing/signing.test.ts` | — | Ed25519 JWS, key rotation |
| `oaem/trust/trust.test.ts` | — | 3-tier trust evaluation |
| `oaem/ledger/ledger.test.ts` | — | Hash-chained thread state machine |
| `oaem/oaem-security.test.ts` | — | Replay protection, nonce tracking |
| `oaem/oaem-invariants.test.ts` | — | Protocol invariant checks |
| `oaem/oaem-durability.test.ts` | — | Durability under failure |
| `oaem/oaem-extraction-torture.test.ts` | — | Capsule extraction edge cases |

Plus **346 mob tests** in the host application testing edge cases, fuzzing, concurrency, security, and state corruption scenarios.

---

## API Reference

### Providers

| Export | Type | Description |
|--------|------|-------------|
| `getProvider(type)` | `(ProviderType) => EmailProvider` | Factory — returns provider instance |
| `isProviderSupported(type)` | `(string) => boolean` | Type guard for valid providers |
| `registerProvider(type, factory)` | `(string, () => EmailProvider) => void` | Register a custom provider |
| `GmailProvider` | `class` | Gmail implementation (OAuth) |
| `OutlookProvider` | `class` | Outlook implementation (OAuth) |
| `ImapSmtpProvider` | `class` | Universal IMAP/SMTP implementation |
| `buildMimeMessage(options)` | `(MimeMessageOptions) => string` | Build raw MIME message |

### Account

| Export | Type | Description |
|--------|------|-------------|
| `getActiveAccount(db)` | `async` | Get the currently active email account |
| `getConnectUrl(provider)` | `(string) => string` | Get OAuth authorization URL |
| `getValidAccessToken(db, accountId)` | `async` | Refresh token if expired, return valid token |
| `updateSyncTimestamp(db, accountId)` | `async` | Update `lastSyncAt` after sync |
| `connectAccount(db, provider, code, email, callbacks?)` | `async` | Exchange OAuth code, create account |
| `disconnectAccount(db, accountId, callbacks?)` | `async` | Delete account and associated data |

### Messages

| Export | Type | Description |
|--------|------|-------------|
| `getInboxEmails(db, options)` | `async` | List inbox messages (paginated, searchable) |
| `getInboxThreads(db, options)` | `async` | List threaded conversations |
| `getEmail(db, emailId)` | `async` | Get single email with full content |
| `getClientEmails(db, clientId)` | `async` | Get all emails linked to a client |
| `replyToEmail(db, input, callbacks?)` | `async` | Reply to an email |
| `linkEmailToClient(db, emailId, clientId, userId, callbacks?)` | `async` | Associate email with CRM client |

### Sync & Archive

| Export | Type | Description |
|--------|------|-------------|
| `syncEmails(db, callbacks?)` | `async` | Sync emails from all active accounts |
| `logSyncFailure(error, db?)` | `async` | Log sync failure with error code |
| `archiveEmail(db, emailId, userId, callbacks?)` | `async` | Archive an email |
| `fetchEmailContent(db, emailId, callbacks?)` | `async` | Lazy-fetch full body + attachments |

### Templates

| Export | Type | Description |
|--------|------|-------------|
| `ensureDefaults(db)` | `async` | Seed default templates (idempotent) |
| `listTemplates(db, options?)` | `async` | List templates by category |
| `getTemplateById(db, id)` | `async` | Get single template |
| `getActiveByCategory(db, category)` | `async` | Get active template for a category |
| `createTemplate(db, input, callbacks?)` | `async` | Create a new template |
| `updateTemplate(db, id, input, callbacks?)` | `async` | Update template |
| `removeTemplate(db, id, callbacks?)` | `async` | Delete template (default protected) |
| `resetToDefaults(db, callbacks?)` | `async` | Reset all templates to factory defaults |
| `renderTemplate(template, variables)` | `sync` | Render template with variables |
| `extractPlaceholders(text)` | `sync` | Extract `{{variable}}` placeholders |
| `validateTemplate(template)` | `sync` | Validate template structure |
| `buildVariablesFromContext(client?, order?, clothier?)` | `sync` | Build variables from context objects |
| `AVAILABLE_VARIABLES` | `const` | All available template variables |
| `SAMPLE_VARIABLES` | `const` | Sample data for template preview |

### Scheduled

| Export | Type | Description |
|--------|------|-------------|
| `getScheduledEmails(db, options?)` | `async` | List scheduled emails |
| `getScheduledEmail(db, id)` | `async` | Get single scheduled email |
| `getPendingToSend(db)` | `async` | Get emails due for delivery |
| `scheduleEmail(db, input, callbacks?)` | `async` | Schedule email for future delivery |
| `cancelScheduledEmail(db, id, callbacks?)` | `async` | Cancel a pending email |
| `markAsProcessing(db, id)` | `async` | Mark as being sent |
| `markAsSent(db, id, callbacks?)` | `async` | Mark as successfully sent |
| `markAsFailed(db, id, errorMessage, callbacks?)` | `async` | Mark as failed with reason |
| `retryScheduledEmail(db, id)` | `async` | Reset failed email for retry |

### Discovery

| Export | Type | Description |
|--------|------|-------------|
| `discoverProvider(email, options?)` | `async` | Auto-detect provider settings |

### Error Registry

| Export | Type | Description |
|--------|------|-------------|
| `emailError(code, context?)` | `sync` | Generate error with ref |
| `templateError(code, context?)` | `sync` | Alias for template errors |
| `EMAIL_ENGINE_ERRORS` | `Record` | Full error registry |
| `EMAIL_ERRORS` | `Record` | Email-specific subset |
| `TEMPLATE_ERRORS` | `Record` | Template-specific subset |

---

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/email test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/email test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-email-v1 pnpm --filter @ordinatio/email test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`

---

## License

Private — part of the System 1701 monorepo.
