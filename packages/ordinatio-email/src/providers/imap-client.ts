// ===========================================
// IMAP CLIENT — ImapFlow Wrapper
// ===========================================
// Wraps ImapFlow for IMAP operations.
// ===========================================

import { emailError } from '../errors';
import type { ImapSmtpCredentials, ListMessagesOptions, ListMessagesResult, MessageSummary, FullMessage, Attachment } from './types';

// ─── Types ───

interface ImapClientOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

interface ImapMailbox {
  exists: number;
  name: string;
}

interface ImapMessage {
  uid: number;
  envelope: {
    messageId?: string;
    inReplyTo?: string;
    subject?: string;
    from?: Array<{ name?: string; address?: string }>;
    to?: Array<{ name?: string; address?: string }>;
    date?: Date;
  };
  flags: Set<string>;
  bodyStructure?: unknown;
  source?: Buffer;
}

// ─── Connection ───

export async function createImapConnection(credentials: ImapSmtpCredentials): Promise<ImapClientOptions> {
  return {
    host: credentials.imapHost,
    port: credentials.imapPort,
    secure: credentials.imapSecurity === 'ssl',
    auth: {
      user: credentials.username,
      pass: credentials.password,
    },
  };
}

/**
 * Test IMAP connectivity — attempt to connect and list folders.
 */
export async function testImapConnection(credentials: ImapSmtpCredentials): Promise<{
  connected: boolean;
  folderCount: number;
  messageCount: number;
  errors: string[];
}> {
  try {
    // Dynamic import — imapflow is an optional peer dependency
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: credentials.imapSecurity === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      logger: false,
    });

    await client.connect();
    const folders = await client.list();
    const inbox = await client.getMailboxLock('INBOX');
    const mailbox = client.mailbox;
    const messageCount = mailbox && typeof mailbox === 'object' && 'exists' in mailbox ? (mailbox as { exists: number }).exists : 0;
    inbox.release();
    await client.logout();

    return {
      connected: true,
      folderCount: folders.length,
      messageCount,
      errors: [],
    };
  } catch (err) {
    return {
      connected: false,
      folderCount: 0,
      messageCount: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Fetch messages from IMAP server.
 */
export async function fetchImapMessages(
  credentials: ImapSmtpCredentials,
  options?: ListMessagesOptions
): Promise<ListMessagesResult> {
  try {
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: credentials.imapSecurity === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const maxResults = options?.maxResults ?? 50;
      const cursorUid = options?.cursor ? parseInt(options.cursor, 10) : undefined;

      // Build search range
      const range = cursorUid ? `1:${cursorUid - 1}` : '*';
      const messages: MessageSummary[] = [];

      // Fetch messages with envelope data
      for await (const msg of client.fetch(range, {
        envelope: true,
        flags: true,
        uid: true,
      }, { changedSince: options?.after ? BigInt(0) : undefined })) {
        const env = (msg as unknown as ImapMessage).envelope;
        const from = env.from?.[0];
        const to = env.to?.[0];

        messages.push({
          providerId: String((msg as unknown as ImapMessage).uid),
          subject: env.subject ?? '(no subject)',
          fromEmail: from?.address ?? '',
          fromName: from?.name,
          toEmail: to?.address ?? '',
          snippet: '', // IMAP doesn't provide snippets without fetching body
          date: env.date ?? new Date(),
          hasAttachments: false, // Would need BODYSTRUCTURE parsing
        });

        if (messages.length >= maxResults) break;
      }

      // Threading via Message-ID / In-Reply-To (no native thread support)
      // Thread assignment is done at the service layer using thread-fingerprint

      const nextCursor = messages.length > 0
        ? messages[messages.length - 1].providerId
        : undefined;

      return { messages: messages.reverse(), nextCursor };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    const error = emailError('EMAIL_612', {
      host: credentials.imapHost,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}

/**
 * Fetch a single message with full body.
 */
export async function fetchImapMessage(
  credentials: ImapSmtpCredentials,
  messageUid: string
): Promise<FullMessage> {
  try {
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');

    const client = new ImapFlow({
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: credentials.imapSecurity === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const uid = parseInt(messageUid, 10);
      const source = await client.download(String(uid), undefined, { uid: true });

      if (!source) {
        throw new Error(`Message ${messageUid} not found`);
      }

      // Collect stream into buffer
      const chunks: Buffer[] = [];
      for await (const chunk of source.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks);

      // Parse with mailparser
      const parsed = await simpleParser(raw);
      const from = parsed.from?.value?.[0];
      const to = Array.isArray(parsed.to)
        ? parsed.to[0]?.value?.[0]
        : parsed.to?.value?.[0];

      const attachments: Attachment[] = (parsed.attachments ?? []).map((att, i) => ({
        providerId: `${messageUid}-att-${i}`,
        name: att.filename ?? `attachment-${i}`,
        mimeType: att.contentType,
        size: att.size,
      }));

      return {
        providerId: messageUid,
        subject: parsed.subject ?? '(no subject)',
        fromEmail: from?.address ?? '',
        fromName: from?.name,
        toEmail: to?.address ?? '',
        snippet: (parsed.text ?? '').substring(0, 200),
        date: parsed.date ?? new Date(),
        hasAttachments: attachments.length > 0,
        bodyHtml: parsed.html || undefined,
        bodyText: parsed.text || undefined,
        attachments,
      };
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    const error = emailError('EMAIL_612', {
      uid: messageUid,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}

/**
 * Archive a message by moving to Archive folder or flagging as deleted.
 */
export async function archiveImapMessage(
  credentials: ImapSmtpCredentials,
  messageUid: string,
  archiveFolder = 'Archive'
): Promise<void> {
  try {
    const { ImapFlow } = await import('imapflow');

    const client = new ImapFlow({
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: credentials.imapSecurity === 'ssl',
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const uid = parseInt(messageUid, 10);

      // Try to move to Archive folder
      try {
        await client.messageMove(String(uid), archiveFolder, { uid: true });
      } catch {
        // If Archive folder doesn't exist, flag as deleted
        await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
      }
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err) {
    const error = emailError('EMAIL_612', {
      action: 'archive',
      uid: messageUid,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}
