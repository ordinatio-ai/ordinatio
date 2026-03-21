// ===========================================
// EMAIL ENGINE — TEMPLATE RENDERER
// ===========================================
// Pure functions for rendering email templates
// with Mustache-style {{variable}} substitution.
// ===========================================

import type { TemplateVariables, VariableCategory, ClientContext, OrderContext, ClothierContext } from './types';

/**
 * Replace {{placeholder}} patterns in a template with variable values.
 * Unmatched placeholders are left intact.
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value !== undefined && value !== '' ? value : match;
  });
}

/**
 * Extract unique placeholder names from a template string.
 */
export function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  const names = matches.map((m) => m.replace(/\{\{|\}\}/g, ''));
  return [...new Set(names)];
}

/**
 * Validate that all placeholders in a template have non-empty values.
 */
export function validateTemplate(
  template: string,
  variables: TemplateVariables
): { valid: boolean; missing: string[] } {
  const placeholders = extractPlaceholders(template);
  const missing = placeholders.filter(
    (key) => !variables[key] || variables[key] === ''
  );
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Available template variables grouped by category for UI display.
 */
export const AVAILABLE_VARIABLES: VariableCategory[] = [
  {
    category: 'Client',
    variables: [
      { key: 'clientName', label: 'Full Name', example: 'John Smith' },
      { key: 'firstName', label: 'First Name', example: 'John' },
      { key: 'lastName', label: 'Last Name', example: 'Smith' },
      { key: 'clientEmail', label: 'Email', example: 'john@example.com' },
      { key: 'clientPhone', label: 'Phone', example: '(555) 123-4567' },
    ],
  },
  {
    category: 'Order',
    variables: [
      { key: 'orderNumber', label: 'Order Number', example: 'ORD-2024-001' },
      { key: 'orderStatus', label: 'Status', example: 'In Production' },
      { key: 'fabricCode', label: 'Fabric Code', example: 'A754-21' },
      { key: 'garmentType', label: 'Garment Type', example: '3-Piece Suit' },
      { key: 'deliveryDate', label: 'Delivery Date', example: 'March 15, 2026' },
    ],
  },
  {
    category: 'Business',
    variables: [
      { key: 'companyName', label: 'Company Name', example: '1701 Bespoke' },
      { key: 'clothierName', label: 'Clothier Name', example: 'Max' },
      { key: 'clothierEmail', label: 'Clothier Email', example: 'max@1701bespoke.com' },
    ],
  },
];

/**
 * Sample variable values for template previews.
 */
export const SAMPLE_VARIABLES: TemplateVariables = {
  clientName: 'John Smith',
  firstName: 'John',
  lastName: 'Smith',
  clientEmail: 'john@example.com',
  clientPhone: '(555) 123-4567',
  orderNumber: 'ORD-2024-001',
  orderStatus: 'In Production',
  fabricCode: 'A754-21',
  garmentType: '3-Piece Suit',
  deliveryDate: 'March 15, 2026',
  companyName: '1701 Bespoke',
  clothierName: 'Max',
  clothierEmail: 'max@1701bespoke.com',
};

/**
 * Build template variables from context objects.
 */
export function buildVariablesFromContext(
  client?: ClientContext | null,
  order?: OrderContext | null,
  clothier?: ClothierContext | null
): TemplateVariables {
  const variables: TemplateVariables = {
    companyName: '1701 Bespoke',
  };

  if (client) {
    variables.clientName = client.name;
    if (client.name) {
      const parts = client.name.split(' ');
      variables.firstName = parts[0];
      variables.lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
    }
    variables.clientEmail = client.email;
    variables.clientPhone = client.phone;
  }

  if (order) {
    variables.orderNumber = order.orderNumber;
    variables.orderStatus = order.status;
    variables.fabricCode = order.fabricCode;
    variables.garmentType = order.garmentType;
    if (order.deliveryDate) {
      variables.deliveryDate =
        order.deliveryDate instanceof Date
          ? order.deliveryDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : order.deliveryDate;
    }
  }

  if (clothier) {
    variables.clothierName = clothier.name;
    variables.clothierEmail = clothier.email;
  }

  return variables;
}
