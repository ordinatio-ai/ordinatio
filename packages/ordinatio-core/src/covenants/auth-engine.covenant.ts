// IHS
/**
 * Auth Engine Module Covenant (C-02)
 *
 * Tier 1 — BEING (What Exists)
 *
 * Identity, authentication, and session management. Provider-agnostic:
 * better-auth today, any provider tomorrow. Agent identity is first-class —
 * agents are actors in the system, not anonymous background processes.
 *
 * In System 1701: better-auth with email/password, account lockout,
 * session rotation, CSRF protection.
 */

import type { ModuleCovenant } from '../covenant/types';

export const AUTH_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'auth-engine',
    canonicalId: 'C-02',
    version: '0.1.0',
    description:
      'Provider-agnostic identity and authentication engine. Email/password, OAuth, SSO, MFA. Agent identity is first-class. Session management with rotation, timeout, and suspicious activity detection.',
    status: 'canonical',
    tier: 'being',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'User',
        description: 'Authenticated human user with role, email, and session state',
        hasContextLayer: false,
      },
      {
        name: 'Session',
        description: 'Active authentication session with expiry, device info, and rotation state',
        hasContextLayer: false,
      },
      {
        name: 'AgentIdentity',
        description: 'Registered AI agent actor with role assignment and permission bounds',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'auth.login_success',
        description: 'User authenticated successfully',
        payloadShape: '{ userId, method, ip, userAgent }',
      },
      {
        id: 'auth.login_failure',
        description: 'Authentication attempt failed',
        payloadShape: '{ email, reason, ip, userAgent, failureCount }',
      },
      {
        id: 'auth.session_expired',
        description: 'Session expired or was revoked',
        payloadShape: '{ sessionId, userId, reason }',
      },
      {
        id: 'auth.account_locked',
        description: 'Account locked due to too many failed attempts',
        payloadShape: '{ userId, lockedUntil, failureCount }',
      },
      {
        id: 'auth.password_changed',
        description: 'User changed their password',
        payloadShape: '{ userId }',
      },
    ],

    subscriptions: [
      'security-engine.threat_detected', // Lock accounts on brute force detection
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'auth.get_session',
      description: 'Get the current authenticated session and user identity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ user: User, session: Session, organizationId?: string }',
      whenToUse: 'When you need to know who is currently authenticated and their role/permissions.',
    },
    {
      id: 'auth.validate_token',
      description: 'Validate an authentication token and return the associated identity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'token', type: 'string', required: true, description: 'The token to validate' },
      ],
      output: '{ valid: boolean, userId?: string, expiresAt?: string }',
      whenToUse: 'When validating tokens for inter-service or webhook authentication.',
    },
    {
      id: 'auth.list_sessions',
      description: 'List active sessions for a user',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'userId', type: 'string', required: true, description: 'The user ID' },
      ],
      output: '{ sessions: Session[] }',
      whenToUse: 'When reviewing active sessions for security audit or suspicious activity investigation.',
    },

    // --- Act ---
    {
      id: 'auth.revoke_session',
      description: 'Revoke a specific session, forcing re-authentication',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'sessionId', type: 'string', required: true, description: 'The session to revoke' },
      ],
      output: '{ revoked: boolean }',
      whenToUse: 'When a session needs to be terminated — suspicious activity, user request, or security incident.',
    },
    {
      id: 'auth.unlock_account',
      description: 'Unlock a locked account before the lockout period expires',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'userId', type: 'string', required: true, description: 'The locked user account' },
      ],
      output: '{ unlocked: boolean }',
      whenToUse: 'When a legitimate user is locked out and needs immediate access.',
    },

    // --- Govern ---
    {
      id: 'auth.revoke_all_sessions',
      description: 'Revoke ALL sessions for a user — forces re-authentication everywhere. DISRUPTIVE.',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'userId', type: 'string', required: true, description: 'The user whose sessions to revoke' },
        { name: 'reason', type: 'string', required: true, description: 'Why all sessions are being revoked' },
      ],
      output: '{ revokedCount: number }',
      whenToUse: 'RARELY. Only during security incidents (compromised credentials, account takeover). Disrupts the user.',
      pitfalls: [
        'Revokes ALL active sessions — user must re-authenticate on every device',
        'Use auth.revoke_session for targeted session termination',
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Every request has an authenticated actor (user, agent, or system)',
      'Failed authentication attempts are always recorded',
      'Sessions rotate periodically to prevent fixation',
      'Account lockout activates after configurable failed attempts',
      'Passwords meet minimum strength requirements before storage',
      'Auth tokens are never logged or exposed in error messages',
    ],
    neverHappens: [
      'A request proceeds without identity resolution',
      'Credentials are stored in plaintext',
      'Failed login attempts are silently dropped',
      'A locked account accepts authentication',
      'Auth tokens appear in logs or error responses',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Auth Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
