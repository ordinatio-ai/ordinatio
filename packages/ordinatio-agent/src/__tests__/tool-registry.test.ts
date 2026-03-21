import { describe, it, expect, beforeEach } from 'vitest';
import { registerTool, registerTools, getTool, getToolsByModule, getToolsForRole, getAllTools, clearTools } from '../registry/tool-registry';
import type { AgentTool, AgentRole } from '../types';

function makeTool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    name: 'test_tool', description: 'A test tool', module: 'test',
    method: 'GET', endpoint: '/api/test', auth: 'session_cookie',
    params: [], example: {}, responseShape: '{}', whenToUse: 'testing',
    ...overrides,
  };
}

function makeRole(overrides: Partial<AgentRole> = {}): AgentRole {
  return {
    id: 'test-role', name: 'Test', description: 'Test role',
    goals: [], constraints: [], modules: ['test'], toolNames: ['test_tool'],
    approvalGates: [], contextDocument: '',
    ...overrides,
  };
}

describe('Tool Registry', () => {
  beforeEach(() => clearTools());

  it('starts empty', () => {
    expect(getAllTools()).toHaveLength(0);
  });

  it('registers a single tool', () => {
    registerTool(makeTool({ name: 'my_tool' }));
    expect(getTool('my_tool')).toBeDefined();
    expect(getTool('my_tool')!.name).toBe('my_tool');
  });

  it('registers multiple tools at once', () => {
    registerTools([makeTool({ name: 'a' }), makeTool({ name: 'b' }), makeTool({ name: 'c' })]);
    expect(getAllTools()).toHaveLength(3);
  });

  it('overwrites duplicate tool names', () => {
    registerTool(makeTool({ name: 'dup', description: 'first' }));
    registerTool(makeTool({ name: 'dup', description: 'second' }));
    expect(getTool('dup')!.description).toBe('second');
    expect(getAllTools()).toHaveLength(1);
  });

  it('returns undefined for unknown tool', () => {
    expect(getTool('nonexistent')).toBeUndefined();
  });

  it('filters by module', () => {
    registerTools([
      makeTool({ name: 'email_1', module: 'email' }),
      makeTool({ name: 'email_2', module: 'email' }),
      makeTool({ name: 'task_1', module: 'tasks' }),
    ]);
    expect(getToolsByModule('email')).toHaveLength(2);
    expect(getToolsByModule('tasks')).toHaveLength(1);
    expect(getToolsByModule('unknown')).toHaveLength(0);
  });

  it('gets tools for a role by toolNames', () => {
    registerTools([
      makeTool({ name: 'allowed_tool' }),
      makeTool({ name: 'blocked_tool' }),
    ]);
    const tools = getToolsForRole('test-role', { roleToolNames: ['allowed_tool'] });
    expect(tools.some(t => t.name === 'allowed_tool')).toBe(true);
    expect(tools.some(t => t.name === 'blocked_tool')).toBe(false);
  });

  it('clears all tools', () => {
    registerTools([makeTool({ name: 'a' }), makeTool({ name: 'b' })]);
    clearTools();
    expect(getAllTools()).toHaveLength(0);
  });

  it('preserves data sensitivity on tools', () => {
    registerTool(makeTool({ name: 'sensitive', dataSensitivity: 'critical' }));
    expect(getTool('sensitive')!.dataSensitivity).toBe('critical');
  });

  it('preserves covenant metadata on tools', () => {
    registerTool(makeTool({ name: 'covenant_tool', capabilityId: 'cap-1', covenantModuleId: 'email-engine', risk: 'act' }));
    const tool = getTool('covenant_tool')!;
    expect(tool.capabilityId).toBe('cap-1');
    expect(tool.covenantModuleId).toBe('email-engine');
    expect(tool.risk).toBe('act');
  });
});
