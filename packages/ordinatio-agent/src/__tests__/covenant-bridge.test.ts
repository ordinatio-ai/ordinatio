import { describe, it, expect, beforeEach } from 'vitest';
import { registerCovenant, getCovenant, getCapabilitiesForRole, formatCapabilitiesForAgent, clearCovenants, createCovenantProvider } from '../covenant/covenant-bridge';

function makeCovenant(moduleId: string, capabilities: Array<{ id: string; name: string; risk: string }>) {
  return {
    identity: { id: moduleId, name: moduleId, version: '1.0.0' },
    capabilities: capabilities.map(c => ({
      id: c.id,
      description: `Capability ${c.name}`,
      type: 'action',
      risk: c.risk as 'observe' | 'suggest' | 'act' | 'govern',
      inputs: [],
      output: 'void',
      whenToUse: `When you need to ${c.name}`,
    })),
  };
}

describe('Covenant Bridge', () => {
  beforeEach(() => clearCovenants());

  it('starts empty', () => {
    expect(getCovenant('anything')).toBeUndefined();
  });

  it('registers and retrieves a covenant', () => {
    registerCovenant(makeCovenant('email-engine', [{ id: 'cap-1', name: 'send_email', risk: 'act' }]));
    const cov = getCovenant('email-engine');
    expect(cov).toBeDefined();
    expect(cov!.identity.id).toBe('email-engine');
  });

  it('getCapabilitiesForRole returns capabilities for matching modules', () => {
    registerCovenant(makeCovenant('email-engine', [
      { id: 'e1', name: 'sync_emails', risk: 'observe' },
      { id: 'e2', name: 'send_email', risk: 'act' },
      { id: 'e3', name: 'manage_accounts', risk: 'govern' },
    ]));
    registerCovenant(makeCovenant('task-engine', [
      { id: 't1', name: 'list_tasks', risk: 'observe' },
    ]));

    // Role has access to email-engine only
    const caps = getCapabilitiesForRole(['email-engine'], 'act');
    expect(caps.length).toBe(2); // observe + act, not govern
    expect(caps.some((c: any) => c.id === 'e1')).toBe(true);
    expect(caps.some((c: any) => c.id === 'e2')).toBe(true);
    expect(caps.some((c: any) => c.id === 'e3')).toBe(false); // govern excluded
  });

  it('getCapabilitiesForRole with maxRisk=observe only returns observe', () => {
    registerCovenant(makeCovenant('email-engine', [
      { id: 'e1', name: 'read', risk: 'observe' },
      { id: 'e2', name: 'suggest', risk: 'suggest' },
      { id: 'e3', name: 'write', risk: 'act' },
    ]));

    const caps = getCapabilitiesForRole(['email-engine'], 'observe');
    expect(caps.length).toBe(1);
    expect((caps[0] as any).id).toBe('e1');
  });

  it('getCapabilitiesForRole with maxRisk=govern returns everything', () => {
    registerCovenant(makeCovenant('mod', [
      { id: 'a', name: 'a', risk: 'observe' },
      { id: 'b', name: 'b', risk: 'suggest' },
      { id: 'c', name: 'c', risk: 'act' },
      { id: 'd', name: 'd', risk: 'govern' },
    ]));

    const caps = getCapabilitiesForRole(['mod'], 'govern');
    expect(caps.length).toBe(4);
  });

  it('formatCapabilitiesForAgent returns a non-empty string', () => {
    registerCovenant(makeCovenant('email-engine', [
      { id: 'e1', name: 'sync_emails', risk: 'observe' },
    ]));

    const text = formatCapabilitiesForAgent(['email-engine'], 'act');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('sync_emails');
  });

  it('formatCapabilitiesForAgent returns fallback message for no matches', () => {
    const text = formatCapabilitiesForAgent(['nonexistent'], 'act');
    expect(text).toBe('No capabilities available for the specified modules.');
  });

  it('createCovenantProvider returns working provider', () => {
    registerCovenant(makeCovenant('mod', [{ id: 'c1', name: 'cap', risk: 'act' }]));

    const provider = createCovenantProvider();
    expect(provider.getCovenant('mod')).toBeDefined();
    expect(provider.getCapabilitiesForRole(['mod'], 'act').length).toBe(1);
    expect(provider.formatCapabilitiesForAgent(['mod'], 'act')).toContain('cap');
  });

  it('clears all covenants', () => {
    registerCovenant(makeCovenant('mod', [{ id: 'c1', name: 'cap', risk: 'act' }]));
    clearCovenants();
    expect(getCovenant('mod')).toBeUndefined();
  });
});
