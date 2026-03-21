// ===========================================
// EMAIL ENGINE — TEMPLATE QUERIES & MUTATIONS TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmailTemplateNotFoundError,
  EmailTemplateDuplicateError,
  DefaultTemplateDeletionError,
} from './types';

// ---------------------------------------------------------------------------
// Shared mock db
// ---------------------------------------------------------------------------

const mockDb = {
  emailTemplate: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
} as unknown as import('@prisma/client').PrismaClient;

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl-1',
    name: 'Order Confirmation',
    category: 'order',
    subject: 'Your order is confirmed',
    bodyHtml: '<p>Thanks!</p>',
    isActive: true,
    isDefault: false,
    sortOrder: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Imports (after mock setup)
// ---------------------------------------------------------------------------

import { ensureDefaults, listTemplates, getTemplateById, getActiveByCategory } from './template-queries';
import { createTemplate, updateTemplate, removeTemplate, resetToDefaults } from './template-mutations';

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// ensureDefaults
// ===========================================================================

describe('ensureDefaults', () => {
  it('seeds 8 default templates when the table is empty', async () => {
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 8 });

    await ensureDefaults(mockDb);

    expect(mockDb.emailTemplate.count).toHaveBeenCalledOnce();
    expect(mockDb.emailTemplate.createMany).toHaveBeenCalledOnce();

    const callArg = (mockDb.emailTemplate.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data).toHaveLength(8);
  });

  it('does nothing when the table already has rows', async () => {
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(3);

    await ensureDefaults(mockDb);

    expect(mockDb.emailTemplate.count).toHaveBeenCalledOnce();
    expect(mockDb.emailTemplate.createMany).not.toHaveBeenCalled();
  });

  it('seeds templates with isDefault: true', async () => {
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 8 });

    await ensureDefaults(mockDb);

    const { data } = (mockDb.emailTemplate.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.every((t: { isDefault: boolean }) => t.isDefault === true)).toBe(true);
  });

  it('seeds templates across the expected categories', async () => {
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 8 });

    await ensureDefaults(mockDb);

    const { data } = (mockDb.emailTemplate.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const categories = [...new Set(data.map((t: { category: string }) => t.category))];
    expect(categories).toEqual(expect.arrayContaining(['fitting', 'order', 'fabric', 'followup', 'welcome']));
  });
});

// ===========================================================================
// listTemplates
// ===========================================================================

describe('listTemplates', () => {
  it('returns all templates with no filters', async () => {
    const templates = [makeTemplate(), makeTemplate({ id: 'tmpl-2', name: 'Welcome' })];
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue(templates);

    const result = await listTemplates(mockDb);

    expect(result).toEqual(templates);
    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('filters by category', async () => {
    const templates = [makeTemplate({ category: 'order' })];
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue(templates);

    const result = await listTemplates(mockDb, { category: 'order' });

    expect(result).toEqual(templates);
    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'order' } })
    );
  });

  it('filters by isActive: true', async () => {
    const templates = [makeTemplate({ isActive: true })];
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue(templates);

    const result = await listTemplates(mockDb, { isActive: true });

    expect(result).toEqual(templates);
    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });

  it('filters by isActive: false', async () => {
    const templates = [makeTemplate({ isActive: false })];
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue(templates);

    await listTemplates(mockDb, { isActive: false });

    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: false } })
    );
  });

  it('filters by both category and isActive', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    await listTemplates(mockDb, { category: 'fitting', isActive: true });

    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'fitting', isActive: true } })
    );
  });

  it('applies a take limit of 100', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    await listTemplates(mockDb);

    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it('orders by category, sortOrder, then name', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    await listTemplates(mockDb);

    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      })
    );
  });

  it('returns an empty array when no templates exist', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    const result = await listTemplates(mockDb);

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// getTemplateById
// ===========================================================================

describe('getTemplateById', () => {
  it('returns the template when found', async () => {
    const template = makeTemplate();
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(template);

    const result = await getTemplateById(mockDb, 'tmpl-1');

    expect(result).toEqual(template);
    expect(mockDb.emailTemplate.findUnique).toHaveBeenCalledWith({ where: { id: 'tmpl-1' } });
  });

  it('throws EmailTemplateNotFoundError when template does not exist', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    await expect(getTemplateById(mockDb, 'ghost-id')).rejects.toThrow(EmailTemplateNotFoundError);
  });

  it('includes the ID in the error message', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    await expect(getTemplateById(mockDb, 'missing-id')).rejects.toThrow('missing-id');
  });

  it('has the correct error name', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    const err = await getTemplateById(mockDb, 'x').catch((e) => e);
    expect(err.name).toBe('EmailTemplateNotFoundError');
  });
});

// ===========================================================================
// getActiveByCategory
// ===========================================================================

describe('getActiveByCategory', () => {
  it('returns active templates for the given category', async () => {
    const templates = [makeTemplate({ category: 'order', isActive: true })];
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue(templates);

    const result = await getActiveByCategory(mockDb, 'order');

    expect(result).toEqual(templates);
    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'order', isActive: true } })
    );
  });

  it('applies a take limit of 50', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    await getActiveByCategory(mockDb, 'fitting');

    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it('orders by sortOrder then name', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    await getActiveByCategory(mockDb, 'fitting');

    expect(mockDb.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
    );
  });

  it('returns an empty array when no active templates exist in the category', async () => {
    mockDb.emailTemplate.findMany = vi.fn().mockResolvedValue([]);

    const result = await getActiveByCategory(mockDb, 'nonexistent');

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// createTemplate
// ===========================================================================

describe('createTemplate', () => {
  it('creates and returns a new template', async () => {
    const created = makeTemplate({ name: 'New Template' });
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    const result = await createTemplate(mockDb, {
      name: 'New Template',
      category: 'order',
      subject: 'Subject',
      bodyHtml: '<p>Body</p>',
    });

    expect(result).toEqual(created);
  });

  it('calls db.emailTemplate.create with correct data', async () => {
    const created = makeTemplate({ name: 'New Template' });
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    await createTemplate(mockDb, {
      name: 'New Template',
      category: 'order',
      subject: 'Subject',
      bodyHtml: '<p>Body</p>',
    });

    expect(mockDb.emailTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'New Template',
          category: 'order',
          subject: 'Subject',
          bodyHtml: '<p>Body</p>',
          isDefault: false,
        }),
      })
    );
  });

  it('defaults isActive to true when not provided', async () => {
    const created = makeTemplate({ isActive: true });
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    await createTemplate(mockDb, {
      name: 'New Template',
      category: 'order',
      subject: 'Subject',
      bodyHtml: '<p>Body</p>',
    });

    const callArg = (mockDb.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data.isActive).toBe(true);
  });

  it('defaults sortOrder to 0 when not provided', async () => {
    const created = makeTemplate({ sortOrder: 0 });
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    await createTemplate(mockDb, {
      name: 'New Template',
      category: 'order',
      subject: 'Subject',
      bodyHtml: '<p>Body</p>',
    });

    const callArg = (mockDb.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data.sortOrder).toBe(0);
  });

  it('respects explicit isActive: false', async () => {
    const created = makeTemplate({ isActive: false });
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    await createTemplate(mockDb, {
      name: 'New Template',
      category: 'order',
      subject: 'Subject',
      bodyHtml: '<p>Body</p>',
      isActive: false,
    });

    const callArg = (mockDb.emailTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.data.isActive).toBe(false);
  });

  it('throws EmailTemplateDuplicateError when a template with the same name exists', async () => {
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(makeTemplate());

    await expect(
      createTemplate(mockDb, {
        name: 'Order Confirmation',
        category: 'order',
        subject: 'Subject',
        bodyHtml: '<p>Body</p>',
      })
    ).rejects.toThrow(EmailTemplateDuplicateError);
  });

  it('includes the duplicate name in the error message', async () => {
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(makeTemplate({ name: 'Clash' }));

    const err = await createTemplate(mockDb, {
      name: 'Clash',
      category: 'order',
      subject: 'S',
      bodyHtml: '<p>B</p>',
    }).catch((e) => e);

    expect(err.message).toContain('Clash');
  });

  it('has the correct error name on duplicate', async () => {
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(makeTemplate());

    const err = await createTemplate(mockDb, {
      name: 'Order Confirmation',
      category: 'order',
      subject: 'S',
      bodyHtml: '<p>B</p>',
    }).catch((e) => e);

    expect(err.name).toBe('EmailTemplateDuplicateError');
  });

  it('invokes onActivity callback after creation', async () => {
    const created = makeTemplate({ id: 'tmpl-new', name: 'New Template' });
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    const onActivity = vi.fn();

    await createTemplate(
      mockDb,
      { name: 'New Template', category: 'order', subject: 'S', bodyHtml: '<p>B</p>' },
      { onActivity }
    );

    expect(onActivity).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_TEMPLATE_CREATED',
      expect.stringContaining('New Template'),
      expect.objectContaining({ templateId: 'tmpl-new', name: 'New Template' })
    );
  });

  it('does not throw when callbacks are omitted', async () => {
    const created = makeTemplate();
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.create = vi.fn().mockResolvedValue(created);

    await expect(
      createTemplate(mockDb, {
        name: 'New Template',
        category: 'order',
        subject: 'S',
        bodyHtml: '<p>B</p>',
      })
    ).resolves.not.toThrow();
  });
});

// ===========================================================================
// updateTemplate
// ===========================================================================

describe('updateTemplate', () => {
  it('returns the updated template', async () => {
    const existing = makeTemplate();
    const updated = makeTemplate({ subject: 'New Subject' });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.update = vi.fn().mockResolvedValue(updated);

    const result = await updateTemplate(mockDb, 'tmpl-1', { subject: 'New Subject' });

    expect(result).toEqual(updated);
  });

  it('calls db.emailTemplate.update with the provided fields', async () => {
    const existing = makeTemplate();
    const updated = makeTemplate({ isActive: false });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.update = vi.fn().mockResolvedValue(updated);

    await updateTemplate(mockDb, 'tmpl-1', { isActive: false });

    expect(mockDb.emailTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tmpl-1' },
      data: { isActive: false },
    });
  });

  it('throws EmailTemplateNotFoundError when the template does not exist', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    await expect(updateTemplate(mockDb, 'ghost', { subject: 'X' })).rejects.toThrow(
      EmailTemplateNotFoundError
    );
  });

  it('includes the ID in the not-found error message', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    const err = await updateTemplate(mockDb, 'missing-id', {}).catch((e) => e);
    expect(err.message).toContain('missing-id');
  });

  it('throws EmailTemplateDuplicateError when renaming to a name that already exists', async () => {
    const existing = makeTemplate({ name: 'Old Name' });
    const clash = makeTemplate({ id: 'tmpl-other', name: 'Taken Name' });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(clash);

    await expect(
      updateTemplate(mockDb, 'tmpl-1', { name: 'Taken Name' })
    ).rejects.toThrow(EmailTemplateDuplicateError);
  });

  it('does NOT check for duplicate name when name is unchanged', async () => {
    const existing = makeTemplate({ name: 'Same Name' });
    const updated = makeTemplate({ name: 'Same Name' });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.update = vi.fn().mockResolvedValue(updated);

    await updateTemplate(mockDb, 'tmpl-1', { name: 'Same Name' });

    // findFirst for duplicate check should NOT be called
    expect(mockDb.emailTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('does NOT check for duplicate name when name is not part of the update', async () => {
    const existing = makeTemplate();
    const updated = makeTemplate({ isActive: false });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.update = vi.fn().mockResolvedValue(updated);

    await updateTemplate(mockDb, 'tmpl-1', { isActive: false });

    expect(mockDb.emailTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('checks for duplicate name excluding the current template ID', async () => {
    const existing = makeTemplate({ name: 'Old Name' });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.update = vi.fn().mockResolvedValue(makeTemplate({ name: 'New Name' }));

    await updateTemplate(mockDb, 'tmpl-1', { name: 'New Name' });

    expect(mockDb.emailTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'tmpl-1' } }),
      })
    );
  });

  it('invokes onActivity callback after update', async () => {
    const existing = makeTemplate();
    const updated = makeTemplate({ subject: 'Updated' });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(existing);
    mockDb.emailTemplate.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.emailTemplate.update = vi.fn().mockResolvedValue(updated);

    const onActivity = vi.fn();

    await updateTemplate(mockDb, 'tmpl-1', { subject: 'Updated' }, { onActivity });

    expect(onActivity).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_TEMPLATE_UPDATED',
      expect.any(String),
      expect.objectContaining({ templateId: 'tmpl-1' })
    );
  });
});

// ===========================================================================
// removeTemplate
// ===========================================================================

describe('removeTemplate', () => {
  it('deletes a non-default template', async () => {
    const template = makeTemplate({ isDefault: false });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(template);
    mockDb.emailTemplate.delete = vi.fn().mockResolvedValue(template);

    await removeTemplate(mockDb, 'tmpl-1');

    expect(mockDb.emailTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tmpl-1' } });
  });

  it('throws EmailTemplateNotFoundError when the template does not exist', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    await expect(removeTemplate(mockDb, 'ghost')).rejects.toThrow(EmailTemplateNotFoundError);
  });

  it('includes the ID in the not-found error message', async () => {
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(null);

    const err = await removeTemplate(mockDb, 'gone-id').catch((e) => e);
    expect(err.message).toContain('gone-id');
  });

  it('throws DefaultTemplateDeletionError when attempting to delete a default template', async () => {
    const defaultTemplate = makeTemplate({ isDefault: true });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(defaultTemplate);

    await expect(removeTemplate(mockDb, 'tmpl-1')).rejects.toThrow(DefaultTemplateDeletionError);
  });

  it('has the correct error name for default template deletion', async () => {
    const defaultTemplate = makeTemplate({ isDefault: true });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(defaultTemplate);

    const err = await removeTemplate(mockDb, 'tmpl-1').catch((e) => e);
    expect(err.name).toBe('DefaultTemplateDeletionError');
  });

  it('does NOT call delete when the template is a default', async () => {
    const defaultTemplate = makeTemplate({ isDefault: true });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(defaultTemplate);

    await removeTemplate(mockDb, 'tmpl-1').catch(() => {});

    expect(mockDb.emailTemplate.delete).not.toHaveBeenCalled();
  });

  it('invokes onActivity callback after deletion', async () => {
    const template = makeTemplate({ name: 'Custom Template', isDefault: false });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(template);
    mockDb.emailTemplate.delete = vi.fn().mockResolvedValue(template);

    const onActivity = vi.fn();

    await removeTemplate(mockDb, 'tmpl-1', { onActivity });

    expect(onActivity).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_TEMPLATE_DELETED',
      expect.stringContaining('Custom Template'),
      expect.objectContaining({ templateId: 'tmpl-1', name: 'Custom Template' })
    );
  });

  it('does not invoke onActivity when template is a default (throws before callback)', async () => {
    const defaultTemplate = makeTemplate({ isDefault: true });
    mockDb.emailTemplate.findUnique = vi.fn().mockResolvedValue(defaultTemplate);

    const onActivity = vi.fn();

    await removeTemplate(mockDb, 'tmpl-1', { onActivity }).catch(() => {});

    expect(onActivity).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// resetToDefaults
// ===========================================================================

describe('resetToDefaults', () => {
  it('deletes all templates first', async () => {
    mockDb.emailTemplate.deleteMany = vi.fn().mockResolvedValue({ count: 5 });
    // After deleteMany, ensureDefaults will call count() → 0 → createMany()
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 8 });

    await resetToDefaults(mockDb);

    expect(mockDb.emailTemplate.deleteMany).toHaveBeenCalledWith({});
  });

  it('re-seeds default templates after deletion', async () => {
    mockDb.emailTemplate.deleteMany = vi.fn().mockResolvedValue({ count: 5 });
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 8 });

    await resetToDefaults(mockDb);

    expect(mockDb.emailTemplate.createMany).toHaveBeenCalledOnce();
    const { data } = (mockDb.emailTemplate.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data).toHaveLength(8);
  });

  it('calls deleteMany before createMany (order matters)', async () => {
    const callOrder: string[] = [];
    mockDb.emailTemplate.deleteMany = vi.fn().mockImplementation(async () => {
      callOrder.push('deleteMany');
      return { count: 3 };
    });
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockImplementation(async () => {
      callOrder.push('createMany');
      return { count: 8 };
    });

    await resetToDefaults(mockDb);

    expect(callOrder).toEqual(['deleteMany', 'createMany']);
  });

  it('invokes onActivity callback with EMAIL_TEMPLATE_RESET', async () => {
    mockDb.emailTemplate.deleteMany = vi.fn().mockResolvedValue({ count: 5 });
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(0);
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 8 });

    const onActivity = vi.fn();

    await resetToDefaults(mockDb, { onActivity });

    expect(onActivity).toHaveBeenCalledOnce();
    expect(onActivity).toHaveBeenCalledWith(
      'EMAIL_TEMPLATE_RESET',
      expect.stringContaining('defaults'),
      expect.any(Object)
    );
  });

  it('does not re-seed when table is not empty after deleteMany (guard works)', async () => {
    // Edge case: if deleteMany somehow leaves rows (shouldn't happen but guard is there)
    mockDb.emailTemplate.deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    mockDb.emailTemplate.count = vi.fn().mockResolvedValue(2); // already has rows
    mockDb.emailTemplate.createMany = vi.fn().mockResolvedValue({ count: 0 });

    await resetToDefaults(mockDb);

    // ensureDefaults will bail because count > 0
    expect(mockDb.emailTemplate.createMany).not.toHaveBeenCalled();
  });
});
