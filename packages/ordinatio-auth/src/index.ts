// ===========================================
// @ordinatio/auth — Barrel Exports
// ===========================================
// Authentication security, CSRF protection, capability tokens,
// and error registry.
// Zero framework dependencies — pure Node.js.
// ===========================================

// --- Types ---
export type {
  AuthCallbacks,
  LoginAttempt,
  AccountLockoutStatus,
  PasswordStrengthResult,
  PasswordValidationOptions,
  Session,
  SessionValidityResult,
  SuspiciousActivityResult,
  SuspiciousFlag,
  SuspiciousFlagType,
  ParsedToken,
  CsrfValidationResult,
  SecretProvider,
  Secret,
  CapabilityToken,
  CapabilityValidationResult,
} from './types';

// --- Manifest ---
export type { AgentAction, SecurityManifest } from './manifest';
export { buildManifest } from './manifest';

// --- Store ---
export type { SecurityStore, InMemoryStoreConfig } from './store';
export { InMemoryStore } from './store';

// --- Lockout ---
export {
  AUTH_LOCKOUT_CONFIG,
  recordLoginAttempt,
  checkAccountLockout,
  unlockAccount,
  setLockoutStore,
  _resetLoginAttemptStore,
  _getLoginAttempts,
} from './lockout';

// --- Password ---
export {
  AUTH_PASSWORD_CONFIG,
  validatePasswordStrength,
  validatePasswordStrengthAsync,
} from './password';

// --- Session ---
export {
  AUTH_SESSION_CONFIG,
  AUTH_SUSPICIOUS_CONFIG,
  checkSessionValidity,
  invalidateUserSessions,
  detectSuspiciousActivity,
  setSessionStore,
  _resetSessionActivityStore,
  _getSessionActivity,
} from './session';

// --- CSRF ---
export {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_FORM_FIELD,
  TOKEN_VALIDITY_MS,
  generateCsrfToken,
  parseToken,
  verifySignature,
  isTokenExpired,
  extractCsrfToken,
  validateCsrfTokens,
  csrfErrorResponse,
  computeHmac,
  verifyHmac,
  _generateTestToken,
} from './csrf';

// --- Capability Tokens ---
export {
  createCapabilityToken,
  verifyCapabilityToken,
} from './capability';

// --- Errors ---
export {
  authError,
  AUTH_ERRORS,
} from './errors';
