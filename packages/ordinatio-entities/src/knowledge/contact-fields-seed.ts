// ===========================================
// @ordinatio/entities — CONTACT FIELD DEFINITIONS SEED
// ===========================================
// Default EntityFieldDefinition records for the
// 'contact' entity type. Seed via createMany with
// skipDuplicates for idempotency.
// ===========================================

import type { PrismaClient } from '../types';

export const CONTACT_FIELD_DEFINITIONS = [
  // --- Communication ---
  { entityType: 'contact' as const, key: 'preferred_contact_method', label: 'Preferred Contact Method', dataType: 'enum', category: 'communication', enumOptions: ['email', 'phone', 'text', 'in-person'], sortOrder: 0 },
  { entityType: 'contact' as const, key: 'preferred_contact_time', label: 'Preferred Contact Time', dataType: 'text', category: 'communication', extractionHint: 'Time of day or day of week the contact prefers to be reached', sortOrder: 1 },
  { entityType: 'contact' as const, key: 'timezone', label: 'Timezone', dataType: 'text', category: 'communication', sortOrder: 2 },

  // --- Professional ---
  { entityType: 'contact' as const, key: 'company', label: 'Company', dataType: 'text', category: 'professional', sortOrder: 0 },
  { entityType: 'contact' as const, key: 'title', label: 'Job Title', dataType: 'text', category: 'professional', sortOrder: 1 },
  { entityType: 'contact' as const, key: 'industry', label: 'Industry', dataType: 'text', category: 'professional', sortOrder: 2 },

  // --- Relationship ---
  { entityType: 'contact' as const, key: 'referral_source', label: 'Referral Source', dataType: 'text', category: 'relationship', sortOrder: 0 },
  { entityType: 'contact' as const, key: 'relationship_type', label: 'Relationship Type', dataType: 'enum', category: 'relationship', enumOptions: ['prospect', 'vendor', 'partner', 'personal', 'other'], sortOrder: 1 },
  { entityType: 'contact' as const, key: 'last_interaction_notes', label: 'Last Interaction Notes', dataType: 'text', category: 'relationship', extractionHint: 'Brief summary of last meaningful interaction', sortOrder: 2 },
] as const;

/**
 * Seed contact field definitions into the database.
 * Idempotent — skips existing keys via skipDuplicates.
 * Returns the number of new definitions created.
 */
export async function seedContactFieldDefinitions(db: PrismaClient): Promise<number> {
  const result = await db.entityFieldDefinition.createMany({
    data: CONTACT_FIELD_DEFINITIONS.map((d) => ({
      entityType: d.entityType,
      key: d.key,
      label: d.label,
      dataType: d.dataType,
      category: d.category,
      enumOptions: 'enumOptions' in d ? d.enumOptions : null,
      extractionHint: 'extractionHint' in d ? d.extractionHint : null,
      sortOrder: d.sortOrder,
      status: 'approved',
      isActive: true,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
