// ===========================================
// @ordinatio/auth — Types
// ===========================================

import type { SecurityManifest } from './manifest';

/**
 * Callback hooks for auth operations.
 * Replace direct logger dependency with injected callbacks
 * so the package has zero framework dependencies.
 */
export interface AuthCallbacks {
  /** Optional logger callback. */
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: Record<string, unknown>) => void;
}

// --- HSM-compatible secrets ---

/**
 * A provider that delegates signing/verification to an external system (HSM, KMS, etc.).
 */
export interface SecretProvider {
  sign(data: string): string;
  verify(data: string, signature: string): boolean;
}

/** A secret can be a plain string or an HSM-compatible provider. */
export type Secret = string | SecretProvider;

// --- Lockout types ---

export interface LoginAttempt {
  email: string;
  ip: string;
  timestamp: Date;
  success: boolean;
  userAgent?: string;
  /** Optional idempotency key — duplicate keys skip recording. */
  idempotencyKey?: string;
}

export interface AccountLockoutStatus {
  locked: boolean;
  unlockAt?: Date;
  reason?: string;
  failedAttempts: number;
  lockoutLevel: number; // 0 = not locked, 1-4 = increasing severity
  /** Agentic manifest — machine-readable action recommendation. */
  manifest?: SecurityManifest;
}

// --- Password types ---

export interface PasswordStrengthResult {
  valid: boolean;
  score: number; // 0-100
  errors: string[];
  suggestions: string[];
  /** Agentic manifest — machine-readable action recommendation. */
  manifest?: SecurityManifest;
}

/** Options for async password validation (e.g., breach checking). */
export interface PasswordValidationOptions {
  /** Async callback to check if password has been breached (e.g., HIBP). */
  checkBreached?: (password: string) => Promise<boolean>;
}

// --- Session types ---

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date;
  ip: string;
  userAgent?: string;
  country?: string;
}

export interface SessionValidityResult {
  valid: boolean;
  reason?: string;
  shouldRefresh?: boolean;
  remainingTime?: number; // milliseconds
  /** Agentic manifest — machine-readable action recommendation. */
  manifest?: SecurityManifest;
}

export interface SuspiciousActivityResult {
  suspicious: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flags: SuspiciousFlag[];
  recommendation: 'allow' | 'challenge' | 'block' | 'notify';
  /** Agentic manifest — machine-readable action recommendation. */
  manifest?: SecurityManifest;
}

export interface SuspiciousFlag {
  type: SuspiciousFlagType;
  description: string;
  severity: 'low' | 'medium' | 'high';
  metadata?: Record<string, unknown>;
}

export type SuspiciousFlagType =
  | 'MULTIPLE_IPS'
  | 'IMPOSSIBLE_TRAVEL'
  | 'UNUSUAL_TIME'
  | 'NEW_DEVICE'
  | 'RAPID_REQUESTS'
  | 'KNOWN_BAD_IP'
  | 'TOR_EXIT_NODE'
  | 'VPN_DETECTED';

// --- CSRF types ---

/**
 * Parsed CSRF token structure.
 * Format: base64url(timestamp:random:hmac)
 */
export interface ParsedToken {
  /** Unix timestamp when token was created */
  timestamp: number;
  /** Random bytes (hex encoded) */
  random: string;
  /** HMAC signature */
  signature: string;
}

/**
 * Result of CSRF token validation.
 */
export interface CsrfValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Error code for programmatic handling */
  code?: 'MISSING_COOKIE' | 'MISSING_TOKEN' | 'INVALID_FORMAT' | 'EXPIRED' | 'SIGNATURE_MISMATCH' | 'TOKEN_MISMATCH';
  /** Agentic manifest — machine-readable action recommendation. */
  manifest?: SecurityManifest;
}

// --- Capability Token types ---

export interface CapabilityToken {
  capabilities: string[];
  expiresAt: number;
  tokenId: string;
}

export interface CapabilityValidationResult {
  valid: boolean;
  capabilities?: string[];
  expiresAt?: number;
  tokenId?: string;
  error?: string;
  /** Agentic manifest — machine-readable action recommendation. */
  manifest?: SecurityManifest;
}
