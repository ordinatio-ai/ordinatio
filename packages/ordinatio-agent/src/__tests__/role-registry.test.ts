import { describe, it, expect, beforeEach } from 'vitest';
import { registerRole, getRole, getAllRoles, getRoleNames, buildCompositeRole, clearRoles } from '../registry/role-registry';
import type { AgentRole } from '../types';

function makeRole(overrides: Partial<AgentRole> = {}): AgentRole {
  return {
    id: 'test', name: 'Test', description: 'Test role',
    goals: ['help'], constraints: ['be safe'], modules: ['test'],
    toolNames: ['tool_a'], approvalGates: [], contextDocument: '/test.md',
    ...overrides,
  };
}

describe('Role Registry', () => {
  beforeEach(() => clearRoles());

  it('starts empty', () => {
    expect(getAllRoles()).toHaveLength(0);
    expect(getRoleNames()).toEqual([]);
  });

  it('registers a role', () => {
    registerRole(makeRole({ id: 'coo', name: 'COO' }));
    expect(getRole('coo')).toBeDefined();
    expect(getRole('coo')!.name).toBe('COO');
  });

  it('returns undefined for unknown role', () => {
    expect(getRole('ghost')).toBeUndefined();
  });

  it('lists all roles', () => {
    registerRole(makeRole({ id: 'a' }));
    registerRole(makeRole({ id: 'b' }));
    expect(getAllRoles()).toHaveLength(2);
    expect(getRoleNames()).toEqual(['a', 'b']);
  });

  it('overwrites duplicate role IDs', () => {
    registerRole(makeRole({ id: 'dup', name: 'First' }));
    registerRole(makeRole({ id: 'dup', name: 'Second' }));
    expect(getRole('dup')!.name).toBe('Second');
    expect(getAllRoles()).toHaveLength(1);
  });

  it('buildCompositeRole merges modules and tools', () => {
    registerRole(makeRole({ id: 'r1', modules: ['email'], toolNames: ['send_email'], goals: ['handle email'], constraints: ['no spam'] }));
    registerRole(makeRole({ id: 'r2', modules: ['tasks'], toolNames: ['create_task'], goals: ['manage tasks'], constraints: ['no delete'] }));

    const composite = buildCompositeRole('general', ['r1', 'r2']);
    expect(composite).toBeDefined();
    expect(composite!.id).toBe('general');
    expect(composite!.modules).toContain('email');
    expect(composite!.modules).toContain('tasks');
    expect(composite!.toolNames).toContain('send_email');
    expect(composite!.toolNames).toContain('create_task');
    expect(composite!.goals).toContain('handle email');
    expect(composite!.goals).toContain('manage tasks');
  });

  it('buildCompositeRole deduplicates modules and tools', () => {
    registerRole(makeRole({ id: 'r1', modules: ['email', 'tasks'], toolNames: ['shared_tool'] }));
    registerRole(makeRole({ id: 'r2', modules: ['tasks', 'orders'], toolNames: ['shared_tool', 'other'] }));

    const composite = buildCompositeRole('merged', ['r1', 'r2']);
    expect(composite!.modules.filter(m => m === 'tasks')).toHaveLength(1);
    expect(composite!.toolNames.filter(t => t === 'shared_tool')).toHaveLength(1);
  });

  it('buildCompositeRole returns empty role if no roles found', () => {
    const composite = buildCompositeRole('empty', ['nonexistent']);
    expect(composite).toBeDefined();
    expect(composite.id).toBe('empty');
    expect(composite.modules).toEqual([]);
    expect(composite.toolNames).toEqual([]);
    expect(composite.goals).toEqual([]);
  });

  it('buildCompositeRole merges approval gates', () => {
    registerRole(makeRole({ id: 'r1', approvalGates: [{ action: 'send_email', reason: 'drafts first', prompt: 'Approve?' }] }));
    registerRole(makeRole({ id: 'r2', approvalGates: [{ action: 'update_order', reason: 'review needed', prompt: 'Approve?' }] }));

    const composite = buildCompositeRole('merged', ['r1', 'r2']);
    expect(composite!.approvalGates).toHaveLength(2);
  });

  it('preserves covenant module mappings', () => {
    registerRole(makeRole({ id: 'coo', covenantModules: { email: 'email-engine', clients: 'entity-registry' } }));
    const role = getRole('coo')!;
    expect(role.covenantModules).toBeDefined();
    expect(role.covenantModules!.email).toBe('email-engine');
  });

  it('clears all roles', () => {
    registerRole(makeRole({ id: 'a' }));
    registerRole(makeRole({ id: 'b' }));
    clearRoles();
    expect(getAllRoles()).toHaveLength(0);
  });
});
