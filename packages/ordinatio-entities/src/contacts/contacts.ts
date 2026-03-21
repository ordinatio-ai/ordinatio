// ===========================================
// @ordinatio/entities — CONTACTS
// ===========================================
// Core CRUD for contact management.
// App-specific functions (searchByEmail, findClientByEmail)
// stay in the app bridge.
// ===========================================

import type { PrismaClient, NoteKnowledgeCallbacks } from '../types';
import { ContactNotFoundError, ContactExistsError } from '../errors';

export async function getAllContacts(db: PrismaClient, options?: {
  limit?: number;
  offset?: number;
  source?: string;
  search?: string;
  excludeConverted?: boolean;
}) {
  const {
    limit = 50,
    offset = 0,
    source,
    search,
    excludeConverted = true,
  } = options ?? {};

  const where: Record<string, unknown> = {};

  if (source) where.source = source;
  if (excludeConverted) where.convertedToClientId = null;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [contacts, total] = await Promise.all([
    db.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        _count: { select: { linkedEmails: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.contact.count({ where }),
  ]);

  return { contacts, total, limit, offset };
}

export async function getContactById(db: PrismaClient, id: string) {
  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      linkedEmails: {
        take: 10,
        orderBy: { emailDate: 'desc' },
        select: {
          id: true,
          subject: true,
          snippet: true,
          emailDate: true,
          status: true,
        },
      },
      _count: { select: { linkedEmails: true } },
    },
  });

  if (!contact) {
    throw new ContactNotFoundError(id);
  }

  return contact;
}

export async function getContactByEmail(db: PrismaClient, email: string) {
  return db.contact.findUnique({
    where: { email: email.toLowerCase() },
  });
}

export async function createContact(
  db: PrismaClient,
  params: {
    email: string;
    name?: string | null;
    notes?: string | null;
    source?: string;
    fields?: Record<string, unknown>;
  },
  callbacks?: NoteKnowledgeCallbacks,
) {
  const normalizedEmail = params.email.toLowerCase();

  const existing = await db.contact.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new ContactExistsError(normalizedEmail);
  }

  const contact = await db.contact.create({
    data: {
      email: normalizedEmail,
      name: params.name ?? null,
      notes: params.notes ?? null,
      source: params.source ?? 'MANUAL',
    },
  });

  try {
    await callbacks?.emitEvent?.('CONTACT_CREATED', {
      entityType: 'contact',
      entityId: contact.id,
      data: {
        email: contact.email,
        name: contact.name,
        source: contact.source,
      },
    });
  } catch {
    // Best-effort
  }

  // Write knowledge fields if provided
  if (params.fields && Object.keys(params.fields).length > 0) {
    try {
      await callbacks?.setEntityFields?.(
        'contact',
        contact.id,
        params.fields,
        params.source ?? 'MANUAL',
      );
    } catch {
      // Best-effort — contact creation succeeds even if knowledge write fails
    }
  }

  return contact;
}

export async function updateContact(
  db: PrismaClient,
  id: string,
  data: { name?: string | null; notes?: string | null },
) {
  const contact = await db.contact.findUnique({ where: { id } });

  if (!contact) {
    throw new ContactNotFoundError(id);
  }

  return db.contact.update({
    where: { id },
    data,
    include: {
      tags: { include: { tag: true } },
    },
  });
}

export async function deleteContact(db: PrismaClient, id: string) {
  const contact = await db.contact.findUnique({ where: { id } });

  if (!contact) {
    throw new ContactNotFoundError(id);
  }

  await db.contact.delete({ where: { id } });
  return { success: true };
}

export async function findOrCreateContact(
  db: PrismaClient,
  email: string,
  name?: string | null,
  source: string = 'EMAIL_SYNC',
) {
  const normalizedEmail = email.toLowerCase();

  const existing = await db.contact.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    if (name && !existing.name) {
      return db.contact.update({
        where: { id: existing.id },
        data: { name },
      });
    }
    return existing;
  }

  return db.contact.create({
    data: {
      email: normalizedEmail,
      name: name ?? null,
      source,
    },
  });
}
