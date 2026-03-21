// ===========================================
// @ordinatio/entities — NOTES
// ===========================================
// CRUD for notes with rich text + file attachments.
// Entity-agnostic: entityType + entityId instead of clientId.
//
// In the S1701 monolith, the bridge maps to the existing
// ClientNote model (clientId). In standalone mode, uses
// the generic Note model (entityType + entityId).
// ===========================================

import type { PrismaClient, NoteKnowledgeCallbacks } from '../types';
import type { AttachmentInput } from './schemas';

interface CreateNoteInput {
  entityType: string;
  entityId: string;
  content: string;
  contentHtml?: string;
  isDraft?: boolean;
  authorId?: string | null;
  source?: string;
  attachments?: AttachmentInput[];
  fields?: Record<string, unknown>;
}

interface UpdateNoteInput {
  content?: string;
  contentHtml?: string;
  isDraft?: boolean;
  attachments?: AttachmentInput[];
}

interface ListNotesOptions {
  entityType: string;
  entityId: string;
  limit?: number;
  cursor?: string;
  isDraft?: boolean;
}

export async function createNote(
  db: PrismaClient,
  input: CreateNoteInput,
  callbacks?: NoteKnowledgeCallbacks,
) {
  const note = await db.clientNote.create({
    data: {
      clientId: input.entityId,
      content: input.content,
      contentHtml: input.contentHtml ?? null,
      isDraft: input.isDraft ?? false,
      authorId: input.authorId ?? null,
      source: input.source ?? 'MANUAL',
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: {
              create: input.attachments.map((a) => ({
                filename: a.filename,
                mimeType: a.mimeType,
                size: a.size,
                storagePath: a.storagePath,
              })),
            },
          }
        : {}),
    },
    include: {
      author: { select: { id: true, name: true } },
      attachments: true,
    },
  });

  if (!input.isDraft) {
    try {
      const truncated = truncateText(input.content, 200);
      await callbacks?.logActivity?.(
        'CLIENT_NOTE_ADDED',
        truncated,
        {
          userId: input.authorId ?? null,
          clientId: input.entityId,
          metadata: {
            noteId: note.id,
            contentPreview: truncateText(input.content, 500),
            source: input.source ?? 'MANUAL',
          },
        },
      );
    } catch {
      // Best-effort
    }
  }

  if (input.fields && Object.keys(input.fields).length > 0) {
    try {
      const source = input.source === 'AGENT' ? 'agent' : 'note';
      await callbacks?.setEntityFields?.(
        input.entityType,
        input.entityId,
        input.fields,
        source,
        note.id,
        1.0,
        input.authorId ?? undefined,
      );
    } catch {
      // Best-effort
    }
  }

  return note;
}

export async function updateNote(
  db: PrismaClient,
  noteId: string,
  entityId: string,
  input: UpdateNoteInput,
  callbacks?: NoteKnowledgeCallbacks,
) {
  const note = await db.clientNote.findFirst({
    where: { id: noteId, clientId: entityId },
  });

  if (!note) return null;

  const isPublishing = note.isDraft && input.isDraft === false;

  const updated = await db.clientNote.update({
    where: { id: noteId },
    data: {
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.contentHtml !== undefined ? { contentHtml: input.contentHtml } : {}),
      ...(input.isDraft !== undefined ? { isDraft: input.isDraft } : {}),
    },
    include: {
      author: { select: { id: true, name: true } },
      attachments: true,
    },
  });

  if (input.attachments !== undefined) {
    await db.noteAttachment.deleteMany({ where: { noteId } });
    if (input.attachments.length > 0) {
      await db.noteAttachment.createMany({
        data: input.attachments.map((a) => ({
          noteId,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          storagePath: a.storagePath,
        })),
      });
    }
  }

  if (isPublishing) {
    try {
      const noteContent = input.content ?? note.content;
      const truncated = truncateText(noteContent, 200);
      await callbacks?.logActivity?.(
        'CLIENT_NOTE_ADDED',
        truncated,
        {
          userId: note.authorId ?? null,
          clientId: entityId,
          metadata: {
            noteId,
            contentPreview: truncateText(noteContent, 500),
            source: note.source ?? 'MANUAL',
          },
        },
      );
    } catch {
      // Best-effort
    }
  }

  return db.clientNote.findUnique({
    where: { id: noteId },
    include: {
      author: { select: { id: true, name: true } },
      attachments: true,
    },
  });
}

export async function getNotes(
  db: PrismaClient,
  { entityId, limit = 50, cursor, isDraft }: Omit<ListNotesOptions, 'entityType'> & { entityId: string },
) {
  const notes = await db.clientNote.findMany({
    where: {
      clientId: entityId,
      ...(isDraft !== undefined ? { isDraft } : { isDraft: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, name: true } },
      attachments: true,
    },
  });

  const hasMore = notes.length > limit;
  const items = hasMore ? notes.slice(0, limit) : notes;
  const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

  return { items, nextCursor, hasMore };
}

export async function deleteNote(db: PrismaClient, noteId: string, entityId: string) {
  const note = await db.clientNote.findFirst({
    where: { id: noteId, clientId: entityId },
  });

  if (!note) return null;

  await db.clientNote.delete({ where: { id: noteId } });
  return note;
}

function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}
