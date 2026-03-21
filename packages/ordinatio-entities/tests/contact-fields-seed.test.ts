// ===========================================
// @ordinatio/entities — CONTACT FIELD DEFINITIONS SEED TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  CONTACT_FIELD_DEFINITIONS,
  seedContactFieldDefinitions,
} from '../src/knowledge/contact-fields-seed';

function createMockDb() {
  return {
    entityFieldDefinition: {
      createMany: vi.fn(),
    },
  } as any;
}

describe('CONTACT_FIELD_DEFINITIONS', () => {
  it('contains exactly 9 field definitions', () => {
    expect(CONTACT_FIELD_DEFINITIONS).toHaveLength(9);
  });

  it('all definitions have entityType "contact"', () => {
    for (const def of CONTACT_FIELD_DEFINITIONS) {
      expect(def.entityType).toBe('contact');
    }
  });

  it('all keys are snake_case', () => {
    for (const def of CONTACT_FIELD_DEFINITIONS) {
      expect(def.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('covers three categories: communication, professional, relationship', () => {
    const categories = new Set(CONTACT_FIELD_DEFINITIONS.map((d) => d.category));
    expect(categories).toEqual(new Set(['communication', 'professional', 'relationship']));
  });

  it('has 3 communication fields', () => {
    const commFields = CONTACT_FIELD_DEFINITIONS.filter((d) => d.category === 'communication');
    expect(commFields).toHaveLength(3);
  });

  it('has 3 professional fields', () => {
    const proFields = CONTACT_FIELD_DEFINITIONS.filter((d) => d.category === 'professional');
    expect(proFields).toHaveLength(3);
  });

  it('has 3 relationship fields', () => {
    const relFields = CONTACT_FIELD_DEFINITIONS.filter((d) => d.category === 'relationship');
    expect(relFields).toHaveLength(3);
  });
});

describe('seedContactFieldDefinitions', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('calls createMany with all 9 definitions and skipDuplicates', async () => {
    db.entityFieldDefinition.createMany.mockResolvedValue({ count: 9 });

    const count = await seedContactFieldDefinitions(db);

    expect(count).toBe(9);
    expect(db.entityFieldDefinition.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          entityType: 'contact',
          key: 'preferred_contact_method',
          status: 'approved',
          isActive: true,
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('creates definitions with status approved and isActive true', async () => {
    db.entityFieldDefinition.createMany.mockResolvedValue({ count: 9 });

    await seedContactFieldDefinitions(db);

    const callData = db.entityFieldDefinition.createMany.mock.calls[0][0].data;
    for (const def of callData) {
      expect(def.status).toBe('approved');
      expect(def.isActive).toBe(true);
    }
  });

  it('returns 0 when all definitions already exist (idempotent)', async () => {
    db.entityFieldDefinition.createMany.mockResolvedValue({ count: 0 });

    const count = await seedContactFieldDefinitions(db);

    expect(count).toBe(0);
  });
});
