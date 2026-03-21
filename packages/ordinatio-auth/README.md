# @ordinatio/auth

Authentication security primitives for any Node.js application — account lockout with exponential backoff, password strength validation, session security with suspicious activity detection, and CSRF protection with HMAC-SHA256 signed tokens.

Zero framework dependencies. Pure Node.js `crypto`. Works with any auth library (better-auth, Passport, NextAuth, custom).

**369 tests. 29 error codes. 7 source files.**

## Installation

```bash
npm install @ordinatio/auth
```

Or via the Ordinatio Domus orchestrator:

```bash
npx ordinatio add auth
```

## Quick Start

```typescript
import {
  recordLoginAttempt,
  checkAccountLockout,
  validatePasswordStrength,
  checkSessionValidity,
  detectSuspiciousActivity,
  generateCsrfToken,
  validateCsrfTokens,
} from '@ordinatio/auth';

// 1. Check lockout before authentication
const lockout = checkAccountLockout('user@example.com');
if (lockout.locked) {
  return res.status(403).json({ error: lockout.reason });
}

// 2. Validate password strength on registration
const strength = validatePasswordStrength('MyP@ssw0rd!xyz');
if (!strength.valid) {
  return res.status(400).json({ errors: strength.errors });
}

// 3. Record login attempts (success or failure)
recordLoginAttempt({
  email: 'user@example.com',
  ip: request.ip,
  timestamp: new Date(),
  success: false,
});

// 4. Check session validity
const session = { id: 'sess-1', userId: 'u-1', createdAt, lastActiveAt, ip: '1.2.3.4' };
const validity = checkSessionValidity(session);
if (!validity.valid) {
  return redirect('/login');
}

// 5. Detect suspicious activity
const suspicious = detectSuspiciousActivity(session, request.ip, {
  country: geolocate(request.ip),
});
if (suspicious.recommendation === 'block') {
  return res.status(403).json({ error: 'Suspicious activity detected' });
}

// 6. CSRF protection
const secret = process.env.AUTH_SECRET;
const token = generateCsrfToken(secret);
// ... set as cookie, include in forms/headers ...
const result = validateCsrfTokens(requestToken, cookieToken, secret);
if (!result.valid) {
  return res.status(403).json({ error: result.error, code: result.code });
}
```

## Architecture

```
@ordinatio/auth
├── lockout.ts      Login attempt tracking, exponential backoff lockout
├── password.ts     Password strength validation (zero deps)
├── session.ts      Session validity, suspicious activity detection
├── csrf.ts         CSRF token generation, parsing, validation (HMAC-SHA256)
├── errors.ts       29 error codes (AUTH_100-404) with diagnostic metadata
├── types.ts        All type definitions
└── index.ts        Barrel exports
```

All functions are **pure utilities** — no database, no framework, no env vars. Functions that need secrets (CSRF) take them as parameters. Functions that need logging accept an optional `AuthCallbacks` object.

## Modules

### Account Lockout

Brute-force protection with exponential backoff. After 5 failed attempts in 15 minutes, the account locks with escalating durations.

```typescript
import {
  recordLoginAttempt,
  checkAccountLockout,
  unlockAccount,
  AUTH_LOCKOUT_CONFIG,
} from '@ordinatio/auth';
```

**Lockout escalation:**

| Level | Duration | Trigger |
|-------|----------|---------|
| 1 | 5 minutes | First lockout (5 failed in 15 min) |
| 2 | 15 minutes | Second lockout |
| 3 | 1 hour | Third lockout |
| 4 | 24 hours | Fourth+ lockout |

Lockout level resets to 0 after 7 days of no lockouts. Successful login clears failed attempts.

```typescript
// Record a failed login
recordLoginAttempt({
  email: 'user@example.com',
  ip: '192.168.1.1',
  timestamp: new Date(),
  success: false,
  userAgent: request.headers['user-agent'],
});

// Check before allowing login
const status = checkAccountLockout('user@example.com');
// { locked: false, failedAttempts: 3, lockoutLevel: 0 }
// OR
// { locked: true, unlockAt: Date, reason: '...', failedAttempts: 5, lockoutLevel: 1 }

// Admin unlock
unlockAccount('user@example.com', true); // true = also reset lockout level
```

**Storage:** In-memory `Map`. Replace with Redis in production for multi-instance deployments. Automatic cleanup runs every 5 minutes (removes expired records).

### Password Validation

Comprehensive password strength checking with 11 validation rules. Zero dependencies.

```typescript
import { validatePasswordStrength, AUTH_PASSWORD_CONFIG } from '@ordinatio/auth';

const result = validatePasswordStrength('MyP@ssw0rd!xyz', {
  username: 'jdoe',
  email: 'jdoe@example.com',
});
// { valid: true, score: 85, errors: [], suggestions: [] }

const weak = validatePasswordStrength('password123');
// { valid: false, score: 15, errors: ['Password must contain...', ...], suggestions: ['Use a passphrase...'] }
```

**Validation checks:**

| Check | Requirement |
|-------|-------------|
| Minimum length | 12 characters |
| Character classes | Upper + lower + number + special |
| Common passwords | 200+ passwords with leet-speak reversal (p@ssw0rd -> password) |
| Keyboard patterns | qwerty, asdfgh, 123456, and reversed |
| Consecutive chars | Max 3 identical in a row |
| Unique chars | Minimum 8 unique characters |
| Personal info | Username and email not in password |

Returns a `score` (0-100) and actionable `suggestions` for weak passwords.

### Session Security

Session validity checking (inactivity timeout + absolute lifetime) and suspicious activity detection with 5 real-time checks.

```typescript
import {
  checkSessionValidity,
  detectSuspiciousActivity,
  invalidateUserSessions,
  AUTH_SESSION_CONFIG,
  AUTH_SUSPICIOUS_CONFIG,
} from '@ordinatio/auth';
```

**Session timeouts:**

| Config | Default | Purpose |
|--------|---------|---------|
| `inactivityTimeoutMs` | 30 minutes | Idle timeout |
| `absoluteLifetimeMs` | 24 hours | Maximum session age |
| `timeoutWarningMs` | 5 minutes | Warning before expiry |
| `activityRefreshThresholdMs` | 5 minutes | Refresh debounce |

```typescript
const result = checkSessionValidity(session);
// { valid: true, shouldRefresh: true, remainingTime: 1500000 }
// { valid: false, reason: 'SESSION_INACTIVE' }
// { valid: false, reason: 'SESSION_EXPIRED' }
```

**Suspicious activity detection:**

| Check | Flag Type | Severity |
|-------|-----------|----------|
| Multiple IPs (>2 per session) | `MULTIPLE_IPS` | medium/high |
| Country change within minutes | `IMPOSSIBLE_TRAVEL` | high |
| Login at 2-5 AM UTC | `UNUSUAL_TIME` | low |
| >60 requests/minute | `RAPID_REQUESTS` | medium/high |
| Internal IP in production | `KNOWN_BAD_IP` | medium |

```typescript
const result = detectSuspiciousActivity(session, '203.0.113.1', {
  country: 'US',
  userAgent: 'Mozilla/5.0...',
});

// Result includes risk level and recommendation
// { suspicious: false, riskLevel: 'low', flags: [], recommendation: 'allow' }
// { suspicious: true, riskLevel: 'high', flags: [...], recommendation: 'challenge' }
// { suspicious: true, riskLevel: 'critical', flags: [...], recommendation: 'block' }
```

**Risk escalation:**

| Condition | Risk Level | Recommendation |
|-----------|-----------|----------------|
| No flags | low | allow |
| 1+ low/medium flags | low | notify |
| 2+ medium flags OR 1 high | medium-high | challenge |
| 2+ high flags | critical | block |

### CSRF Protection

Double-submit cookie pattern with HMAC-SHA256 signed tokens. Uses Node.js `crypto` only — works anywhere.

```typescript
import {
  generateCsrfToken,
  parseToken,
  verifySignature,
  isTokenExpired,
  extractCsrfToken,
  validateCsrfTokens,
  csrfErrorResponse,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_FORM_FIELD,
  TOKEN_VALIDITY_MS,
} from '@ordinatio/auth';
```

**Token format:** `base64url(timestamp:random:hmac)`
- `timestamp` — Unix ms (for expiration checks)
- `random` — 32 bytes of `crypto.randomBytes` (for uniqueness)
- `hmac` — HMAC-SHA256 of `timestamp:random` (for integrity)

**Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `CSRF_COOKIE_NAME` | `__Host-csrf` | Cookie name (with `__Host-` prefix for security) |
| `CSRF_HEADER_NAME` | `x-csrf-token` | Header for AJAX requests |
| `CSRF_FORM_FIELD` | `_csrf` | Hidden form field name |
| `TOKEN_VALIDITY_MS` | 3,600,000 (1 hour) | Token expiration |

```typescript
const secret = process.env.AUTH_SECRET;

// Generate a token
const token = generateCsrfToken(secret);

// Parse and inspect
const parsed = parseToken(token);
// { timestamp: 1709827200000, random: 'a1b2c3...', signature: 'f4e5d6...' }

// Verify signature integrity
verifySignature(parsed, secret); // true

// Check expiration
isTokenExpired(parsed); // false (within 1 hour)
isTokenExpired(parsed, 5 * 60 * 1000); // custom 5-minute validity

// Extract from incoming request (checks header, then JSON body, then form body)
const requestToken = await extractCsrfToken(request);

// Full validation (6 checks: both exist, both parse, both verify, both fresh, both match)
const result = validateCsrfTokens(requestToken, cookieToken, secret);
// { valid: true }
// { valid: false, error: 'CSRF cookie not found', code: 'MISSING_COOKIE' }
// { valid: false, error: 'Invalid CSRF token signature', code: 'SIGNATURE_MISMATCH' }

// Pre-built 403 response for failures
if (!result.valid) {
  return csrfErrorResponse(result); // Response with JSON body + 403 status
}
```

**Validation codes:**

| Code | Meaning |
|------|---------|
| `MISSING_COOKIE` | No `__Host-csrf` cookie in request |
| `MISSING_TOKEN` | No `x-csrf-token` header or `_csrf` body field |
| `INVALID_FORMAT` | Token doesn't parse (not base64url or wrong structure) |
| `SIGNATURE_MISMATCH` | HMAC verification failed (tampered or wrong secret) |
| `EXPIRED` | Token older than 1 hour |
| `TOKEN_MISMATCH` | Cookie and request tokens don't match |

## Callback Injection

All functions that produce log output accept an optional `AuthCallbacks` parameter. This replaces direct logger dependencies so the package stays framework-agnostic.

```typescript
import type { AuthCallbacks } from '@ordinatio/auth';

const callbacks: AuthCallbacks = {
  log: (level, message, data) => {
    // Route to your logger: winston, pino, console, etc.
    myLogger[level](message, data);
  },
};

// Pass callbacks to any function that supports them
recordLoginAttempt(attempt, callbacks);
checkAccountLockout(email, callbacks);
checkSessionValidity(session, callbacks);
detectSuspiciousActivity(session, ip, options, callbacks);
unlockAccount(email, resetLevel, callbacks);
```

Functions that don't need logging (password validation, CSRF crypto) don't accept callbacks.

## Error Registry

29 error codes organized into 4 categories, each with diagnostic metadata for debugging.

```typescript
import { authError, AUTH_ERRORS } from '@ordinatio/auth';

// Generate a timestamped reference
const { code, ref } = authError('AUTH_101');
// { code: 'AUTH_101', ref: 'AUTH_101-20260306T143000' }

// Look up diagnostic info
const info = AUTH_ERRORS.AUTH_101;
// {
//   code: 'AUTH_101',
//   httpStatus: 403,
//   severity: 'warn',
//   recoverable: true,
//   description: 'Login blocked — account is locked out.',
//   diagnosis: [
//     'Too many failed login attempts triggered lockout',
//     'Check checkAccountLockout() result for lockoutLevel and unlockAt',
//     'Admin can call unlockAccount() to manually unlock',
//     'Lockout levels: 5min -> 15min -> 1hr -> 24hr (exponential backoff)',
//   ],
// }
```

**Error code ranges:**

| Range | Category | Count |
|-------|----------|-------|
| AUTH_100-106 | Login / Logout | 7 |
| AUTH_200-206 | Session Management | 7 |
| AUTH_300-306 | Password / Lockout | 7 |
| AUTH_400-404 | CSRF Protection | 5 |

Every error includes `file`, `function`, `httpStatus`, `severity`, `recoverable`, `description`, and `diagnosis[]` (ordered troubleshooting steps).

## Integration with Domus

When used through `@ordinatio/domus`, the auth module is automatically wrapped with the domus callback system:

```typescript
import { createDomus } from '@ordinatio/domus';

const app = await createDomus({
  modules: ['auth', 'email', 'tasks'],
});

// Auth API is pre-wired with logging callbacks
const lockout = app.auth.checkLockout('user@example.com');
app.auth.recordAttempt({ email, ip, timestamp: new Date(), success: false });
const strength = app.auth.validatePassword('MyP@ssw0rd!xyz');
const csrf = app.auth.validateCsrf(requestToken, cookieToken, secret);
```

Auth has no cross-module wiring — it's foundational. Other modules may depend on it, but it doesn't depend on them.

**Prisma schema fragment** (`auth.prisma`): 4 models — `User`, `Session`, `Account`, `Verification`. Compatible with better-auth. Models are managed by the auth framework, not by Ordinatio seeds.

**Feature flags:** `CSRF_PROTECTION`, `ACCOUNT_LOCKOUT` (both enabled by default when auth module is active).

## Framework Integration Example

Here's how System 1701 integrates `@ordinatio/auth` with Next.js:

```typescript
// services/auth/index.ts — App-layer bridge
import { createLogger } from '@/lib/logger';
import {
  recordLoginAttempt as _recordLoginAttempt,
  checkAccountLockout as _checkAccountLockout,
  type AuthCallbacks,
  type LoginAttempt,
} from '@ordinatio/auth';

const authLogger = createLogger({ module: 'auth-security' });

const callbacks: AuthCallbacks = {
  log: (level, message, data) => authLogger[level](message, data),
};

// Wrap with pre-injected callbacks
export function recordLoginAttempt(attempt: LoginAttempt) {
  return _recordLoginAttempt(attempt, callbacks);
}

export function checkAccountLockout(email: string) {
  return _checkAccountLockout(email, callbacks);
}

// Re-export pure functions directly (no wrapping needed)
export { validatePasswordStrength, generateCsrfToken, ... } from '@ordinatio/auth';
```

```typescript
// lib/csrf-token.ts — CSRF with Next.js cookies
import { cookies } from 'next/headers';
import { generateCsrfToken as _generateCsrfToken } from '@ordinatio/auth';

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.AUTH_SECRET || '';

export function generateCsrfToken(): string {
  return _generateCsrfToken(CSRF_SECRET);
}

export async function setCsrfCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('__Host-csrf', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  });
}
```

## Testing Utilities

```typescript
import {
  _resetLoginAttemptStore,
  _resetSessionActivityStore,
  _getLoginAttempts,
  _getSessionActivity,
  _generateTestToken,
} from '@ordinatio/auth';

beforeEach(() => {
  _resetLoginAttemptStore();
  _resetSessionActivityStore();
});

// Generate a token with a specific timestamp (for expiration tests)
const expiredToken = _generateTestToken(Date.now() - 2 * 60 * 60 * 1000, secret);
```

## API Reference

### Functions

| Function | Module | Description |
|----------|--------|-------------|
| `recordLoginAttempt(attempt, callbacks?)` | lockout | Record a login attempt |
| `checkAccountLockout(email, callbacks?)` | lockout | Check if account is locked |
| `unlockAccount(email, resetLevel?, callbacks?)` | lockout | Admin unlock |
| `validatePasswordStrength(password, context?)` | password | Validate password strength |
| `checkSessionValidity(session, callbacks?)` | session | Check session timeout/lifetime |
| `invalidateUserSessions(userId, reason, callbacks?)` | session | Force logout all sessions |
| `detectSuspiciousActivity(session, ip, options?, callbacks?)` | session | Detect suspicious patterns |
| `generateCsrfToken(secret)` | csrf | Generate signed CSRF token |
| `parseToken(token)` | csrf | Parse token into components |
| `verifySignature(parsed, secret)` | csrf | Verify HMAC signature |
| `isTokenExpired(parsed, validityMs?)` | csrf | Check token expiration |
| `extractCsrfToken(request)` | csrf | Extract token from Request |
| `validateCsrfTokens(requestToken, cookieToken, secret)` | csrf | Full 6-check validation |
| `csrfErrorResponse(result)` | csrf | Pre-built 403 Response |
| `authError(code)` | errors | Generate timestamped error ref |

### Types

| Type | Description |
|------|-------------|
| `AuthCallbacks` | `{ log?: (level, message, data?) => void }` |
| `LoginAttempt` | `{ email, ip, timestamp, success, userAgent? }` |
| `AccountLockoutStatus` | `{ locked, unlockAt?, reason?, failedAttempts, lockoutLevel }` |
| `PasswordStrengthResult` | `{ valid, score, errors[], suggestions[] }` |
| `Session` | `{ id, userId, createdAt, lastActiveAt, ip, userAgent?, country? }` |
| `SessionValidityResult` | `{ valid, reason?, shouldRefresh?, remainingTime? }` |
| `SuspiciousActivityResult` | `{ suspicious, riskLevel, flags[], recommendation }` |
| `SuspiciousFlag` | `{ type, description, severity, metadata? }` |
| `ParsedToken` | `{ timestamp, random, signature }` |
| `CsrfValidationResult` | `{ valid, error?, code? }` |

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/auth test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/auth test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-auth-v1 pnpm --filter @ordinatio/auth test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`

## License

MIT
