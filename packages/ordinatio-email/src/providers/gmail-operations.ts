// ===========================================
// GMAIL PROVIDER: EMAIL OPERATIONS
// ===========================================

import { google } from 'googleapis';
import type {
  ListMessagesOptions,
  ListMessagesResult,
  MessageSummary,
  FullMessage,
  ReplyOptions,
} from './types';
import { withRetry, isGoogleApiRetryable } from './retry';
import {
  getOAuth2Client,
  getHeader,
  parseEmailAddress,
  extractBody,
  extractAttachments,
} from './gmail-auth';

const GMAIL_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 30000,
  isRetryable: isGoogleApiRetryable,
  onRetry: (attempt: number, error: unknown) => {
    console.warn(`Gmail API retry attempt ${attempt}:`, error);
  },
};

export async function listMessages(
  accessToken: string,
  options?: ListMessagesOptions
): Promise<ListMessagesResult> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let query = 'in:inbox';
  if (options?.after) {
    const timestamp = Math.floor(options.after.getTime() / 1000);
    query += ` after:${timestamp}`;
  }

  const listResponse = await withRetry(
    () => gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: options?.maxResults || 50,
      pageToken: options?.cursor,
    }),
    GMAIL_RETRY_OPTIONS
  );

  const messageIds = listResponse.data.messages || [];

  const messages: MessageSummary[] = await Promise.all(
    messageIds.map(async ({ id }) => {
      const msg = await withRetry(
        () => gmail.users.messages.get({
          userId: 'me',
          id: id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        }),
        GMAIL_RETRY_OPTIONS
      );

      const headers = msg.data.payload?.headers;
      const fromHeader = getHeader(headers, 'From') || '';
      const { name: fromName, email: fromEmail } = parseEmailAddress(fromHeader);
      const toHeader = getHeader(headers, 'To') || '';
      const { email: toEmail } = parseEmailAddress(toHeader);

      return {
        providerId: msg.data.id!,
        threadId: msg.data.threadId || undefined,
        subject: getHeader(headers, 'Subject') || '(No Subject)',
        fromEmail,
        fromName,
        toEmail,
        snippet: msg.data.snippet || '',
        date: new Date(parseInt(msg.data.internalDate || '0', 10)),
        hasAttachments: (msg.data.payload?.parts?.some(
          (p: any) => p.filename && p.body?.attachmentId
        )) || false,
      };
    })
  );

  return {
    messages,
    nextCursor: listResponse.data.nextPageToken || undefined,
  };
}

export async function getMessage(accessToken: string, messageId: string): Promise<FullMessage> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const msg = await withRetry(
    () => gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    }),
    GMAIL_RETRY_OPTIONS
  );

  const headers = msg.data.payload?.headers;
  const fromHeader = getHeader(headers, 'From') || '';
  const { name: fromName, email: fromEmail } = parseEmailAddress(fromHeader);
  const toHeader = getHeader(headers, 'To') || '';
  const { email: toEmail } = parseEmailAddress(toHeader);

  const body = extractBody(msg.data.payload);
  const attachments = extractAttachments(msg.data.payload, messageId);

  return {
    providerId: msg.data.id!,
    threadId: msg.data.threadId || undefined,
    subject: getHeader(headers, 'Subject') || '(No Subject)',
    fromEmail,
    fromName,
    toEmail,
    snippet: msg.data.snippet || '',
    date: new Date(parseInt(msg.data.internalDate || '0', 10)),
    hasAttachments: attachments.length > 0,
    bodyHtml: body.html,
    bodyText: body.text,
    attachments,
  };
}

export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; mimeType: string }> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const attachment = await withRetry(
    () => gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    }),
    GMAIL_RETRY_OPTIONS
  );

  return {
    data: attachment.data.data || '',
    mimeType: 'application/octet-stream',
  };
}

export async function archiveMessage(accessToken: string, messageId: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  await withRetry(
    () => gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    }),
    GMAIL_RETRY_OPTIONS
  );
}

export async function sendReply(accessToken: string, options: ReplyOptions): Promise<string> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const original = await withRetry(
    () => gmail.users.messages.get({
      userId: 'me',
      id: options.inReplyTo,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Message-ID'],
    }),
    GMAIL_RETRY_OPTIONS
  );

  const headers = original.data.payload?.headers;
  const originalFrom = getHeader(headers, 'From') || '';
  const originalSubject = getHeader(headers, 'Subject') || '';
  const originalMessageId = getHeader(headers, 'Message-ID') || '';

  const profile = await withRetry(
    () => gmail.users.getProfile({ userId: 'me' }),
    GMAIL_RETRY_OPTIONS
  );
  const myEmail = profile.data.emailAddress;

  const replySubject = originalSubject.startsWith('Re:')
    ? originalSubject
    : `Re: ${originalSubject}`;

  const messageParts = [
    `From: ${myEmail}`,
    `To: ${originalFrom}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${originalMessageId}`,
    `References: ${originalMessageId}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    options.bodyHtml,
  ];

  const rawMessage = messageParts.join('\r\n');
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sent = await withRetry(
    () => gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: options.threadId,
      },
    }),
    GMAIL_RETRY_OPTIONS
  );

  return sent.data.id!;
}

export async function sendEmail(
  accessToken: string,
  options: { to: string; subject: string; bodyHtml: string; rawMime?: string }
): Promise<string> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let encodedMessage: string;

  if (options.rawMime) {
    encodedMessage = options.rawMime;
  } else {
    const profile = await withRetry(
      () => gmail.users.getProfile({ userId: 'me' }),
      GMAIL_RETRY_OPTIONS
    );
    const myEmail = profile.data.emailAddress;

    const messageParts = [
      `From: ${myEmail}`,
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      options.bodyHtml,
    ];

    const rawMessage = messageParts.join('\r\n');
    encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  const sent = await withRetry(
    () => gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    }),
    GMAIL_RETRY_OPTIONS
  );

  return sent.data.id!;
}
