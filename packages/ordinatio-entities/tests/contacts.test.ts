// ===========================================
// @ordinatio/entities — CONTACTS TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  getAllContacts,
  getContactById,
  getContactByEmail,
  createContact,
  updateContact,
  deleteContact,
  findOrCreateContact,
} from '../src/contacts/contacts';
import { ContactNotFoundError, ContactExistsError } from '../src/errors';

function createMockDb() {
  return {
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  } as any;
}

const SAMPLE_CONTACT = {
  id: 'contact-1',
  email: 'alice@example.com',
  name: 'Alice Smith',
  notes: null,
  source: 'MANUAL',
  convertedToClientId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ----- getAllContacts -----

describe('getAllContacts', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns paginated contacts with total count', async () => {
    const contacts = [SAMPLE_CONTACT];
    db.contact.findMany.mockResolvedValue(contacts);
    db.contact.count.mockResolvedValue(1);

    const result = await getAllContacts(db);

    expect(result.contacts).toEqual(contacts);
    expect(result.total).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('passes search filter to where clause', async () => {
    db.contact.findMany.mockResolvedValue([]);
    db.contact.count.mockResolvedValue(0);

    await getAllContacts(db, { search: 'alice' });

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'alice', mode: 'insensitive' } },
            { email: { contains: 'alice', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('excludes converted contacts by default', async () => {
    db.contact.findMany.mockResolvedValue([]);
    db.contact.count.mockResolvedValue(0);

    await getAllContacts(db);

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          convertedToClientId: null,
        }),
      }),
    );
  });

  it('includes converted contacts when excludeConverted is false', async () => {
    db.contact.findMany.mockResolvedValue([]);
    db.contact.count.mockResolvedValue(0);

    await getAllContacts(db, { excludeConverted: false });

    const callArgs = db.contact.findMany.mock.calls[0][0];
    expect(callArgs.where.convertedToClientId).toBeUndefined();
  });

  it('respects custom limit and offset', async () => {
    db.contact.findMany.mockResolvedValue([]);
    db.contact.count.mockResolvedValue(0);

    await getAllContacts(db, { limit: 10, offset: 20 });

    expect(db.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 20,
      }),
    );
  });
});

// ----- getContactById -----

describe('getContactById', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns the contact when found', async () => {
    db.contact.findUnique.mockResolvedValue(SAMPLE_CONTACT);

    const result = await getContactById(db, 'contact-1');

    expect(result).toEqual(SAMPLE_CONTACT);
    expect(db.contact.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1' },
        include: expect.objectContaining({
          tags: expect.any(Object),
          linkedEmails: expect.any(Object),
        }),
      }),
    );
  });

  it('throws ContactNotFoundError when contact does not exist', async () => {
    db.contact.findUnique.mockResolvedValue(null);

    await expect(getContactById(db, 'missing-id')).rejects.toThrow(ContactNotFoundError);
    await expect(getContactById(db, 'missing-id')).rejects.toThrow('Contact not found: missing-id');
  });
});

// ----- getContactByEmail -----

describe('getContactByEmail', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns contact matching the lowercased email', async () => {
    db.contact.findUnique.mockResolvedValue(SAMPLE_CONTACT);

    const result = await getContactByEmail(db, 'Alice@Example.com');

    expect(result).toEqual(SAMPLE_CONTACT);
    expect(db.contact.findUnique).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
    });
  });

  it('returns null when no contact matches', async () => {
    db.contact.findUnique.mockResolvedValue(null);

    const result = await getContactByEmail(db, 'nobody@example.com');

    expect(result).toBeNull();
  });
});

// ----- createContact -----

describe('createContact', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates a contact with normalized email', async () => {
    db.contact.findUnique.mockResolvedValue(null); // No existing
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);

    const result = await createContact(db, {
      email: 'ALICE@EXAMPLE.COM',
      name: 'Alice Smith',
    });

    expect(result).toEqual(SAMPLE_CONTACT);
    expect(db.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'alice@example.com',
        name: 'Alice Smith',
        source: 'MANUAL',
      }),
    });
  });

  it('throws ContactExistsError when email already exists', async () => {
    db.contact.findUnique.mockResolvedValue(SAMPLE_CONTACT);

    await expect(
      createContact(db, { email: 'alice@example.com' }),
    ).rejects.toThrow(ContactExistsError);
  });

  it('calls emitEvent callback on successful creation', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const emitEvent = vi.fn().mockResolvedValue(undefined);

    await createContact(db, { email: 'new@example.com', name: 'New' }, { emitEvent });

    expect(emitEvent).toHaveBeenCalledWith('CONTACT_CREATED', {
      entityType: 'contact',
      entityId: 'contact-1',
      data: expect.objectContaining({
        email: SAMPLE_CONTACT.email,
        name: SAMPLE_CONTACT.name,
      }),
    });
  });

  it('does not throw when emitEvent callback fails', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const emitEvent = vi.fn().mockRejectedValue(new Error('event bus down'));

    const result = await createContact(db, { email: 'safe@example.com' }, { emitEvent });

    expect(result).toEqual(SAMPLE_CONTACT);
  });

  it('calls setEntityFields callback when fields are provided', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const setEntityFields = vi.fn().mockResolvedValue(undefined);

    await createContact(
      db,
      { email: 'new@example.com', fields: { company: 'Acme Corp', title: 'CEO' } },
      { setEntityFields },
    );

    expect(setEntityFields).toHaveBeenCalledWith(
      'contact',
      'contact-1',
      { company: 'Acme Corp', title: 'CEO' },
      'MANUAL',
    );
  });

  it('succeeds even when setEntityFields callback fails', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const setEntityFields = vi.fn().mockRejectedValue(new Error('knowledge write failed'));

    const result = await createContact(
      db,
      { email: 'resilient@example.com', fields: { company: 'Test' } },
      { setEntityFields },
    );

    expect(result).toEqual(SAMPLE_CONTACT);
  });

  it('does not call setEntityFields when fields is empty', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const setEntityFields = vi.fn().mockResolvedValue(undefined);

    await createContact(
      db,
      { email: 'empty@example.com', fields: {} },
      { setEntityFields },
    );

    expect(setEntityFields).not.toHaveBeenCalled();
  });

  it('does not call setEntityFields when fields is undefined', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const setEntityFields = vi.fn().mockResolvedValue(undefined);

    await createContact(
      db,
      { email: 'nofields@example.com' },
      { setEntityFields },
    );

    expect(setEntityFields).not.toHaveBeenCalled();
  });

  it('passes correct source when custom source is provided', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);
    const setEntityFields = vi.fn().mockResolvedValue(undefined);

    await createContact(
      db,
      { email: 'imported@example.com', source: 'IMPORT', fields: { industry: 'Finance' } },
      { setEntityFields },
    );

    expect(setEntityFields).toHaveBeenCalledWith(
      'contact',
      'contact-1',
      { industry: 'Finance' },
      'IMPORT',
    );
  });
});

// ----- updateContact -----

describe('updateContact', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('updates an existing contact', async () => {
    db.contact.findUnique.mockResolvedValue(SAMPLE_CONTACT);
    const updated = { ...SAMPLE_CONTACT, name: 'Alice Updated' };
    db.contact.update.mockResolvedValue(updated);

    const result = await updateContact(db, 'contact-1', { name: 'Alice Updated' });

    expect(result).toEqual(updated);
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { name: 'Alice Updated' },
      include: { tags: { include: { tag: true } } },
    });
  });

  it('throws ContactNotFoundError when contact is missing', async () => {
    db.contact.findUnique.mockResolvedValue(null);

    await expect(
      updateContact(db, 'missing-id', { name: 'Nope' }),
    ).rejects.toThrow(ContactNotFoundError);
  });
});

// ----- deleteContact -----

describe('deleteContact', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('deletes an existing contact and returns success', async () => {
    db.contact.findUnique.mockResolvedValue(SAMPLE_CONTACT);
    db.contact.delete.mockResolvedValue(SAMPLE_CONTACT);

    const result = await deleteContact(db, 'contact-1');

    expect(result).toEqual({ success: true });
    expect(db.contact.delete).toHaveBeenCalledWith({ where: { id: 'contact-1' } });
  });

  it('throws ContactNotFoundError when contact is missing', async () => {
    db.contact.findUnique.mockResolvedValue(null);

    await expect(deleteContact(db, 'ghost-id')).rejects.toThrow(ContactNotFoundError);
    expect(db.contact.delete).not.toHaveBeenCalled();
  });
});

// ----- findOrCreateContact -----

describe('findOrCreateContact', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns existing contact without changes when name already set', async () => {
    db.contact.findUnique.mockResolvedValue(SAMPLE_CONTACT);

    const result = await findOrCreateContact(db, 'Alice@Example.com', 'Alice Smith');

    expect(result).toEqual(SAMPLE_CONTACT);
    expect(db.contact.create).not.toHaveBeenCalled();
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it('updates name on existing contact when name was missing', async () => {
    const namelessContact = { ...SAMPLE_CONTACT, name: null };
    db.contact.findUnique.mockResolvedValue(namelessContact);
    const updatedContact = { ...namelessContact, name: 'Alice Smith' };
    db.contact.update.mockResolvedValue(updatedContact);

    const result = await findOrCreateContact(db, 'alice@example.com', 'Alice Smith');

    expect(result).toEqual(updatedContact);
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'contact-1' },
      data: { name: 'Alice Smith' },
    });
  });

  it('creates a new contact when none exists', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    const newContact = { ...SAMPLE_CONTACT, id: 'contact-new', source: 'EMAIL_SYNC' };
    db.contact.create.mockResolvedValue(newContact);

    const result = await findOrCreateContact(db, 'new@example.com', 'New Person');

    expect(result).toEqual(newContact);
    expect(db.contact.create).toHaveBeenCalledWith({
      data: {
        email: 'new@example.com',
        name: 'New Person',
        source: 'EMAIL_SYNC',
      },
    });
  });

  it('uses custom source when provided', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.contact.create.mockResolvedValue(SAMPLE_CONTACT);

    await findOrCreateContact(db, 'test@example.com', null, 'IMPORT');

    expect(db.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'IMPORT' }),
    });
  });
});
