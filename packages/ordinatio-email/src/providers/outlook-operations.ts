// ===========================================
// OUTLOOK OPERATIONS — Microsoft Graph API
// ===========================================

import { emailError } from '../errors';
import type {
  ListMessagesOptions,
  ListMessagesResult,
  MessageSummary,
  FullMessage,
  Attachment,
  ReplyOptions,
} from './types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// ─── Helpers ───

async function graphFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = emailError('EMAIL_623', {
      path,
      status: response.status,
      body: body.substring(0, 200),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }

  return response;
}

// ─── Graph Types ───

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress: { name?: string; address?: string } }>;
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  body?: { contentType?: string; content?: string };
}

interface GraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
}

// ─── List Messages ───

export async function listOutlookMessages(
  accessToken: string,
  options?: ListMessagesOptions
): Promise<ListMessagesResult> {
  const maxResults = options?.maxResults ?? 50;
  const params = new URLSearchParams({
    $top: String(maxResults),
    $orderby: 'receivedDateTime desc',
    $select: 'id,conversationId,subject,from,toRecipients,bodyPreview,receivedDateTime,hasAttachments',
  });

  if (options?.after) {
    params.set('$filter', `receivedDateTime ge ${options.after.toISOString()}`);
  }

  // Cursor-based pagination via $skip
  let path = `/me/messages?${params.toString()}`;
  if (options?.cursor) {
    path = options.cursor; // The cursor IS the @odata.nextLink path
  }

  const response = await graphFetch(accessToken, path.startsWith('/') ? path : `/${path}`);
  const data = await response.json() as {
    value: GraphMessage[];
    '@odata.nextLink'?: string;
  };

  const messages: MessageSummary[] = data.value.map((msg) => ({
    providerId: msg.id,
    threadId: msg.conversationId, // Outlook native threading
    subject: msg.subject ?? '(no subject)',
    fromEmail: msg.from?.emailAddress?.address ?? '',
    fromName: msg.from?.emailAddress?.name,
    toEmail: msg.toRecipients?.[0]?.emailAddress?.address ?? '',
    snippet: msg.bodyPreview ?? '',
    date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
    hasAttachments: msg.hasAttachments ?? false,
  }));

  // Extract next page cursor from @odata.nextLink
  const nextLink = data['@odata.nextLink'];
  const nextCursor = nextLink
    ? nextLink.replace(GRAPH_BASE, '')
    : undefined;

  return { messages, nextCursor };
}

// ─── Get Message ───

export async function getOutlookMessage(
  accessToken: string,
  messageId: string
): Promise<FullMessage> {
  const response = await graphFetch(
    accessToken,
    `/me/messages/${messageId}?$select=id,conversationId,subject,from,toRecipients,bodyPreview,receivedDateTime,hasAttachments,body`
  );

  const msg = await response.json() as GraphMessage;
  const from = msg.from?.emailAddress;
  const to = msg.toRecipients?.[0]?.emailAddress;

  // Fetch attachments if present
  let attachments: Attachment[] = [];
  if (msg.hasAttachments) {
    const attResponse = await graphFetch(
      accessToken,
      `/me/messages/${messageId}/attachments?$select=id,name,contentType,size`
    );
    const attData = await attResponse.json() as { value: GraphAttachment[] };
    attachments = attData.value.map((att) => ({
      providerId: att.id,
      name: att.name ?? 'attachment',
      mimeType: att.contentType ?? 'application/octet-stream',
      size: att.size ?? 0,
    }));
  }

  return {
    providerId: msg.id,
    threadId: msg.conversationId,
    subject: msg.subject ?? '(no subject)',
    fromEmail: from?.address ?? '',
    fromName: from?.name,
    toEmail: to?.address ?? '',
    snippet: msg.bodyPreview ?? '',
    date: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
    hasAttachments: attachments.length > 0,
    bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : undefined,
    bodyText: msg.body?.contentType === 'text' ? msg.body.content : undefined,
    attachments,
  };
}

// ─── Get Attachment ───

export async function getOutlookAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<{ data: string; mimeType: string }> {
  const response = await graphFetch(
    accessToken,
    `/me/messages/${messageId}/attachments/${attachmentId}`
  );

  const att = await response.json() as GraphAttachment;

  return {
    data: att.contentBytes ?? '',
    mimeType: att.contentType ?? 'application/octet-stream',
  };
}

// ─── Archive Message ───

export async function archiveOutlookMessage(
  accessToken: string,
  messageId: string
): Promise<void> {
  // Outlook archive = move to Archive folder
  // First, find the Archive folder ID
  const foldersResponse = await graphFetch(
    accessToken,
    '/me/mailFolders?$filter=displayName eq \'Archive\''
  );
  const folders = await foldersResponse.json() as { value: Array<{ id: string }> };

  if (folders.value.length === 0) {
    // No Archive folder — create one
    const createResponse = await graphFetch(accessToken, '/me/mailFolders', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Archive' }),
    });
    const newFolder = await createResponse.json() as { id: string };
    await moveMessage(accessToken, messageId, newFolder.id);
  } else {
    await moveMessage(accessToken, messageId, folders.value[0].id);
  }
}

async function moveMessage(accessToken: string, messageId: string, folderId: string): Promise<void> {
  await graphFetch(accessToken, `/me/messages/${messageId}/move`, {
    method: 'POST',
    body: JSON.stringify({ destinationId: folderId }),
  });
}

// ─── Send Reply ───

export async function sendOutlookReply(
  accessToken: string,
  options: ReplyOptions
): Promise<string> {
  // Use createReply + send pattern for threading
  const createResponse = await graphFetch(
    accessToken,
    `/me/messages/${options.inReplyTo}/createReply`,
    { method: 'POST' }
  );

  const draft = await createResponse.json() as { id: string };

  // Update the draft body
  await graphFetch(accessToken, `/me/messages/${draft.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      body: { contentType: 'html', content: options.bodyHtml },
    }),
  });

  // Send the draft
  await graphFetch(accessToken, `/me/messages/${draft.id}/send`, {
    method: 'POST',
  });

  return draft.id;
}

// ─── Send Email ───

export async function sendOutlookEmail(
  accessToken: string,
  options: { to: string; subject: string; bodyHtml: string }
): Promise<string> {
  const response = await graphFetch(accessToken, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: options.subject,
        body: { contentType: 'html', content: options.bodyHtml },
        toRecipients: [
          { emailAddress: { address: options.to } },
        ],
      },
      saveToSentItems: true,
    }),
  });

  // sendMail returns 202 Accepted with no body
  return `outlook-${Date.now()}`;
}
