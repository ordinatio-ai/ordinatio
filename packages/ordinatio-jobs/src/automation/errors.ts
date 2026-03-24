// ===========================================
// ORDINATIO AUTOMATION — Error Registry
// ===========================================
// Enhanced v2 error builder + merged error codes.
// AUTO_100-316 (core) + AUTO_400-507 (actions).
// Rule 8: code + ref + timestamp + module +
// description + severity + recoverable +
// diagnosis[] + context{}.
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function autoError(code: string, context?: Record<string, unknown>): {
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
  const def = AUTO_ERRORS[code as keyof typeof AUTO_ERRORS];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return createUnknownError(code, context, ts);
  }

  return createKnownError(def, context, ts);
}

function createUnknownError(code: string, context: Record<string, unknown> | undefined, timestamp: string) {
  return {
    code,
    ref: `${code}-${timestamp}`,
    timestamp: new Date().toISOString(),
    module: 'AUTOMATION',
    description: `Unknown error code: ${code}`,
    severity: 'error',
    recoverable: false,
    diagnosis: [],
    context: context || {},
  };
}

function createKnownError(def: any, context: Record<string, unknown> | undefined, timestamp: string) {
  return {
    code: def.code,
    ref: `${def.code}-${timestamp}`,
    timestamp: new Date().toISOString(),
    module: 'AUTOMATION',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

// ===========================================
// NOT FOUND ERRORS
// ===========================================

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class AutomationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Automation', id);
    this.name = 'AutomationNotFoundError';
  }
}

export class ExecutionNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Execution', id);
    this.name = 'ExecutionNotFoundError';
  }
}

// ===========================================
// ERROR REGISTRY — Core (AUTO_100-316)
// ===========================================

// Automation Error Registry — Core (CRUD, Triggers, Testing & Health)
// DEPENDS ON: nothing (standalone data)
// USED BY: errors.ts (barrel)

export const AUTO_ERRORS_CORE = {
  // =====================
  // AUTO_100-106: CRUD
  // =====================
  AUTO_100: {
    code: 'AUTO_100',
    file: 'api/automations/route.ts',
    function: 'GET|POST',
    httpStatus: 401,
    severity: 'warn' as const,
    recoverable: false,
    description: 'Unauthenticated request to automations endpoint.',
    diagnosis: [
      'User session expired or missing',
      'Check that better-auth sessio