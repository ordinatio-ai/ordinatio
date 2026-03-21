// ===========================================
// @ordinatio/entities — NOTES TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: '__json_null__', InputJsonValue: {} },
}));

import {
  createNote,
  updateNote,
  getNotes,
  deleteNote,
} from '../src/notes/notes';
import type { NoteKnowledgeCallbacks } from '../src/types';

function createMockDb() {
  return {
    clientNote: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    noteAttachment: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  } as any;
}

const SAMPLE_NOTE = {
  id: 'note-1',
  clientId: 'client-1',
  content: 'Test note content',
  contentHtml: null,
  isDraft: false,
  authorId: 'user-1',
  source: 'MANUAL',
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'user-1', name: 'Test User' },
  attachments: [],
};

// ----- createNote -----

describe('createNote', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('creates a note with entity info mapped to clientId', async () => {
    db.clientNote.create.mockResolvedValue(SAMPLE_NOTE);

    const result = await createNote(db, {
      entityType: 'client',
      entityId: 'client-1',
      content: 'Test note content',
      authorId: 'user-1',
    });

    expect(result).toEqual(SAMPLE_NOTE);
    expect(db.clientNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          content: 'Test note content',
          isDraft: false,
          authorId: 'user-1',
          source: 'MANUAL',
        }),
        include: expect.objectContaining({
          author: expect.any(Object),
          attachments: true,
        }),
      }),
    );
  });

  it('calls logActivity callback for non-draft notes', async () => {
    db.clientNote.create.mockResolvedValue(SAMPLE_NOTE);
    const logActivity = vi.fn().mockResolvedValue(undefined);
    const callbacks: NoteKnowledgeCallbacks = { logActivity };

    await createNote(
      db,
      {
        entityType: 'client',
        entityId: 'client-1',
        content: 'Published note',
        authorId: 'user-1',
      },
      callbacks,
    );

    expect(logActivity).toHaveBeenCalledWith(
      'CLIENT_NOTE_ADDED',
      expect.any(String),
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'client-1',
        metadata: expect.objectContaining({ noteId: 'note-1' }),
      }),
    );
  });

  it('skips logActivity callback for draft notes', async () => {
    db.clientNote.create.mockResolvedValue({ ...SAMPLE_NOTE, isDraft: true });
    const logActivity = vi.fn().mockResolvedValue(undefined);
    const callbacks: NoteKnowledgeCallbacks = { logActivity };

    await createNote(
      db,
      {
        entityType: 'client',
        entityId: 'client-1',
        content: 'Draft note',
        isDraft: true,
        authorId: 'user-1',
      },
      callbacks,
    );

    expect(logActivity).not.toHaveBeenCalled();
  });

  it('calls setEntityFields when fields are provided', async () => {
    db.clientNote.create.mockResolvedValue(SAMPLE_NOTE);
    const setEntityFields = vi.fn().mockResolvedValue(undefined);
    const callbacks: NoteKnowledgeCallbacks = { setEntityFields };

    await createNote(
      db,
      {
        entityType: 'client',
        entityId: 'client-1',
        content: 'Note with fields',
        fields: { preferredColor: 'navy' },
        authorId: 'user-1',
      },
      callbacks,
    );

    expect(setEntityFields).toHaveBeenCalledWith(
      'client',
      'client-1',
      { preferredColor: 'navy' },
      'note',      // source (non-AGENT)
      'note-1',    // note id
      1.0,         // confidence
      'user-1',    // setBy
    );
  });

  it('handles missing callbacks gracefully', async () => {
    db.clientNote.create.mockResolvedValue(SAMPLE_NOTE);

    // Should not throw even without callbacks
    const result = await createNote(db, {
      entityType: 'client',
      entityId: 'client-1',
      content: 'Note without callbacks',
    });

    expect(result).toEqual(SAMPLE_NOTE);
  });

  it('creates attachments when provided', async () => {
    db.clientNote.create.mockResolvedValue(SAMPLE_NOTE);

    await createNote(db, {
      entityType: 'client',
      entityId: 'client-1',
      content: 'Note with attachments',
      attachments: [
        { filename: 'file.pdf', mimeType: 'application/pdf', size: 1024, storagePath: '/uploads/file.pdf' },
      ],
    });

    expect(db.clientNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: {
            create: [
              { filename: 'file.pdf', mimeType: 'application/pdf', size: 1024, storagePath: '/uploads/file.pdf' },
            ],
          },
        }),
      }),
    );
  });
});

// ----- updateNote -----

describe('updateNote', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns null when note does not exist', async () => {
    db.clientNote.findFirst.mockResolvedValue(null);

    const result = await updateNote(db, 'note-missing', 'client-1', { content: 'Updated' });

    expect(result).toBeNull();
    expect(db.clientNote.update).not.toHaveBeenCalled();
  });

  it('updates content of an existing note', async () => {
    const existing = { ...SAMPLE_NOTE, isDraft: false };
    db.clientNote.findFirst.mockResolvedValue(existing);
    db.clientNote.update.mockResolvedValue({ ...existing, content: 'Updated content' });
    db.clientNote.findUnique.mockResolvedValue({ ...existing, content: 'Updated content' });

    const result = await updateNote(db, 'note-1', 'client-1', { content: 'Updated content' });

    expect(db.clientNote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'note-1' },
        data: expect.objectContaining({ content: 'Updated content' }),
      }),
    );
    expect(result).toBeDefined();
  });

  it('calls logActivity when publishing a draft', async () => {
    const draftNote = { ...SAMPLE_NOTE, isDraft: true, authorId: 'user-1', source: 'MANUAL', content: 'Draft becoming published' };
    db.clientNote.findFirst.mockResolvedValue(draftNote);
    db.clientNote.update.mockResolvedValue({ ...draftNote, isDraft: false });
    db.clientNote.findUnique.mockResolvedValue({ ...draftNote, isDraft: false });

    const logActivity = vi.fn().mockResolvedValue(undefined);

    await updateNote(db, 'note-1', 'client-1', { isDraft: false }, { logActivity });

    expect(logActivity).toHaveBeenCalledWith(
      'CLIENT_NOTE_ADDED',
      expect.any(String),
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'client-1',
      }),
    );
  });

  it('does not call logActivity when updating a non-draft note', async () => {
    const publishedNote = { ...SAMPLE_NOTE, isDraft: false };
    db.clientNote.findFirst.mockResolvedValue(publishedNote);
    db.clientNote.update.mockResolvedValue(publishedNote);
    db.clientNote.findUnique.mockResolvedValue(publishedNote);

    const logActivity = vi.fn().mockResolvedValue(undefined);

    await updateNote(db, 'note-1', 'client-1', { content: 'Revised' }, { logActivity });

    expect(logActivity).not.toHaveBeenCalled();
  });

  it('replaces attachments when attachments array is provided', async () => {
    db.clientNote.findFirst.mockResolvedValue(SAMPLE_NOTE);
    db.clientNote.update.mockResolvedValue(SAMPLE_NOTE);
    db.clientNote.findUnique.mockResolvedValue(SAMPLE_NOTE);
    db.noteAttachment.deleteMany.mockResolvedValue({ count: 1 });
    db.noteAttachment.createMany.mockResolvedValue({ count: 1 });

    await updateNote(db, 'note-1', 'client-1', {
      attachments: [
        { filename: 'new.jpg', mimeType: 'image/jpeg', size: 2048, storagePath: '/uploads/new.jpg' },
      ],
    });

    expect(db.noteAttachment.deleteMany).toHaveBeenCalledWith({ where: { noteId: 'note-1' } });
    expect(db.noteAttachment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ noteId: 'note-1', filename: 'new.jpg' }),
      ],
    });
  });
});

// ----- getNotes -----

describe('getNotes', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('returns paginated notes with cursor support', async () => {
    const notes = Array.from({ length: 3 }, (_, i) => ({
      id: `note-${i}`,
      clientId: 'client-1',
      content: `Note ${i}`,
    }));
    db.clientNote.findMany.mockResolvedValue(notes);

    const result = await getNotes(db, { entityId: 'client-1', limit: 10 });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
  });

  it('detects hasMore when result exceeds limit', async () => {
    // Return limit+1 items to signal there are more
    const notes = Array.from({ length: 4 }, (_, i) => ({
      id: `note-${i}`,
      clientId: 'client-1',
      content: `Note ${i}`,
    }));
    db.clientNote.findMany.mockResolvedValue(notes);

    const result = await getNotes(db, { entityId: 'client-1', limit: 3 });

    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('note-2');
  });

  it('passes cursor for pagination', async () => {
    db.clientNote.findMany.mockResolvedValue([]);

    await getNotes(db, { entityId: 'client-1', limit: 10, cursor: 'note-5' });

    expect(db.clientNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'note-5' },
        skip: 1,
      }),
    );
  });

  it('respects isDraft filter', async () => {
    db.clientNote.findMany.mockResolvedValue([]);

    await getNotes(db, { entityId: 'client-1', isDraft: true });

    expect(db.clientNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: true }),
      }),
    );
  });

  it('defaults isDraft to false when not specified', async () => {
    db.clientNote.findMany.mockResolvedValue([]);

    await getNotes(db, { entityId: 'client-1' });

    expect(db.clientNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDraft: false }),
      }),
    );
  });
});

// ----- deleteNote -----

describe('deleteNote', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.restoreAllMocks();
  });

  it('deletes an existing note and returns it', async () => {
    db.clientNote.findFirst.mockResolvedValue(SAMPLE_NOTE);
    db.clientNote.delete.mockResolvedValue(SAMPLE_NOTE);

    const result = await deleteNote(db, 'note-1', 'client-1');

    expect(result).toEqual(SAMPLE_NOTE);
    expect(db.clientNote.delete).toHaveBeenCalledWith({ where: { id: 'note-1' } });
  });

  it('returns null when note does not exist', async () => {
    db.clientNote.findFirst.mockResolvedValue(null);

    const result = await deleteNote(db, 'note-missing', 'client-1');

    expect(result).toBeNull();
    expect(db.clientNote.delete).not.toHaveBeenCalled();
  });
});
