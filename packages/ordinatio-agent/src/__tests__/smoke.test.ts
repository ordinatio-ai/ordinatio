import { describe, it, expect } from 'vitest';

describe('Agent Package Smoke Test', () => {
  it('exports types', async () => {
    const mod = await import('../types');
    expect(mod.DEFAULT_ORCHESTRATOR_CONFIG).toBeDefined();
    expect(mod.DEFAULT_ORCHESTRATOR_CONFIG.maxIterations).toBe(10);
  });

  it('exports error builder with v2 diagnostics', async () => {
    const { agentError } = await import('../errors/errors');
    const err = agentError('AGENT_800', { test: true });
    expect(err.code).toBe('AGENT_800');
    expect(err.ref).toMatch(/^AGENT_800-/);
    expect(err.timestamp).toBeTruthy();
    expect(err.module).toBe('AGENT');
    expect(err.description).toBeTruthy();
    expect(typeof err.recoverable).toBe('boolean');
    expect(Array.isArray(err.diagnosis)).toBe(true);
    expect(err.context).toEqual({ test: true });
  });

  it('exports error builder with unknown code handling', async () => {
    const { agentError } = await import('../errors/errors');
    const err = agentError('AGENT_999');
    expect(err.code).toBe('AGENT_999');
    expect(err.module).toBe('AGENT');
    expect(err.description).toContain('Unknown');
  });

  it('exports tool registry (empty at startup)', async () => {
    const mod = await import('../registry/tool-registry');
    expect(mod.registerTool).toBeTypeOf('function');
    expect(mod.registerTools).toBeTypeOf('function');
    expect(mod.getTool).toBeTypeOf('function');
    expect(mod.getAllTools).toBeTypeOf('function');
    expect(mod.clearTools).toBeTypeOf('function');
  });

  it('exports role registry (empty at startup)', async () => {
    const mod = await import('../registry/role-registry');
    expect(mod.registerRole).toBeTypeOf('function');
    expect(mod.getRole).toBeTypeOf('function');
    expect(mod.getAllRoles).toBeTypeOf('function');
    expect(mod.buildCompositeRole).toBeTypeOf('function');
    expect(mod.clearRoles).toBeTypeOf('function');
  });

  it('exports guardrails', async () => {
    const mod = await import('../guardrails/agent-guardrails');
    expect(mod.filterToolsByGuardrails).toBeTypeOf('function');
    expect(mod.isModuleEnabled).toBeTypeOf('function');
  });

  it('exports provider policy', async () => {
    const mod = await import('../guardrails/provider-policy');
    expect(mod.canProviderAccessTool).toBeTypeOf('function');
  });

  it('exports access denial', async () => {
    const mod = await import('../guardrails/access-denial');
    expect(mod.getAccessDenialMessage).toBeTypeOf('function');
  });

  it('exports provider health', async () => {
    const mod = await import('../health/provider-health');
    expect(mod.recordProviderResult).toBeTypeOf('function');
    expect(mod.isProviderHealthy).toBeTypeOf('function');
  });

  it('exports memory service', async () => {
    const mod = await import('../memory/memory-service');
    expect(mod.createMemory).toBeTypeOf('function');
    expect(mod.recallMemories).toBeTypeOf('function');
    expect(mod.deleteMemory).toBeTypeOf('function');
  });

  it('exports memory formatter', async () => {
    const mod = await import('../memory/memory-formatter');
    expect(mod.getMemoryContext).toBeTypeOf('function');
    expect(mod.estimateTokens).toBeTypeOf('function');
  });

  it('exports memory tools (3 built-in tools)', async () => {
    const mod = await import('../memory/memory-tools');
    expect(mod.MEMORY_TOOLS).toBeDefined();
    expect(mod.MEMORY_TOOLS).toHaveLength(3);
    expect(mod.MEMORY_TOOLS.map((t: any) => t.name)).toEqual(['remember', 'recall', 'forget']);
  });

  it('exports tool adapter', async () => {
    const mod = await import('../orchestrator/tool-adapter');
    expect(mod.toClaudeTools).toBeTypeOf('function');
    expect(mod.toOpenAIFunctions).toBeTypeOf('function');
  });

  it('exports tool executor', async () => {
    const mod = await import('../orchestrator/tool-executor');
    expect(mod.HttpToolExecutor).toBeTypeOf('function');
  });

  it('exports prompt builder', async () => {
    const mod = await import('../orchestrator/prompt-builder');
    expect(mod.buildSystemPrompt).toBeTypeOf('function');
  });

  it('exports orchestrator', async () => {
    const mod = await import('../orchestrator/orchestrator');
    expect(mod.orchestrateChat).toBeTypeOf('function');
  });

  it('exports covenant bridge', async () => {
    const mod = await import('../covenant/covenant-bridge');
    expect(mod.registerCovenant).toBeTypeOf('function');
    expect(mod.getCovenant).toBeTypeOf('function');
    expect(mod.clearCovenants).toBeTypeOf('function');
    expect(mod.createCovenantProvider).toBeTypeOf('function');
  });

  it('exports provider factory', async () => {
    const mod = await import('../providers/provider-factory');
    expect(mod.getProvider).toBeTypeOf('function');
    expect(mod.clearProviderCache).toBeTypeOf('function');
  });

  it('barrel export works without conflicts', async () => {
    const mod = await import('../index');
    // Types
    expect(mod.DEFAULT_ORCHESTRATOR_CONFIG).toBeDefined();
    // Errors
    expect(mod.agentError).toBeTypeOf('function');
    // Registry
    expect(mod.registerTool).toBeTypeOf('function');
    expect(mod.registerRole).toBeTypeOf('function');
    // Memory
    expect(mod.MEMORY_TOOLS).toBeDefined();
    // Orchestrator
    expect(mod.orchestrateChat).toBeTypeOf('function');
  });
});
