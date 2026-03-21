// ===========================================
// OUTLOOK AUTH — Microsoft OAuth2 via MSAL
// ===========================================

import { emailError } from '../errors';
import type { TokenSet } from './types';

// ─── Configuration (from environment) ───

function getConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const error = emailError('EMAIL_620', {
      missing: [
        !clientId && 'MICROSOFT_CLIENT_ID',
        !clientSecret && 'MICROSOFT_CLIENT_SECRET',
        !redirectUri && 'MICROSOFT_REDIRECT_URI',
      ].filter(Boolean).join(', '),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }

  return { clientId, clientSecret, redirectUri };
}

const SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
];

const AUTHORITY = 'https://login.microsoftonline.com/common';
const TOKEN_ENDPOINT = `${AUTHORITY}/oauth2/v2.0/token`;
const AUTH_ENDPOINT = `${AUTHORITY}/oauth2/v2.0/authorize`;

// ─── Auth URL ───

export function getOutlookAuthUrl(state?: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    response_mode: 'query',
  });

  if (state) params.set('state', state);

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ─── Token Exchange ───

export async function exchangeOutlookCode(code: string): Promise<TokenSet> {
  const { clientId, clientSecret, redirectUri } = getConfig();

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: SCOPES.join(' '),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  } catch (err) {
    const error = emailError('EMAIL_621', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}

// ─── Token Refresh ───

export async function refreshOutlookToken(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = getConfig();

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: SCOPES.join(' '),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken, // May or may not rotate
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  } catch (err) {
    const error = emailError('EMAIL_622', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`${error.ref}: ${error.description}`);
  }
}
