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
  const email = config.email
    ? resolveTemplateVars(String(config.email), context.data)
    : undefined;
  const phone = config.phone
    ? resolveTemplateVars(String(config.phone), context.data)
    : undefined;
  const clientType = (config.clientType as 'VIRTUAL' | 'IN_PERSON') ?? 'VIRTUAL';

  if (!name) {
    return failedResult(actionId, 'CREATE_CLIENT', 'No name provided');
  }

  // Idempotency check: skip if client with same email already exists
  if (email) {
    const existing = await deps.clientService.findClientByEmail(email);
    if (existing) {
      return skippedResult(
        actionId,
        'CREATE_CLIENT',
        `Client with email ${email} already exists`
      );
    }
  }

  const client = await deps.clientService.createClient({
    name,
    email: email ?? null,
    phone: phone ?? null,
    clientType,
    weddingDate: null,
    notes: null,
  });

  return completedResult(actionId, 'CREATE_CLIENT', {
    clientId: client.id,
    name: client.name,
    email: client.email,
  });
}

// ===========================================
// UPDATE_CLIENT
// ===========================================
// Config options:
//   - clientId (optional): Client ID, falls back to context.data.clientId
//   - name (optional): New name, supports {{template}} vars
//   - email (optional): New email, supports {{template}} vars
//   - phone (optional): New phone, supports {{template}} vars
//   - notes (optional): New notes, supports {{template}} vars
//   - clientType (optional): 'VIRTUAL' or 'IN_PERSON'
//   - archetype (optional): Client archetype
// ===========================================

export async function executeUpdateClient(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const clientId = (config.clientId ?? context.data.clientId) as string;

  if (!clientId) {
    return failedResult(actionId, 'UPDATE_CLIENT', 'No clientId provided');
  }

  // Build update object from provided fields
  const updates: Record<string, unknown> = {};

  if (config.name !== undefined) {
    updates.name = resolveTemplateVars(String(config.name), context.data);
  }
  if (config.email !== undefined) {
    updates.email = resolveTemplateVars(String(config.email), context.data);
  }
  if (config.phone !== undefined) {
    updates.phone = resolveTemplateVars(String(config.phone), context.data);
  }
  if (config.notes !== undefined) {
    updates.notes = resolveTemplateVars(String(config.notes), context.data);
  }
  if (config.clientType !== undefined) {
    updates.clientType = config.clientType;
  }
  if (config.archetype !== undefined) {
    updates.archetype = config.archetype;
  }

  if (Object.keys(updates).length === 0) {
    return failedResult(actionId, 'UPDATE_CLIENT', 'No fields to update');
  }

  try {
    await deps.clientService.updateClient(clientId, updates);

    return completedResult(actionId, 'UPDATE_CLIENT', {
      clientId,
      updated: Object.keys(updates),
    });
  } catch (err) {
    if (err instanceof ClientNotFoundError) {
      return failedResult(actionId, 'UPDATE_CLIENT', `Client not found: ${clientId}`);
    }
    throw err;
  }
}

// ===========================================
// ADD_TAG_TO_CLIENT
// ===========================================
// Config options:
//   - clientId (optional): Client ID, falls back to context.data.clientId
//   - tagId (optional): Tag ID to add
//   - tagName (optional): Tag name to look up, supports {{template}} vars
//
// Must provide either tagId or tagName.
// ===========================================

export async function executeAddTagToClient(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const clientId = (config.clientId ?? context.data.clientId) as string;

  if (!clientId) {
    return failedResult(actionId, 'ADD_TAG_TO_CLIENT', 'No clientId provided');
  }

  const tagResult = await resolveTagId(config, context, deps);
  if (!tagResult.success) {
    return failedResult(actionId, 'ADD_TAG_TO_CLIENT', tagResult.error);
  }

  try {
    const result = await deps.tagService.addTagToClient(clientId, tagResult.tagId);

    return completedResult(actionId, 'ADD_TAG_TO_CLIENT', {
      clientId,
      tagId: tagResult.tagId,
      tagName: result.tag.name,
    });
  } catch (err) {
    if (err instanceof TagNotFoundError) {
      return failedResult(actionId, 'ADD_TAG_TO_CLIENT', `Tag not found: ${tagResult.tagId}`);
    }
    throw err;
  }
}

// ===========================================
// REMOVE_TAG_FROM_CLIENT
// ===========================================
// Config options:
//   - clientId (optional): Client ID, falls back to context.data.clientId
//   - tagId (optional): Tag ID to remove
//   - tagName (optional): Tag name to look up, supports {{template}} vars
//
// Must provide either tagId or tagName.
// ===========================================

export async function executeRemoveTagFromClient(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const clientId = (config.clientId ?? context.data.clientId) as string;

  if (!clientId) {
    return failedResult(actionId, 'REMOVE_TAG_FROM_CLIENT', 'No clientId provided');
  }

  const tagResult = await resolveTagId(config, context, deps);
  if (!tagResult.success) {
    return failedResult(actionId, 'REMOVE_TAG_FROM_CLIENT', tagResult.error);
  }

  await deps.tagService.removeTagFromClient(clientId, tagResult.tagId);

  return completedResult(actionId, 'REMOVE_TAG_FROM_CLIENT', {
    clientId,
    tagId: tagResult.tagId,
  });
}

// ===========================================
// CONVERT_CONTACT_TO_CLIENT
// ===========================================
// Config options:
//   - contactId (optional): Contact ID, falls back to context.data.contactId
//   - clientType (optional): 'VIRTUAL' or 'IN_PERSON', defaults to 'VIRTUAL'
//   - name (optional): Override contact name, supports {{template}} vars
//   - phone (optional): Client phone, supports {{template}} vars
//   - notes (optional): Client notes, supports {{template}} vars
//
// Idempotency: If contact is already converted, returns SKIPPED.
// ===========================================

export async function executeConvertContactToClient(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const contactId = (config.contactId ?? context.data.contactId) as string;
  const clientType = (config.clientType as 'VIRTUAL' | 'IN_PERSON') ?? 'VIRTUAL';

  if (!contactId) {
    return failedResult(actionId, 'CONVERT_CONTACT_TO_CLIENT', 'No contactId provided');
  }

  // Optional client data overrides
  const name = config.name
    ? resolveTemplateVars(String(config.name), context.data)
    : undefined;
  const phone = config.phone
    ? resolveTemplateVars(String(config.phone), context.data)
    : undefined;
  const notes = config.notes
    ? resolveTemplateVars(String(config.notes), context.data)
    : undefined;

  // Get userId from context for audit trail (defaults to 'automation')
  const userId = (context.data.userId as string) ?? 'automation';

  try {
    const client = await deps.contactService.convertToClient(contactId, userId, {
      name,
      phone: phone ?? null,
      clientType,
      notes: notes ?? null,
    });

    return completedResult(actionId, 'CONVERT_CONTACT_TO_CLIENT', {
      contactId,
      clientId: client.id,
      name: client.name,
      email: client.email,
    });
  } catch (err) {
    if (err instanceof ContactNotFoundError) {
      return failedResult(
        actionId,
        'CONVERT_CONTACT_TO_CLIENT',
        `Contact not found: ${contactId}`
      );
    }
    if (err instanceof ContactAlreadyConvertedError) {
      return skippedResult(
        actionId,
        'CONVERT_CONTACT_TO_CLIENT',
        `Contact already converted: ${contactId}`
      );
    }
    throw err;
  }
}

// ===========================================
// REGISTER ALL CLIENT ACTIONS
// ===========================================

export function registerClientActions(): void {
  // Wrap the exported functions to match the registry signature
  registerAction('CREATE_CLIENT', (actionId, config, context) =>
    executeCreateClient(actionId, config, context)
  );
  registerAction('UPDATE_CLIENT', (actionId, config, context) =>
    executeUpdateClient(actionId, config, context)
  );
  registerAction('ADD_TAG_TO_CLIENT', (actionId, config, context) =>
    executeAddTagToClient(actionId, config, context)
  );
  registerAction('REMOVE_TAG_FROM_CLIENT', (actionId, config, context) =>
    executeRemoveTagFromClient(actionId, config, context)
  );
  registerAction('CONVERT_CONTACT_TO_CLIENT', (actionId, config, context) =>
    executeConvertContactToClient(actionId, config, context)
  );
}
