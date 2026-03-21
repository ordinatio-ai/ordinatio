// ===========================================
// @ordinatio/entities — INTERACTION ANALYTICS TESTS
// ===========================================

import { describe, it, expect } from 'vitest';

import {
  classifyIntent,
  extractTopic,
  extractModules,
} from '../src/agent/analytics';

describe('classifyIntent', () => {
  it('classifies /report as report', () => {
    expect(classifyIntent('/report monthly')).toBe('report');
  });

  it('classifies /tour as tour', () => {
    expect(classifyIntent('/tour dashboard')).toBe('tour');
  });

  it('classifies /automation as command', () => {
    expect(classifyIntent('/automation create new')).toBe('command');
  });

  it('classifies "generate" as command', () => {
    expect(classifyIntent('generate a CPA package')).toBe('command');
  });

  it('classifies "create" as command', () => {
    expect(classifyIntent('create a new order')).toBe('command');
  });

  it('classifies "delete" as command', () => {
    expect(classifyIntent('delete the old template')).toBe('command');
  });

  it('classifies "update" as command', () => {
    expect(classifyIntent('update the client profile')).toBe('command');
  });

  it('classifies "how" as question', () => {
    expect(classifyIntent('how do I check stock?')).toBe('question');
  });

  it('classifies "what" as question', () => {
    expect(classifyIntent('what is the order status')).toBe('question');
  });

  it('classifies "show" as search', () => {
    expect(classifyIntent('show me all clients')).toBe('search');
  });

  it('classifies "find" as search', () => {
    expect(classifyIntent('find fabric A754')).toBe('search');
  });

  it('classifies question mark as question', () => {
    expect(classifyIntent('is the order ready?')).toBe('question');
  });

  it('defaults to search for unmatched queries', () => {
    expect(classifyIntent('navy blue fabric options')).toBe('search');
  });

  it('is case-insensitive', () => {
    expect(classifyIntent('GENERATE a report')).toBe('command');
    expect(classifyIntent('HOW does this work')).toBe('question');
  });
});

describe('extractTopic', () => {
  it('matches fabric-related queries to fabric stock', () => {
    expect(extractTopic('check fabric availability')).toBe('fabric stock');
  });

  it('matches order-related queries to order management', () => {
    expect(extractTopic('what is the order status')).toBe('order management');
  });

  it('matches client-related queries to client management', () => {
    expect(extractTopic('find client by name')).toBe('client management');
  });

  it('matches tax-related queries to tax operations', () => {
    expect(extractTopic('categorize this transaction')).toBe('tax operations');
  });

  it('matches email template queries to email templates', () => {
    expect(extractTopic('create email template for followup')).toBe('email templates');
  });

  it('matches automation queries to automations', () => {
    expect(extractTopic('set up an automation workflow')).toBe('automations');
  });

  it('selects best topic by longest keyword match', () => {
    // "email template" (14 chars) beats "template" (8 chars) and "email" (5 chars)
    expect(extractTopic('show the email template list')).toBe('email templates');
  });

  it('matches report queries to reports', () => {
    expect(extractTopic('generate a summary report')).toBe('reports');
  });

  it('returns null when no topic matches', () => {
    expect(extractTopic('hello world xyz')).toBeNull();
  });

  it('matches fit profile queries to fit profiles', () => {
    expect(extractTopic('update the fit profile for jacket')).toBe('fit profiles');
  });
});

describe('extractModules', () => {
  it('maps email tool names to email module', () => {
    expect(extractModules(['emailSearch', 'emailGet'])).toEqual(['email']);
  });

  it('maps order tool names to orders module', () => {
    expect(extractModules(['orderSearch', 'orderUpdate'])).toEqual(['orders']);
  });

  it('maps multiple tool keywords to distinct modules', () => {
    const modules = extractModules(['emailSearch', 'orderGet', 'clientSearch']);
    expect(modules).toContain('email');
    expect(modules).toContain('orders');
    expect(modules).toContain('clients');
    expect(modules).toHaveLength(3);
  });

  it('deduplicates modules', () => {
    const modules = extractModules(['emailSearch', 'emailGet', 'templateRender']);
    expect(modules.filter((m) => m === 'email')).toHaveLength(1);
  });

  it('handles unknown tool names gracefully', () => {
    expect(extractModules(['unknownTool', 'anotherUnknown'])).toEqual([]);
  });

  it('maps tax and transaction tools to tax module', () => {
    const modules = extractModules(['taxPosition', 'transactionCategorize']);
    expect(modules).toContain('tax');
    expect(modules).toHaveLength(1);
  });

  it('maps fabric tool names to fabric module', () => {
    expect(extractModules(['fabricStockCheck'])).toEqual(['fabric']);
  });

  it('maps task tool names to tasks module', () => {
    expect(extractModules(['taskCreate', 'taskUpdate'])).toEqual(['tasks']);
  });

  it('returns empty array for empty input', () => {
    expect(extractModules([])).toEqual([]);
  });
});
