import { describe, it, expect } from 'vitest';
import { simulateAutomation } from '../automation/simulation';
import { dagBuilder } from '../automation/dag-builder';
import type { HistoricalEvent, ActionSimulator } from '../automation/simulation';

function makeEvents(count: number, eventType: string = 'EMAIL_RECEIVED'): HistoricalEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    eventType,
    entityType: 'email',
    entityId: `msg-${i}`,
    data: { from: `user${i}@test.com`, subject: 'Inquiry' },
    occurredAt: new Date(Date.now() - (count - i) * 3600000), // 1 hour apart
  }));
}

describe('Simulation Mode', () => {
  const dag = dagBuilder('a')
    .action('a', 'CREATE_CONTACT', { email: '{{from}}' })
    .action('b', 'ADD_TAG_TO_CONTACT', { tagName: 'Lead' })
    .terminal('done', 'success')
    .build();

  describe('basic simulation', () => {
    it('counts fires for matching events', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(10),
      );
      expect(result.fireCount).toBe(10);
      expect(result.eventsAnalyzed).toBe(10);
    });

    it('filters by trigger event type', () => {
      const events = [
        ...makeEvents(5, 'EMAIL_RECEIVED'),
        ...makeEvents(3, 'ORDER_CREATED'),
      ];
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        events,
      );
      expect(result.fireCount).toBe(5);
    });

    it('limits events analyzed', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7, maxEvents: 3 },
        makeEvents(10),
      );
      expect(result.eventsAnalyzed).toBe(3);
    });

    it('returns zero for no matching events', () => {
      const result = simulateAutomation(
        { triggerEventType: 'ORDER_CREATED', dag, lookbackDays: 7 },
        makeEvents(10, 'EMAIL_RECEIVED'),
      );
      expect(result.fireCount).toBe(0);
    });
  });

  describe('condition evaluation', () => {
    it('counts condition passes', () => {
      const events = makeEvents(10);
      const result = simulateAutomation(
        {
          triggerEventType: 'EMAIL_RECEIVED',
          dag,
          lookbackDays: 7,
          conditions: [{ field: 'from', comparator: 'IS_NOT_EMPTY', value: '', groupIndex: 0 }],
        },
        events,
      );
      expect(result.conditionPassCount).toBe(10); // All have 'from' set
    });

    it('filters out events that fail conditions', () => {
      const events = [
        { eventType: 'EMAIL_RECEIVED', entityType: 'email', entityId: '1', data: { from: 'a@b.com' }, occurredAt: new Date() },
        { eventType: 'EMAIL_RECEIVED', entityType: 'email', entityId: '2', data: { from: '' }, occurredAt: new Date() },
      ];
      const result = simulateAutomation(
        {
          triggerEventType: 'EMAIL_RECEIVED',
          dag,
          lookbackDays: 7,
          conditions: [{ field: 'from', comparator: 'IS_NOT_EMPTY', value: '', groupIndex: 0 }],
        },
        events,
      );
      expect(result.fireCount).toBe(2);
      expect(result.conditionPassCount).toBe(1);
    });
  });

  describe('deduplication', () => {
    it('deduplicates same entity in same hour', () => {
      const now = new Date();
      const events: HistoricalEvent[] = [
        { eventType: 'EMAIL_RECEIVED', entityType: 'email', entityId: 'msg-1', data: { from: 'a@b.com' }, occurredAt: now },
        { eventType: 'EMAIL_RECEIVED', entityType: 'email', entityId: 'msg-1', data: { from: 'a@b.com' }, occurredAt: new Date(now.getTime() + 1000) },
      ];
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 1 },
        events,
      );
      expect(result.deduplicatedCount).toBe(1);
    });
  });

  describe('affected entities', () => {
    it('tracks affected entities', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(5),
      );
      expect(result.affectedEntities.length).toBe(5);
      expect(result.affectedEntities[0].entityType).toBe('email');
    });

    it('counts repeated entities', () => {
      const events: HistoricalEvent[] = [
        { eventType: 'EMAIL_RECEIVED', entityType: 'email', entityId: 'msg-1', data: { from: 'a@b.com' }, occurredAt: new Date(Date.now() - 7200000) },
        { eventType: 'EMAIL_RECEIVED', entityType: 'email', entityId: 'msg-1', data: { from: 'a@b.com' }, occurredAt: new Date() },
      ];
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 1 },
        events,
      );
      // Different hours so not deduplicated
      const entity = result.affectedEntities.find(e => e.entityId === 'msg-1');
      expect(entity?.times).toBe(2);
    });
  });

  describe('projected outcomes', () => {
    it('projects all actions as success by default', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(5),
      );
      expect(result.projectedOutcomes.length).toBe(2);
      expect(result.projectedOutcomes[0].estimatedSuccess).toBe(5);
      expect(result.projectedOutcomes[0].estimatedFailure).toBe(0);
    });

    it('uses custom action simulator', () => {
      const simulator: ActionSimulator = (actionType) => {
        if (actionType === 'CREATE_CONTACT') return { wouldSucceed: false, failureReason: 'Duplicate' };
        return { wouldSucceed: true };
      };

      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(5),
        simulator,
      );

      const contactOutcome = result.projectedOutcomes.find(o => o.actionType === 'CREATE_CONTACT')!;
      expect(contactOutcome.estimatedFailure).toBe(5);
      expect(contactOutcome.failureReasons).toContain('Duplicate');
    });
  });

  describe('risk assessment', () => {
    it('low risk for small volume safe actions', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(5),
      );
      expect(result.risk.level).toBe('low');
    });

    it('medium risk for high volume', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 30 },
        makeEvents(150),
      );
      expect(['medium', 'high']).toContain(result.risk.level);
    });

    it('flags irreversible actions at scale', () => {
      const emailDag = dagBuilder('a')
        .action('a', 'SEND_EMAIL')
        .terminal('done', 'success')
        .build();

      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag: emailDag, lookbackDays: 7 },
        makeEvents(20),
      );
      expect(result.risk.reasons.some(r => r.includes('irreversible'))).toBe(true);
    });
  });

  describe('confidence', () => {
    it('higher confidence with more data', () => {
      const low = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 1 },
        makeEvents(5),
      );
      const high = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 30 },
        makeEvents(200),
      );
      expect(high.confidence).toBeGreaterThan(low.confidence);
    });

    it('returns 0-1 range', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(50),
      );
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('daily breakdown', () => {
    it('groups by date', () => {
      const result = simulateAutomation(
        { triggerEventType: 'EMAIL_RECEIVED', dag, lookbackDays: 7 },
        makeEvents(10),
      );
      expect(result.dailyBreakdown.length).toBeGreaterThan(0);
      expect(result.dailyBreakdown[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
