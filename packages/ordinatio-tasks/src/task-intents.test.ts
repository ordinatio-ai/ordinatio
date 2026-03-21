// ===========================================
// TASK ENGINE — INTENT TESTS
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createIntent,
  updateIntent,
  activateIntent,
  satisfyIntent,
  checkCriteriaMet,
  failIntent,
  getIntent,
  getIntents,
  getIntentsForEntity,
  getUnsatisfiedIntents,
  addIntentDependency,
  removeIntentDependency,
  spawnTasksForIntent,
} from './task-intents';
import {
  IntentNotFoundError,
  IntentCriteriaNotMetError,
  InvalidStatusTransitionError,
} from './types';

function createMockDb() {
  return {
    taskIntent: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    intentDependency: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
  } as any;
}

describe('task-intents', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  // --- createIntent ---

  describe('createIntent', () => {
    it('creates an intent with success criteria', async () => {
      db.taskIntent.create.mockResolvedValue({
        id: 'intent-1',
        title: 'Client measurements confirmed',
        status: 'PROPOSED',
        entityType: 'Client',
        entityId: 'c-1',
        createdBy: 'user-1',
      });

      const result = await createIntent(db, {
        title: 'Client measurements confirmed',
        successCriteria: { measurements_verified: true, confirmed_by: 'clothier' },
        entityType: 'Client',
        entityId: 'c-1',
        createdBy: 'user-1',
      });

      expect(result.id).toBe('intent-1');
      expect(result.status).toBe('PROPOSED');
    });

    it('emits INTENT_CREATED event', async () => {
      db.taskIntent.create.mockResolvedValue({
        id: 'intent-1', title: 'Test', entityType: null, entityId: null, createdBy: 'user-1',
      });

      const onEvent = vi.fn();
      await createIntent(db, {
        title: 'Test',
        successCriteria: { done: true },
        createdBy: 'user-1',
      }, { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'INTENT_CREATED' }));
    });

    it('calls onActivity callback', async () => {
      db.taskIntent.create.mockResolvedValue({
        id: 'intent-1', title: 'Test', createdBy: 'user-1',
      });

      const onActivity = vi.fn();
      await createIntent(db, {
        title: 'Test',
        successCriteria: { done: true },
        createdBy: 'user-1',
      }, { onActivity });

      expect(onActivity).toHaveBeenCalledWith('INTENT_CREATED', expect.any(String), expect.any(Object));
    });
  });

  // --- updateIntent ---

  describe('updateIntent', () => {
    it('updates intent fields', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'intent-1' });
      db.taskIntent.update.mockResolvedValue({ id: 'intent-1', title: 'Updated' });

      const result = await updateIntent(db, 'intent-1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('throws IntentNotFoundError', async () => {
      db.taskIntent.findUnique.mockResolvedValue(null);
      await expect(updateIntent(db, 'nope', { title: 'X' })).rejects.toThrow(IntentNotFoundError);
    });
  });

  // --- activateIntent ---

  describe('activateIntent', () => {
    it('moves PROPOSED → ACTIVE', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1', status: 'PROPOSED' });
      db.taskIntent.update.mockResolvedValue({ id: 'i-1', status: 'ACTIVE' });

      const result = await activateIntent(db, 'i-1');
      expect(result.status).toBe('ACTIVE');
    });

    it('throws InvalidStatusTransitionError for non-PROPOSED', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1', status: 'ACTIVE' });
      await expect(activateIntent(db, 'i-1')).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('throws IntentNotFoundError', async () => {
      db.taskIntent.findUnique.mockResolvedValue(null);
      await expect(activateIntent(db, 'nope')).rejects.toThrow(IntentNotFoundError);
    });
  });

  // --- checkCriteriaMet (pure function) ---

  describe('checkCriteriaMet', () => {
    it('returns met=true when all criteria match', () => {
      const result = checkCriteriaMet(
        { verified: true, count: 5 },
        { verified: true, count: 5, extra: 'ignored' }
      );
      expect(result.met).toBe(true);
      expect(result.unmet).toHaveLength(0);
    });

    it('returns met=false with unmet keys', () => {
      const result = checkCriteriaMet(
        { verified: true, approved: true },
        { verified: true, approved: false }
      );
      expect(result.met).toBe(false);
      expect(result.unmet).toEqual(['approved']);
    });

    it('returns met=false when key missing from verification', () => {
      const result = checkCriteriaMet(
        { required_field: true },
        {}
      );
      expect(result.met).toBe(false);
      expect(result.unmet).toEqual(['required_field']);
    });

    it('handles empty criteria', () => {
      const result = checkCriteriaMet({}, {});
      expect(result.met).toBe(true);
    });
  });

  // --- satisfyIntent ---

  describe('satisfyIntent', () => {
    it('marks intent as SATISFIED when criteria met', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1',
        title: 'Test',
        status: 'ACTIVE',
        successCriteria: { done: true },
        entityType: 'Client',
        entityId: 'c-1',
      });
      db.taskIntent.update.mockResolvedValue({ id: 'i-1', status: 'SATISFIED' });

      const result = await satisfyIntent(db, 'i-1', {
        verificationData: { done: true },
        userId: 'user-1',
      });

      expect(result.status).toBe('SATISFIED');
      expect(db.taskIntent.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'SATISFIED' }),
      }));
    });

    it('throws IntentCriteriaNotMetError when criteria fail', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1', status: 'ACTIVE', successCriteria: { done: true },
      });

      await expect(
        satisfyIntent(db, 'i-1', { verificationData: { done: false } })
      ).rejects.toThrow(IntentCriteriaNotMetError);
    });

    it('throws IntentNotFoundError', async () => {
      db.taskIntent.findUnique.mockResolvedValue(null);
      await expect(
        satisfyIntent(db, 'nope', { verificationData: {} })
      ).rejects.toThrow(IntentNotFoundError);
    });

    it('throws InvalidStatusTransitionError for wrong status', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1', status: 'SATISFIED', successCriteria: {},
      });
      await expect(
        satisfyIntent(db, 'i-1', { verificationData: {} })
      ).rejects.toThrow(InvalidStatusTransitionError);
    });

    it('emits INTENT_SATISFIED event', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1', title: 'T', status: 'ACTIVE', successCriteria: { x: 1 },
        entityType: null, entityId: null,
      });
      db.taskIntent.update.mockResolvedValue({ id: 'i-1', status: 'SATISFIED' });

      const onEvent = vi.fn();
      await satisfyIntent(db, 'i-1', { verificationData: { x: 1 } }, { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'INTENT_SATISFIED' }));
    });

    it('works with IN_PROGRESS status', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1', title: 'T', status: 'IN_PROGRESS', successCriteria: { ok: true },
      });
      db.taskIntent.update.mockResolvedValue({ id: 'i-1', status: 'SATISFIED' });

      const result = await satisfyIntent(db, 'i-1', { verificationData: { ok: true } });
      expect(result.status).toBe('SATISFIED');
    });
  });

  // --- failIntent ---

  describe('failIntent', () => {
    it('marks intent as FAILED', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1', title: 'T' });
      db.taskIntent.update.mockResolvedValue({ id: 'i-1', status: 'FAILED' });

      const result = await failIntent(db, 'i-1', 'Client unreachable');
      expect(result.status).toBe('FAILED');
    });

    it('emits INTENT_FAILED event', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1', title: 'T' });
      db.taskIntent.update.mockResolvedValue({ id: 'i-1', status: 'FAILED' });

      const onEvent = vi.fn();
      await failIntent(db, 'i-1', 'reason', 'user-1', { onEvent });

      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'INTENT_FAILED' }));
    });

    it('throws IntentNotFoundError', async () => {
      db.taskIntent.findUnique.mockResolvedValue(null);
      await expect(failIntent(db, 'nope', 'reason')).rejects.toThrow(IntentNotFoundError);
    });
  });

  // --- getIntent ---

  describe('getIntent', () => {
    it('returns intent with tasks and dependencies', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1', title: 'Test', tasks: [], dependsOn: [], dependedOnBy: [],
      });

      const result = await getIntent(db, 'i-1');
      expect(result.id).toBe('i-1');
    });

    it('throws IntentNotFoundError', async () => {
      db.taskIntent.findUnique.mockResolvedValue(null);
      await expect(getIntent(db, 'nope')).rejects.toThrow(IntentNotFoundError);
    });
  });

  // --- getIntents ---

  describe('getIntents', () => {
    it('returns paginated intents', async () => {
      db.taskIntent.findMany.mockResolvedValue([{ id: 'i-1' }]);
      db.taskIntent.count.mockResolvedValue(1);

      const result = await getIntents(db);
      expect(result.intents).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters by status', async () => {
      db.taskIntent.count.mockResolvedValue(0);
      await getIntents(db, { status: 'ACTIVE' });
      expect(db.taskIntent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) })
      );
    });

    it('filters by entityType', async () => {
      db.taskIntent.count.mockResolvedValue(0);
      await getIntents(db, { entityType: 'Order' });
      expect(db.taskIntent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ entityType: 'Order' }) })
      );
    });
  });

  // --- getIntentsForEntity ---

  describe('getIntentsForEntity', () => {
    it('returns intents for an entity', async () => {
      db.taskIntent.findMany.mockResolvedValue([{ id: 'i-1' }]);
      const result = await getIntentsForEntity(db, 'Client', 'c-1');
      expect(result).toHaveLength(1);
    });
  });

  // --- getUnsatisfiedIntents ---

  describe('getUnsatisfiedIntents', () => {
    it('returns active/in-progress intents', async () => {
      await getUnsatisfiedIntents(db);
      expect(db.taskIntent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['ACTIVE', 'IN_PROGRESS'] } }),
        })
      );
    });

    it('filters by agentRole', async () => {
      await getUnsatisfiedIntents(db, { agentRole: 'coo' });
      expect(db.taskIntent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentRole: 'coo' }),
        })
      );
    });
  });

  // --- addIntentDependency ---

  describe('addIntentDependency', () => {
    it('creates an intent dependency', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1' });
      db.intentDependency.create.mockResolvedValue({ id: 'dep-1' });

      await addIntentDependency(db, 'i-a', 'i-b');
      expect(db.intentDependency.create).toHaveBeenCalledWith({
        data: { dependentIntentId: 'i-a', requiredIntentId: 'i-b' },
      });
    });

    it('throws on self-reference', async () => {
      await expect(addIntentDependency(db, 'i-1', 'i-1')).rejects.toThrow();
    });

    it('throws IntentNotFoundError when dependent missing', async () => {
      db.taskIntent.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'i-b' });
      await expect(addIntentDependency(db, 'missing', 'i-b')).rejects.toThrow(IntentNotFoundError);
    });
  });

  // --- removeIntentDependency ---

  describe('removeIntentDependency', () => {
    it('removes an intent dependency', async () => {
      db.intentDependency.deleteMany.mockResolvedValue({ count: 1 });
      await removeIntentDependency(db, 'i-a', 'i-b');
      expect(db.intentDependency.deleteMany).toHaveBeenCalled();
    });
  });

  // --- spawnTasksForIntent ---

  describe('spawnTasksForIntent', () => {
    it('creates tasks linked to an intent', async () => {
      db.taskIntent.findUnique.mockResolvedValue({
        id: 'i-1', status: 'ACTIVE', entityType: 'Client', entityId: 'c-1',
      });
      db.taskIntent.update.mockResolvedValue({});

      let counter = 0;
      db.task.create.mockImplementation(() => {
        counter++;
        return Promise.resolve({ id: `t-${counter}` });
      });

      const ids = await spawnTasksForIntent(db, 'i-1', [
        { title: 'Send invoice' },
        { title: 'Confirm receipt' },
      ], 'user-1');

      expect(ids).toHaveLength(2);
      // Tasks should have intentId set
      const call1 = db.task.create.mock.calls[0][0];
      expect(call1.data.intentId).toBe('i-1');
      expect(call1.data.entityType).toBe('Client');
    });

    it('moves intent to IN_PROGRESS when ACTIVE', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1', status: 'ACTIVE' });
      db.taskIntent.update.mockResolvedValue({});
      db.task.create.mockResolvedValue({ id: 't-1' });

      await spawnTasksForIntent(db, 'i-1', [{ title: 'Task' }], 'user-1');

      expect(db.taskIntent.update).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: { status: 'IN_PROGRESS' },
      });
    });

    it('does not change status when not ACTIVE', async () => {
      db.taskIntent.findUnique.mockResolvedValue({ id: 'i-1', status: 'IN_PROGRESS' });
      db.task.create.mockResolvedValue({ id: 't-1' });

      await spawnTasksForIntent(db, 'i-1', [{ title: 'Task' }], 'user-1');

      expect(db.taskIntent.update).not.toHaveBeenCalled();
    });

    it('throws IntentNotFoundError', async () => {
      db.taskIntent.findUnique.mockResolvedValue(null);
      await expect(
        spawnTasksForIntent(db, 'nope', [{ title: 'X' }], 'user-1')
      ).rejects.toThrow(IntentNotFoundError);
    });
  });
});
