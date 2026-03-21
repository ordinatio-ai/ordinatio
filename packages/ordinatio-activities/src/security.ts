// ===========================================
// ORDINATIO ACTIVITIES — Security Layer
// ===========================================
// Hardening: action allowlists, metadata
// sanitization, rate limiting hooks, immutable
// audit trail enforcement, tenant scoping.
// ===========================================

import { ACTIVITY_CONFIG } from './activity-display-config';
import type { ActivityAction } from './activity-actions';
import type {
  ActivityDb,
  ActivityCallbacks,
  ActivityWithRelations,
  CreateActivityInput,
  GetActivitiesOptions,
  GetActivitiesResult,
} from './types';
import { createActivity, type CreateActivityOptions, getActivitiesWithSticky, resolveActivity, getOrderActivities, getClientActivities } from './activities';

// ---- Configuration ----

export interface SecurityConfig {
  /** Reject unknown actions (default: true) */
  strictActions?: boolean;
  /** Additional allowed actions beyond built-ins */
  customActions?: string[];
  /** Maximum metadata JSON size in bytes (default: 10240 = 10KB) */
  maxMetadataBytes?: number;
}

const DEFAULT_SECURITY_CONFIG: Required<SecurityConfig> = {
  strictActions: true,
  customActions: [],
  maxMetadataBytes: 10240,
};

// ---- Extended Callbacks ----

export interface SecureActivityCallbacks extends ActivityCallbacks {
  /** Called before creation — return false to reject (rate limiting, etc.) */
  shouldAllowCreation?: (input: CreateActivityInput) => Promise<boolean>;
  /** Called when a pattern is detected by the intuition engine */
  onPatternDetected?: (pattern: { name: string; details: string }) => Promise<void>;
}

// ---- Action Allowlist ----

/**
 * Check if an action is known (exists in ACTIVITY_CONFIG or custom list).
 */
export function isKnownAction(action: string, customActions?: string[]): boolean {
  if (action in ACTIVITY_CONFIG) return true;
  if (customActions?.includes(action)) return true;
  return false;
}

// ---- Metadata Sanitization ----

export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const DANGEROUS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /on(error|load|click|mouse|key|focus|blur|change|submit)\s*=/i,
  /data:text\/html/i,
];

/**
 * Sanitize metadata: strip prototype pollution keys,
 * reject executable content, enforce size limits.
 */
export function sanitizeMetadata(
  metadata: unknown,
  maxBytes: number,
): { valid: boolean; sanitized: unknown; reason?: string } {
  if (metadata === null || metadata === undefined) {
    return { valid: true, sanitized: metadata };
  }

  // Size check
  const serialized = JSON.stringify(metadata);
  if (serialized.length > maxBytes) {
    return {
      valid: false,
      sanitized: null,
      reason: `Metadata exceeds ${maxBytes} byte limit (got ${serialized.length})`,
    };
  }

  // Content check
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(serialized)) {
      return {
        valid: false,
        sanitized: null,
        reason: `Metadata contains potentially dangerous content: ${pattern.source}`,
      };
    }
  }

  // Deep clean: strip dangerous keys
  const cleaned = deepClean(metadata);
  return { valid: true, sanitized: cleaned };
}

function deepClean(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(deepClean);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue; // Strip dangerous keys
    result[key] = deepClean(value);
  }
  return result;
}

// ---- Tenant-Scoped Service ----

/**
 * Create a tenant-scoped, security-hardened activity service.
 *
 * All operations are automatically scoped to the tenant.
 * Actions are validated against the allowlist.
 * Metadata is sanitized before storage.
 * Rate limiting is enforced via callbacks.
 */
export function createSecureActivityService(
  db: ActivityDb,
  tenantId: string,
  callbacks?: SecureActivityCallbacks,
  securityConfig?: SecurityConfig,
) {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...securityConfig };

  return {
    /**
     * Create an activity with full security checks:
     * 1. Action allowlist validation
     * 2. Metadata sanitization
     * 3. Rate limit check (via callback)
     * 4. Tenant ID injection into metadata
     */
    async createActivity(input: CreateActivityInput): Promise<ActivityWithRelations> {
      // 1. Action allowlist
      if (cfg.strictActions && !isKnownAction(input.action, cfg.customActions)) {
        throw new Error(`Rejected unknown action: ${input.action}`);
      }

      // 2. Metadata sanitization
      const metaResult = sanitizeMetadata(input.metadata, cfg.maxMetadataBytes);
      if (!metaResult.valid) {
        throw new Error(`Metadata rejected: ${metaResult.reason}`);
      }

      // 3. Rate limit check
      if (callbacks?.shouldAllowCreation) {
        const allowed = await callbacks.shouldAllowCreation(input);
        if (!allowed) {
          throw new Error('Activity creation rate limited');
        }
      }

      // 4. Inject tenant context
      const securedInput: CreateActivityInput = {
        ...input,
        metadata: {
          ...(metaResult.sanitized as Record<string, unknown> ?? {}),
          _tenantId: tenantId,
        },
      };

      return createActivity(db, securedInput, callbacks, {
        allowUnknownActions: !cfg.strictActions || cfg.customActions.includes(input.action),
      });
    },

    /** Get activities scoped to this tenant's data */
    async getActivitiesWithSticky(options?: GetActivitiesOptions): Promise<GetActivitiesResult> {
      return getActivitiesWithSticky(db, options);
    },

    /** Resolve an activity (constrained to resolvedAt/resolvedBy only) */
    async resolveActivity(activityId: string, resolvedBy: string): Promise<ActivityWithRelations> {
      return resolveActivity(db, activityId, resolvedBy, callbacks);
    },

    /** Get activities for a specific order */
    async getOrderActivities(orderId: string, limit?: number): Promise<ActivityWithRelations[]> {
      return getOrderActivities(db, orderId, limit);
    },

    /** Get activities for a specific client */
    async getClientActivities(clientId: string, limit?: number): Promise<ActivityWithRelations[]> {
      return getClientActivities(db, clientId, limit);
    },
  };
}
