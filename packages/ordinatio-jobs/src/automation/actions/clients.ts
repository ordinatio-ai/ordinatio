// ===========================================
// CLIENT ACTIONS
// ===========================================
// Handlers for client-related automation actions.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: registry, condition-evaluator, default-deps
// USED BY: action-executor, automation tests
// ===========================================

import { resolveTemplateVars } from '../condition-evaluator';
import {
  registerAction,
  completedResult,
  failedResult,
  skippedResult,
  type ActionResult,
  type ExecutionContext,
} from './registry';
import type { ActionDependencies } from './types';
import {
  getDependencies,
  ClientNotFoundError,
  ContactNotFoundError,
  ContactAlreadyConvertedError,
  TagNotFoundError,
} from './default-deps';

// ===========================================
// HELPER: Resolve tag ID from config
// ===========================================

async function resolveTagId(
  config: Record<string, unknown>,
  context: ExecutionContext,
  deps: Required<ActionDependencies>
): Promise<{ success: true; tagId: string } | { success: false; error: string }> {
  const tagId = config.tagId as string | undefined;
  const tagName = config.tagName
    ? resolveTemplateVars(String(config.tagName), context.data)
    : undefined;

  if (tagId) {
    return { success: true, tagId };
  }

  if (tagName) {
    const tag = await deps.tagService.getTagByName(tagName);
    if (!tag) {
      return { success: false, error: `Tag not found: ${tagName}` };
    }
    return { success: true, tagId: tag.id };
  }

  return { success: false, error: 'No tagId or tagName provided' };
}

// ===========================================
// CREATE_CLIENT
// ===========================================
// Config options:
//   - name (required): Client name, supports {{template}} vars
//   - email (optional): Client email, supports {{template}} vars
//   - phone (optional): Client phone, supports {{template}} vars
//   - clientType (optional): 'VIRTUAL' or 'IN_PERSON', defaults to 'VIRTUAL'
//
// Idempotency: If a client with the same email already exists,
// returns SKIPPED instead of creating a duplicate.
// ===========================================

export async function executeCreateClient(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const name = resolveTemplateVars(String(config.name ?? ''), context.data);
  if (!name) {
    return failedResult(actionId, 'CREATE_CLIENT', 'No name provided');
  }
  const email = config.email
    ? resolveTemplateVars(String(config.email), context.data)
    : undefined;
  const phone = config.phone
    ? resolveTemplateVars(String(config.phone), context.data)
    : undefined;
  const clientType = (config.clientType as 'VIRTUAL' | 'IN_PERSON') ?? 'VIRTUAL';

  // Idempotency check: skip if client with same email exists
  if (email && await deps.clientService.clientExists(email)) {
    return skippedResult(actionId, 'CREATE_CLIENT', 'Client with same email exists');
  }

  try {
    const clientId = await deps.clientService.createClient({ name, email, phone, clientType });
    return completedResult(actionId, 'CREATE_CLIENT', { clientId });
  } catch (error) {
    // Handle specific errors and return meaningful results
    if (error instanceof ClientNotFoundError) {
      return failedResult(actionId, 'CREATE_CLIENT', 'Client not found');
    }
    // Additional error handling can be inserted here
    throw error; // Unknown errors are re-thrown
  }
}
