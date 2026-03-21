// ===========================================
// GMAIL PROVIDER: AUTH & TOKEN MANAGEMENT
// ===========================================

import { google } from 'googleapis';
import type { TokenSet, Attachment } from './types';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOAuth2Client(): any {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.'
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function parseEmailAddress(header: string): { name?: string; email: string } {
  const match = header.match(/^(?:"?(.+?)"?\s)?<?([^\s<>]+@[^\s<>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].toLowerCase(),
    };
  }
  return { email: header.toLowerCase() };
}

export function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string | undefined {
  const header = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? undefined;
}

export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function extractBody(payload: any): { html?: string; text?: string } {
  const result: { html?: string; text?: string } = {};

  function processPartRecursive(part: any) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      result.html = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      result.text = decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      part.parts.forEach(processPartRecursive);
    }
  }

  processPartRecursive(payload);
  return result;
}

export function extractAttachments(payload: any, messageId: string): Attachment[] {
  const attachments: Attachment[] = [];

  function processPartRecursive(part: any) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        providerId: part.body.attachmentId,
        name: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
      });
    }
    if (part.parts) {
      part.parts.forEach(processPartRecursive);
    }
  }

  processPartRecursive(payload);
  return attachments;
}

export function getAuthUrl(state?: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  return {
    accessToken: credentials.access_token,
    refreshToken: refreshToken,
    expiresAt: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
  };
}
