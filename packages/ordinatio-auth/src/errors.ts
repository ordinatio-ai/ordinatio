// ===========================================
// @ordinatio/auth — Error Registry (AUTH_100-404)
// ===========================================
// Login/logout, session management, password/lockout,
// and CSRF error codes.
// Rule 8: unique timestamped ref + diagnostic metadata.
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function authError(code: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  const def = AUTH_ERRORS[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'AUTH',
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
    module: 'AUTH',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

export const AUTH_ERRORS = {
  // ===========================
  // 100-106: Login / Logout
  // ===========================
  AUTH_100: {
    code: 'AUTH_100',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-in)',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Login failed — invalid email or password.',
    diagnosis: [
      'User entered wrong credentials',
      'Email may not exist in the database',
      'Password hash comparison returned false',
      'Check better-auth logs for rejection reason',
    ],
  },
  AUTH_101: {
    code: 'AUTH_101',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-in)',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Login blocked — account is locked out.',
    diagnosis: [
      'Too many failed login attempts triggered lockout',
      'Check checkAccountLockout() result for lockoutLevel and unlockAt',
      'Admin can call unlockAccount() to manually unlock',
      'Lockout levels: 5min -> 15min -> 1hr -> 24hr (exponential backoff)',
    ],
  },
  AUTH_102: {
    code: 'AUTH_102',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-in)',
    httpStatus: 429,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Login rate-limited — too many requests.',
    diagnosis: [
      'Rate limiter triggered before auth check',
      'May indicate brute force attack from single IP',
      'Check rate-limit configuration and IP-based tracking',
    ],
  },
  AUTH_103: {
    code: 'AUTH_103',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-in)',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Login failed — unexpected server error during authentication.',
    diagnosis: [
      'Database connection may be down (check DATABASE_URL)',
      'better-auth internal error — check server logs',
      'Prisma adapter may have thrown during user lookup',
    ],
  },
  AUTH_104: {
    code: 'AUTH_104',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-out)',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Logout failed — session invalidation error.',
    diagnosis: [
      'Database error deleting session record',
      'Session may already be expired or deleted',
      'Check better-auth session storage configuration',
    ],
  },
  AUTH_105: {
    code: 'AUTH_105',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-up)',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Registration failed — validation error.',
    diagnosis: [
      'Email may already be registered',
      'Password did not meet strength requirements (see AUTH_300)',
      'Required fields missing from registration body',
      'Check Zod validation error details in response',
    ],
  },
  AUTH_106: {
    code: 'AUTH_106',
    file: 'api/auth/[...all]/route.ts',
    function: 'POST (sign-up)',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Registration failed — server error creating user.',
    diagnosis: [
      'Database connection may be down',
      'Prisma unique constraint violation on email (race condition)',
      'Check better-auth createUser flow for errors',
    ],
  },

  // ===========================
  // 200-206: Session Management
  // ===========================
  AUTH_200: {
    code: 'AUTH_200',
    file: 'lib/auth-session.ts',
    function: 'checkSessionValidity',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Session expired — absolute lifetime exceeded (24 hours).',
    diagnosis: [
      'Session has been active longer than AUTH_SESSION_CONFIG.absoluteLifetimeMs',
      'User must re-authenticate',
      'Check session.createdAt vs current time',
    ],
  },
  AUTH_201: {
    code: 'AUTH_201',
    file: 'lib/auth-session.ts',
    function: 'checkSessionValidity',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Session expired — inactivity timeout (30 minutes).',
    diagnosis: [
      'No activity within AUTH_SESSION_CONFIG.inactivityTimeoutMs window',
      'User must re-authenticate',
      'Check session.lastActiveAt vs current time',
    ],
  },
  AUTH_202: {
    code: 'AUTH_202',
    file: 'lib/auth-session.ts',
    function: 'detectSuspiciousActivity',
    httpStatus: 403,
    severity: 'error' as const,
    recoverable: false,
    description: 'Session blocked — suspicious activity detected (critical risk).',
    diagnosis: [
      'Multiple high-severity flags triggered (e.g., impossible travel + multiple IPs)',
      'Recommendation is "block" — session should be terminated',
      'Check SuspiciousActivityResult.flags for specific triggers',
      'Review session IP history in sessionActivityStore',
    ],
  },
  AUTH_203: {
    code: 'AUTH_203',
    file: 'lib/auth-session.ts',
    function: 'detectSuspiciousActivity',
    httpStatus: 200,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Suspicious activity flagged — session allowed with challenge.',
    diagnosis: [
      'Medium/high severity flags detected but not critical',
      'Recommendation is "challenge" — prompt for re-authentication',
      'Check SuspiciousActivityResult.flags for MULTIPLE_IPS, IMPOSSIBLE_TRAVEL, etc.',
    ],
  },
  AUTH_204: {
    code: 'AUTH_204',
    file: 'lib/auth-session.ts',
    function: 'invalidateUserSessions',
    httpStatus: null,
    severity: 'info' as const,
    recoverable: true,
    description: 'All sessions invalidated for user (e.g., after password change).',
    diagnosis: [
      'This is an expected operation, not an error',
      'Triggered by password change, admin action, or security event',
      'Check reason parameter for trigger context',
    ],
  },
  AUTH_205: {
    code: 'AUTH_205',
    file: 'lib/auth-session.ts',
    function: 'detectSuspiciousActivity',
    httpStatus: 200,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Impossible travel detected — country change within minutes.',
    diagnosis: [
      'Session accessed from different countries in rapid succession',
      'May indicate session hijacking or VPN usage',
      'Check session activity locations array for country changes',
      'Review IP geolocation data for accuracy',
    ],
  },
  AUTH_206: {
    code: 'AUTH_206',
    file: 'lib/auth-session.ts',
    function: 'detectSuspiciousActivity',
    httpStatus: 200,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Rapid request rate detected — possible automated access.',
    diagnosis: [
      'More than 60 requests per minute from single session',
      'May indicate scraping, automated tools, or compromised session',
      'Check requestTimestamps count vs rapidRequestThreshold',
    ],
  },

  // ===========================
  // 300-306: Password / Lockout
  // ===========================
  AUTH_300: {
    code: 'AUTH_300',
    file: 'lib/auth-password.ts',
    function: 'validatePasswordStrength',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Password rejected — failed strength validation.',
    diagnosis: [
      'Password did not meet one or more requirements',
      'Check PasswordStrengthResult.errors for specific failures',
      'Requirements: 12+ chars, upper+lower+number+special, not common, 8+ unique chars',
    ],
  },
  AUTH_301: {
    code: 'AUTH_301',
    file: 'lib/auth-password.ts',
    function: 'validatePasswordStrength',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Password rejected — matches common password list.',
    diagnosis: [
      'Password or a leet-speak variant appears in the common passwords set',
      'Top ~200 passwords are checked, plus character substitution reversal',
      'Suggest using a passphrase or password manager',
    ],
  },
  AUTH_302: {
    code: 'AUTH_302',
    file: 'lib/auth-password.ts',
    function: 'validatePasswordStrength',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Password rejected — contains keyboard pattern.',
    diagnosis: [
      'Password includes sequential keyboard pattern (qwerty, asdfgh, 123456, etc.)',
      'Also checks reversed patterns',
      'Suggest using random words or a password manager',
    ],
  },
  AUTH_303: {
    code: 'AUTH_303',
    file: 'lib/auth-password.ts',
    function: 'validatePasswordStrength',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Password rejected — contains personal info (username or email).',
    diagnosis: [
      'Password includes the username or email local part',
      'Context parameter must be provided for this check to trigger',
      'Suggest choosing a password unrelated to personal identifiers',
    ],
  },
  AUTH_304: {
    code: 'AUTH_304',
    file: 'lib/auth-lockout.ts',
    function: 'checkAccountLockout',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Account lockout triggered — too many failed login attempts.',
    diagnosis: [
      'User exceeded 5 failed attempts within 15-minute window',
      'Lockout level increased (1-4 with exponential backoff)',
      'Check lockoutLevel and unlockAt in AccountLockoutStatus',
      'Admin can call unlockAccount(email, true) to reset',
    ],
  },
  AUTH_305: {
    code: 'AUTH_305',
    file: 'lib/auth-lockout.ts',
    function: 'recordLoginAttempt',
    httpStatus: null,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Failed login attempt recorded.',
    diagnosis: [
      'This is a tracking event, not a blocking error',
      'Failed attempt count is incrementing toward lockout threshold',
      'Check attemptCount vs AUTH_LOCKOUT_CONFIG.maxAttempts',
    ],
  },
  AUTH_306: {
    code: 'AUTH_306',
    file: 'lib/auth-lockout.ts',
    function: 'unlockAccount',
    httpStatus: null,
    severity: 'info' as const,
    recoverable: true,
    description: 'Account manually unlocked by admin.',
    diagnosis: [
      'Admin action — account lockout cleared',
      'If resetLevel=true, lockout level also reset to 0',
      'Check if the underlying security issue was resolved',
    ],
  },

  // ===========================
  // 400-404: CSRF Protection
  // ===========================
  AUTH_400: {
    code: 'AUTH_400',
    file: 'lib/csrf-validation.ts',
    function: 'validateCsrfTokens',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: true,
    description: 'CSRF validation failed — cookie token missing.',
    diagnosis: [
      'No __Host-csrf cookie found in request',
      'Cookie may have expired (1-hour TTL)',
      'User may have cleared cookies or is in incognito mode',
      'Check that setCsrfCookie() was called during page load',
    ],
  },
  AUTH_401: {
    code: 'AUTH_401',
    file: 'lib/csrf-validation.ts',
    function: 'validateCsrfTokens',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: true,
    description: 'CSRF validation failed — request token missing.',
    diagnosis: [
      'No x-csrf-token header or _csrf body field in request',
      'Frontend must include CSRF token in mutation requests',
      'Check that useCsrfToken() hook is providing the token',
    ],
  },
  AUTH_402: {
    code: 'AUTH_402',
    file: 'lib/csrf-validation.ts',
    function: 'validateCsrfTokens',
    httpStatus: 403,
    severity: 'error' as const,
    recoverable: false,
    description: 'CSRF validation failed — token signature mismatch.',
    diagnosis: [
      'HMAC-SHA256 signature verification failed on cookie or request token',
      'Token may have been tampered with',
      'CSRF_SECRET or AUTH_SECRET may have changed between token creation and validation',
      'This may indicate a CSRF attack — check IP and user agent',
    ],
  },
  AUTH_403: {
    code: 'AUTH_403',
    file: 'lib/csrf-validation.ts',
    function: 'validateCsrfTokens',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: true,
    description: 'CSRF validation failed — token expired.',
    diagnosis: [
      'Token age exceeds TOKEN_VALIDITY_MS (1 hour)',
      'User may have had the page open for too long without interaction',
      'getOrCreateCsrfToken() should rotate tokens approaching expiration',
    ],
  },
  AUTH_404: {
    code: 'AUTH_404',
    file: 'lib/csrf-token.ts',
    function: 'generateCsrfToken',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'CSRF token generation failed — secret not configured.',
    diagnosis: [
      'Neither CSRF_SECRET nor AUTH_SECRET is set in environment',
      'This is a server configuration error, not a client issue',
      'Set AUTH_SECRET in .env.local (also used by better-auth)',
    ],
  },

  // ===========================
  // 307: Password — Breach Check
  // ===========================
  AUTH_307: {
    code: 'AUTH_307',
    file: 'lib/auth-password.ts',
    function: 'validatePasswordStrengthAsync',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Password rejected — found in data breach (HaveIBeenPwned).',
    diagnosis: [
      'Password appeared in a known data breach',
      'User must choose a different password',
      'Breach check uses k-anonymity (only SHA-1 prefix is sent, not full password)',
      'If HIBP API is down, check silently passes (advisory only)',
    ],
  },

  // ===========================
  // 500-504: Capability Tokens
  // ===========================
  AUTH_500: {
    code: 'AUTH_500',
    file: 'capability.ts',
    function: 'createCapabilityToken',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: false,
    description: 'Capability token creation failed — missing secret or capabilities.',
    diagnosis: [
      'Secret parameter is empty or undefined',
      'Capabilities array is empty',
      'TTL is zero or negative',
    ],
  },
  AUTH_501: {
    code: 'AUTH_501',
    file: 'capability.ts',
    function: 'verifyCapabilityToken',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Capability token invalid — signature verification failed.',
    diagnosis: [
      'Token was tampered with or signed with a different secret',
      'Secret may have been rotated since token creation',
      'Check that the same secret is used for creation and verification',
    ],
  },
  AUTH_502: {
    code: 'AUTH_502',
    file: 'capability.ts',
    function: 'verifyCapabilityToken',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Capability token expired.',
    diagnosis: [
      'Token TTL has elapsed',
      'Client should request a new token',
      'Check expiresAt in the validation result for when it expired',
    ],
  },
  AUTH_503: {
    code: 'AUTH_503',
    file: 'capability.ts',
    function: 'verifyCapabilityToken',
    httpStatus: 403,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Capability token missing required capability.',
    diagnosis: [
      'Token is valid but does not grant the required capability',
      'Check token capabilities array vs required capability',
      'Wildcard "*" capability grants all permissions',
    ],
  },
  AUTH_504: {
    code: 'AUTH_504',
    file: 'capability.ts',
    function: 'verifyCapabilityToken',
    httpStatus: 400,
    severity: 'warn' as const,
    recoverable: true,
    description: 'Capability token has invalid format or encoding.',
    diagnosis: [
      'Token is not valid base64url',
      'Token payload is not valid JSON',
      'Token format should be base64url(JSON:signature)',
    ],
  },
} as const;
