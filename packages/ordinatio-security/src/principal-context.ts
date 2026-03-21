// ===========================================
// @ordinatio/security — Principal Context
// ===========================================
// Trust binding: who is acting, what type, which org, auth method.
// Every security decision is bound to a principal.
// ===========================================

export type PrincipalType = 'user' | 'agent' | 'automation' | 'system';
export type AuthMethod = 'session' | 'api_key' | 'internal' | 'jws';
export type TrustTier = 0 | 1 | 2;

export interface PrincipalContext {
  principalId: string;
  principalType: PrincipalType;
  orgId?: string;
  authMethod?: AuthMethod;
  trustTier?: TrustTier;
}

/**
 * Build a PrincipalContext with validation.
 */
export function buildPrincipalContext(opts: {
  principalId: string;
  principalType: PrincipalType;
  orgId?: string;
  authMethod?: AuthMethod;
  trustTier?: TrustTier;
}): PrincipalContext {
  validatePrincipal(opts);
  return {
    principalId: opts.principalId,
    principalType: opts.principalType,
    orgId: opts.orgId,
    authMethod: opts.authMethod,
    trustTier: opts.trustTier,
  };
}

const VALID_PRINCIPAL_TYPES: PrincipalType[] = ['user', 'agent', 'automation', 'system'];
const VALID_AUTH_METHODS: AuthMethod[] = ['session', 'api_key', 'internal', 'jws'];

/**
 * Validate a PrincipalContext — ensures required fields and valid enum values.
 * Throws on invalid input.
 */
export function validatePrincipal(ctx: PrincipalContext): void {
  if (!ctx.principalId || typeof ctx.principalId !== 'string') {
    throw new Error('PrincipalContext requires a non-empty principalId string');
  }

  if (!VALID_PRINCIPAL_TYPES.includes(ctx.principalType)) {
    throw new Error(`Invalid principalType: ${ctx.principalType}. Must be one of: ${VALID_PRINCIPAL_TYPES.join(', ')}`);
  }

  if (ctx.authMethod !== undefined && !VALID_AUTH_METHODS.includes(ctx.authMethod)) {
    throw new Error(`Invalid authMethod: ${ctx.authMethod}. Must be one of: ${VALID_AUTH_METHODS.join(', ')}`);
  }

  if (ctx.trustTier !== undefined && ![0, 1, 2].includes(ctx.trustTier)) {
    throw new Error(`Invalid trustTier: ${ctx.trustTier}. Must be 0, 1, or 2`);
  }
}

/**
 * Human-readable description of a principal for logs and summaries.
 */
export function describePrincipal(ctx: PrincipalContext): string {
  const parts = [`${ctx.principalType}:${ctx.principalId}`];
  if (ctx.orgId) parts.push(`in org:${ctx.orgId}`);
  if (ctx.authMethod) parts.push(`via ${ctx.authMethod}`);
  if (ctx.trustTier !== undefined) parts.push(`(tier ${ctx.trustTier})`);
  return parts.join(' ');
}
