// ===========================================
// EMAIL ENGINE — TEMPLATE QUERIES
// ===========================================

import type { PrismaClient } from '@prisma/client';
import { EmailTemplateNotFoundError, type GetTemplatesOptions } from './types';

/**
 * Ensure default templates exist. Seeds if table is empty.
 */
export async function ensureDefaults(db: PrismaClient): Promise<void> {
  const count = await db.emailTemplate.count();
  if (count > 0) return;

  await db.emailTemplate.createMany({
    data: DEFAULT_TEMPLATES,
  });
}

/**
 * List email templates with optional filters.
 */
export async function listTemplates(
  db: PrismaClient,
  options: GetTemplatesOptions = {}
) {
  const where: Record<string, unknown> = {};
  if (options.category) where.category = options.category;
  if (options.isActive !== undefined) where.isActive = options.isActive;

  return db.emailTemplate.findMany({
    where,
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    take: 100,
  });
}

/**
 * Get a template by ID.
 */
export async function getTemplateById(db: PrismaClient, id: string) {
  const template = await db.emailTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    throw new EmailTemplateNotFoundError(id);
  }

  return template;
}

/**
 * Get active templates by category.
 */
export async function getActiveByCategory(db: PrismaClient, category: string) {
  return db.emailTemplate.findMany({
    where: { category, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 50,
  });
}

// -------------------------------------------
// Default template seeds
// -------------------------------------------

const DEFAULT_TEMPLATES = [
  {
    name: 'Fitting Appointment Confirmation',
    category: 'fitting',
    subject: 'Your Fitting Appointment is Confirmed',
    bodyHtml: '<p>Dear {{clientName}},</p><p>Your fitting appointment has been confirmed. We look forward to seeing you!</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Fitting Reminder',
    category: 'fitting',
    subject: 'Reminder: Your Fitting Appointment',
    bodyHtml: '<p>Dear {{firstName}},</p><p>This is a friendly reminder about your upcoming fitting appointment.</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Order Confirmation',
    category: 'order',
    subject: 'Order {{orderNumber}} — Confirmed',
    bodyHtml: '<p>Dear {{clientName}},</p><p>Your order {{orderNumber}} for a {{garmentType}} in fabric {{fabricCode}} has been confirmed and sent to production.</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Order Status Update',
    category: 'order',
    subject: 'Order {{orderNumber}} — Status Update',
    bodyHtml: '<p>Dear {{clientName}},</p><p>Your order {{orderNumber}} is now: <strong>{{orderStatus}}</strong>.</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Order Ready for Pickup',
    category: 'order',
    subject: 'Your Order is Ready!',
    bodyHtml: '<p>Dear {{clientName}},</p><p>Great news! Your {{garmentType}} is ready. Please contact us to schedule a pickup or delivery.</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Fabric Recommendation',
    category: 'fabric',
    subject: 'Fabric Recommendation for Your Next Order',
    bodyHtml: '<p>Dear {{firstName}},</p><p>Based on your preferences, we think you\'ll love fabric {{fabricCode}}. Would you like to see a swatch?</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Follow-Up After Fitting',
    category: 'followup',
    subject: 'How Was Your Fitting?',
    bodyHtml: '<p>Dear {{firstName}},</p><p>Thank you for coming in for your fitting! We hope everything went well. Please don\'t hesitate to reach out with any questions.</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 0,
  },
  {
    name: 'Welcome New Client',
    category: 'welcome',
    subject: 'Welcome to {{companyName}}!',
    bodyHtml: '<p>Dear {{clientName}},</p><p>Welcome to {{companyName}}! We\'re thrilled to have you as a client. Our team is ready to help you create the perfect wardrobe.</p><p>Best regards,<br>{{clothierName}}<br>{{companyName}}</p>',
    isDefault: true,
    isActive: true,
    sortOrder: 0,
  },
];
