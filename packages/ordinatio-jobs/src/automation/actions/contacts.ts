// ===========================================
// CONTACT ACTIONS
// ===========================================
// Handlers for contact-related automation actions.
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
  ContactExistsError,
  ContactNotFoundError,
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
// CREATE_CONTACT
// ===========================================
// Config options:
//   - email (optional): Contact email, supports {{template}} vars
//                       Falls back to context.data.fromEmail or senderEmail
//   - name (optional): Contact name, supports {{template}} vars
//                      Falls back to context.data.fromName or senderName
//   - notes (optional): Contact notes, supports {{template}} vars
//   - source (optional): 'EMAIL_SYNC' | 'MANUAL' | 'AUTOMATION' | 'IMPORT'
//                        Defaults to 'AUTOMATION'
//
// Idempotency: If a contact with the same email already exists,
// returns SKIPPED instead of creating a duplicate.
// ===========================================

export async function executeCreateContact(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  // Get email from config or trigger data (common pattern for email-triggered automations)
  const email = config.email
    ? resolveTemplateVars(String(config.email), context.data)
    : (context.data.fromEmail as string) ?? (context.data.senderEmail as string);

  if (!email) {
    return failedResult(actionId, 'CREATE_CONTACT', 'No email provided');
  }

  // Get optional name from config or trigger data
  const name = config.name
    ? resolveTemplateVars(String(config.name), context.data)
    : (context.data.fromName as string) ?? (context.data.senderName as string) ?? null;

  // Get optional notes
  const notes = config.notes
    ? resolveTemplateVars(String(config.notes), context.data)
    : null;

  // Get source (defaults to AUTOMATION for programmatic creation)
  const source = (config.source as 'EMAIL_SYNC' | 'MANUAL' | 'AUTOMATION' | 'IMPORT') ?? 'AUTOMATION';

  try {
    const contact = await deps.contactService.createContact({
      email,
      name,
      notes,
      source,
    });

    return completedResult(actionId, 'CREATE_CONTACT', {
      contactId: contact.id,
      email: contact.email,
      name: contact.name,
    });
  } catch (err) {
    if (err instanceof ContactExistsError) {
      // Contact already exists - this is idempotent behavior, not an error
      return skippedResult(
        actionId,
        'CREATE_CONTACT',
        `Contact already exists: ${email}`
      );
    }
    throw err;
  }
}

// ===========================================
// UPDATE_CONTACT
// ===========================================
// Config options:
//   - contactId (optional): Contact ID, falls back to context.data.contactId
//   - name (optional): New name, supports {{template}} vars
//                      Use empty string to clear the name
//   - notes (optional): New notes, supports {{template}} vars
//                       Use empty string to clear notes
// ===========================================

export async function executeUpdateContact(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const contactId = (config.contactId ?? context.data.contactId) as string;

  if (!contactId) {
    return failedResult(actionId, 'UPDATE_CONTACT', 'No contactId provided');
  }

  // Build update object - undefined means "don't change", null/empty means "clear"
  const updates: { name?: string | null; notes?: string | null } = {};

  if (config.name !== undefined) {
    updates.name = config.name
      ? resolveTemplateVars(String(config.name), context.data)
      : null;
  }

  if (config.notes !== undefined) {
    updates.notes = config.notes
      ? resolveTemplateVars(String(config.notes), context.data)
      : null;
  }

  if (Object.keys(updates).length === 0) {
    return failedResult(actionId, 'UPDATE_CONTACT', 'No fields to update');
  }

  try {
    const contact = await deps.contactService.updateContact(contactId, updates);

    return completedResult(actionId, 'UPDATE_CONTACT', {
      contactId: contact.id,
      updated: Object.keys(updates),
    });
  } catch (err) {
    if (err instanceof ContactNotFoundError) {
      return failedResult(actionId, 'UPDATE_CONTACT', `Contact not found: ${contactId}`);
    }
    throw err;
  }
}

// ===========================================
// ADD_TAG_TO_CONTACT
// ===========================================
// Config options:
//   - contactId (optional): Contact ID, falls back to context.data.contactId
//   - tagId (optional): Tag ID to add
//   - tagName (optional): Tag name to look up, supports {{template}} vars
//
// Must provide either tagId or tagName.
// ===========================================

export async function executeAddTagToContact(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const contactId = (config.contactId ?? context.data.contactId) as string;

  if (!contactId) {
    return failedResult(actionId, 'ADD_TAG_TO_CONTACT', 'No contactId provided');
  }

  const tagResult = await resolveTagId(config, context, deps);
  if (!tagResult.success) {
    return failedResult(actionId, 'ADD_TAG_TO_CONTACT', tagResult.error);
  }

  try {
    const result = await deps.tagService.addTagToContact(contactId, tagResult.tagId);

    return completedResult(actionId, 'ADD_TAG_TO_CONTACT', {
      contactId,
      tagId: tagResult.tagId,
      tagName: result.tag.name,
    });
  } catch (err) {
    if (err instanceof TagNotFoundError) {
      return failedResult(actionId, 'ADD_TAG_TO_CONTACT', `Tag not found: ${tagResult.tagId}`);
    }
    throw err;
  }
}

// ===========================================
// REMOVE_TAG_FROM_CONTACT
// ===========================================
// Config options:
//   - contactId (optional): Contact ID, falls back to context.data.contactId
//   - tagId (optional): Tag ID to remove
//   - tagName (optional): Tag name to look up, supports {{template}} vars
//
// Must provide either tagId or tagName.
// ===========================================

export async function executeRemoveTagFromContact(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const contactId = (config.contactId ?? context.data.contactId) as string;

  if (!contactId) {
    return failedResult(actionId, 'REMOVE_TAG_FROM_CONTACT', 'No contactId provided');
  }

  const tagResult = await resolveTagId(config, context, deps);
  if (!tagResult.success) {
    return failedResult(actionId, 'REMOVE_TAG_FROM_CONTACT', tagResult.error);
  }

  await deps.tagService.removeTagFromContact(contactId, tagResult.tagId);

  return completedResult(actionId, 'REMOVE_TAG_FROM_CONTACT', {
    contactId,
    tagId: tagResult.tagId,
  });
}

// ===========================================
// REGISTER ALL CONTACT ACTIONS
// ===========================================

export function registerContactActions(): void {
  // Wrap the exported functions to match the registry signature
  registerAction('CREATE_CONTACT', (actionId, config, context) =>
    executeCreateContact(actionId, config, context)
  );
  registerAction('UPDATE_CONTACT', (actionId, config, context) =>
    executeUpdateContact(actionId, config, context)
  );
  registerAction('ADD_TAG_TO_CONTACT', (actionId, config, context) =>
    executeAddTagToContact(actionId, config, context)
  );
  registerAction('REMOVE_TAG_FROM_CONTACT', (actionId, config, context) =>
    executeRemoveTagFromContact(actionId, config, context)
  );
}
