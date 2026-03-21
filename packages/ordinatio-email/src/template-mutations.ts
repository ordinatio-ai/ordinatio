// ===========================================
// EMAIL ENGINE — TEMPLATE MUTATIONS
// ===========================================

import type { PrismaClient } from '@prisma/client';
import {
  EmailTemplateNotFoundError,
  EmailTemplateDuplicateError,
  DefaultTemplateDeletionError,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type EmailMutationCallbacks,
} from './types';

/**
 * Create a new email template.
 */
export async function createTemplate(
  db: PrismaClient,
  input: CreateTemplateInput,
  callbacks?: EmailMutationCallbacks
) {
  // Check for duplicate name
  const existing = await db.emailTemplate.findFirst({
    where: { name: input.name },
  });

  if (existing) {
    throw new EmailTemplateDuplicateError(input.name);
  }

  const template = await db.emailTemplate.create({
    data: {
      name: input.name,
      category: input.category,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      isDefault: false,
    },
  });

  await callbacks?.onActivity?.('EMAIL_TEMPLATE_CREATED', `Created email template: ${input.name}`, { templateId: template.id, name: input.name });

  return template;
}

/**
 * Update an existing email template.
 */
export async function updateTemplate(
  db: PrismaClient,
  id: string,
  input: UpdateTemplateInput,
  callbacks?: EmailMutationCallbacks
) {
  const existing = await db.emailTemplate.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new EmailTemplateNotFoundError(id);
  }

  // Check for duplicate name if changing name
  if (input.name && input.name !== existing.name) {
    const duplicate = await db.emailTemplate.findFirst({
      where: { name: input.name, id: { not: id } },
    });
    if (duplicate) {
      throw new EmailTemplateDuplicateError(input.name);
    }
  }

  const template = await db.emailTemplate.update({
    where: { id },
    data: input,
  });

  await callbacks?.onActivity?.('EMAIL_TEMPLATE_UPDATED', `Updated email template: ${template.name}`, { templateId: id, name: template.name });

  return template;
}

/**
 * Remove an email template.
 */
export async function removeTemplate(
  db: PrismaClient,
  id: string,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  const template = await db.emailTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    throw new EmailTemplateNotFoundError(id);
  }

  if (template.isDefault) {
    throw new DefaultTemplateDeletionError();
  }

  await db.emailTemplate.delete({ where: { id } });

  await callbacks?.onActivity?.('EMAIL_TEMPLATE_DELETED', `Deleted email template: ${template.name}`, { templateId: id, name: template.name });
}

/**
 * Reset to default templates (delete all + re-seed).
 */
export async function resetToDefaults(
  db: PrismaClient,
  callbacks?: EmailMutationCallbacks
): Promise<void> {
  await db.emailTemplate.deleteMany({});

  // Re-seed via ensureDefaults (which checks count === 0)
  const { ensureDefaults } = await import('./template-queries');
  await ensureDefaults(db);

  await callbacks?.onActivity?.('EMAIL_TEMPLATE_RESET', 'Reset email templates to defaults', {});
}
