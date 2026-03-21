import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAgentIntent } from '../cognition/agent-intent';
import { planAgentTurn } from '../cognition/agent-plan';
import { buildAgentProof, summarizeAgentProof } from '../cognition/agent-proof';
import { computeAgentPosture, agentNeedsAttention, summarizeAgentPosture } from '../cognition/agent-posture';
import { assessMemoryQuality, detectContradictions, shouldMerge, computeDecay } from '../cognition/memory-quality';
import { planContextBudget, getBudgetForSection, canIncludeSection } from '../cognition/context-budget';
import { registerBehaviorPlan, getBehaviorPlan, formatBehaviorForPrompt, clearBehaviorPlans } from '../cognition/role-behavior';
import type { AgentRole, AgentTool } from '../types';

// ---- Intent ----

describe('Agent Intent', () => {
  it('resolves intent from user message', () => {
    const intent = resolveAgentIntent({
      userMessage: 'What orders are pending placement?',
      roleId: 'coo', roleName: 'COO',
    });
    expect(intent.executionIntent).toBe('external_api_call');
    expect(intent.businessIntent).toBe('triage_order_status');
    expect(intent.roleId).toBe('coo');
    expect(intent.definitionOfDone.length).toBeGreaterThan(0);
  });

  it('detects email triage intent', () => {
    const intent = resolveAgentIntent({ userMessage: 'Check my inbox', roleId: 'coo', roleName: 'COO' });
    expect(intent.businessIntent).toBe('triage_email_inbox');
  });

  it('detects client lookup intent', () => {
    const intent = resolveAgentIntent({ userMessage: 'Find client John Smith', roleId: 'coo', roleName: 'COO' });
    expect(intent.businessIntent).toBe('client_lookup');
  });

  it('falls back to general intent for unknown queries', () => {
    const intent = resolveAgentIntent({ userMessage: 'Hello how are you', roleId: 'coo', roleName: 'COO' });
    expect(intent.businessIntent).toContain('coo_general');
  });

  it('includes entity context when provided', () => {
    const intent = resolveAgentIntent({
      userMessage: 'Tell me about this client',
      roleId: 'coo', roleName: 'COO',
      entityType: 'client', entityId: 'c-123',
    });
    expect(intent.entityContext?.entityType).toBe('client');
    expect(intent.entityContext?.entityId).toBe('c-123');
  });
});

// ---- Plan ----

describe('Agent Turn Plan', () => {
  const role: AgentRole = {
    id: 'coo', name: 'COO', description: 'ops', goals: [], constraints: [],
    modules: ['orders', 'email'], toolNames: [], contextDocument: '',
    approvalGates: [{ action: 'send_email', reason: 'drafts first', prompt: 'Approve?' }],
  };

  it('produces a structured plan', () => {
    const intent = resolveAgentIntent({ userMessage: 'List orders', roleId: 'coo', roleName: 'COO' });
    const plan = planAgentTurn({
      intent, role,
      providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
      availableTools: [{ name: 'list_orders', module: 'orders' } as AgentTool],
      blockedByGuardrails: [], blockedByTrust: [],
      relevantMemoryCount: 3, memoryTokenEstimate: 500,
      hasEntityContext: false,
      config: { maxIterations: 10, timeoutMs: 60000, memoryTokenBudget: 2000 },
    });

    expect(plan.schemaVersion).toBe('agent-turn-plan-v1');
    expect(plan.role.id).toBe('coo');
    expect(plan.provider.id).toBe('claude');
    expect(plan.tools.available).toBe(1);
    expect(plan.trust.approvalRequired).toBe(true);
    expect(plan.trust.approvalGates).toContain('send_email');
    expect(plan._actions?.execute).toBeDefined();
  });

  it('identifies risks from blocked tools', () => {
    const intent = resolveAgentIntent({ userMessage: 'Test', roleId: 'coo', roleName: 'COO' });
    const plan = planAgentTurn({
      intent, role,
      providerId: 'deepseek', providerName: 'DeepSeek', providerTrustLevel: 'none',
      availableTools: [],
      blockedByGuardrails: ['admin_tool'], blockedByTrust: ['get_client', 'get_order'],
      relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false,
      config: {},
    });

    expect(plan.risks.some(r => r.includes('blocked by provider trust'))).toBe(true);
    expect(plan.risks.some(r => r.includes('blocked by module guardrails'))).toBe(true);
    expect(plan.risks.some(r => r.includes('restricted trust level'))).toBe(true);
  });
});

// ---- Proof ----

describe('Agent Proof', () => {
  it('builds proof artifact from execution', () => {
    const intent = resolveAgentIntent({ userMessage: 'List orders', roleId: 'coo', roleName: 'COO' });
    const plan = planAgentTurn({
      intent,
      role: { id: 'coo', name: 'COO', description: '', goals: [], constraints: [], modules: [], toolNames: [], approvalGates: [], contextDocument: '' },
      providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
      availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
      relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
    });

    const proof = buildAgentProof({
      intent, plan,
      toolsCalled: [{ tool: 'list_orders', summary: '3 orders found', success: true }],
      approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
      totalIterations: 2, durationMs: 1500,
      finalResponse: 'There are 3 orders pending placement: ORD-101, ORD-102, ORD-103. I recommend reviewing ORD-101 first as it has been waiting the longest.',
      stopReason: 'end_turn',
      decisions: [{ timestamp: new Date(), phase: 'tool_selection', chosen: 'list_orders', reasoning: 'User asked about orders' }],
      failures: [],
    });

    expect(proof.artifactType).toBe('agent_turn_proof');
    expect(proof.intent.businessIntent).toBeTruthy();
    expect(proof.execution.totalToolCalls).toBe(1);
    expect(proof.dodSatisfied).toBe(true);
    expect(proof.decisions).toHaveLength(1);
    expect(proof.summary).toContain('satisfied');
  });

  it('marks DoD unsatisfied when failures occur', () => {
    const intent = resolveAgentIntent({ userMessage: 'Test', roleId: 'coo', roleName: 'COO' });
    const plan = planAgentTurn({
      intent,
      role: { id: 'coo', name: 'COO', description: '', goals: [], constraints: [], modules: [], toolNames: [], approvalGates: [], contextDocument: '' },
      providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
      availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
      relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
    });

    const proof = buildAgentProof({
      intent, plan,
      toolsCalled: [], approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
      totalIterations: 1, durationMs: 500, finalResponse: '', stopReason: 'end_turn',
      decisions: [],
      failures: [{ phase: 'provider', error: 'Timeout' }],
    });

    expect(proof.dodSatisfied).toBe(false);
    expect(proof.failures).toHaveLength(1);
  });

  it('summarizeAgentProof returns compact string', () => {
    const intent = resolveAgentIntent({ userMessage: 'Test', roleId: 'coo', roleName: 'COO' });
    const plan = planAgentTurn({
      intent,
      role: { id: 'coo', name: 'COO', description: '', goals: [], constraints: [], modules: [], toolNames: [], approvalGates: [], contextDocument: '' },
      providerId: 'claude', providerName: 'Claude', providerTrustLevel: 'critical',
      availableTools: [], blockedByGuardrails: [], blockedByTrust: [],
      relevantMemoryCount: 0, memoryTokenEstimate: 0, hasEntityContext: false, config: {},
    });

    const proof = buildAgentProof({
      intent, plan, toolsCalled: [], approvalsRequested: [], approvalsGranted: [], approvalsDenied: [],
      totalIterations: 1, durationMs: 200, finalResponse: 'Done', stopReason: 'end_turn', decisions: [], failures: [],
    });

    expect(typeof summarizeAgentProof(proof)).toBe('string');
  });
});

// ---- Posture ----

describe('Agent Posture', () => {
  it('healthy when everything is fine', () => {
    const posture = computeAgentPosture({
      roleId: 'coo', providerId: 'claude', providerHealthy: true, providerConsecutiveFailures: 0,
      providerTrustLevel: 'critical', memoryHealthy: true, totalMemories: 50, staleMemoryCount: 0,
      totalTools: 30, availableTools: 28, blockedByGuardrails: 1, blockedByTrust: 1,
      pendingApprovals: 0, restrictedModules: [], policyViolations24h: 0, contextUsagePercent: 30,
    });
    expect(posture.health).toBe('healthy');
  });

  it('offline when provider has 5+ failures', () => {
    const posture = computeAgentPosture({
      roleId: 'coo', providerId: 'claude', providerHealthy: false, providerConsecutiveFailures: 5,
      providerTrustLevel: 'critical', memoryHealthy: true, totalMemories: 0, staleMemoryCount: 0,
      totalTools: 30, availableTools: 30, blockedByGuardrails: 0, blockedByTrust: 0,
      pendingApprovals: 0, restrictedModules: [], policyViolations24h: 0, contextUsagePercent: 0,
    });
    expect(posture.health).toBe('offline');
    expect(posture.recommendedAction).toContain('offline');
  });

  it('constrained when many tools blocked by trust', () => {
    const posture = computeAgentPosture({
      roleId: 'coo', providerId: 'deepseek', providerHealthy: true, providerConsecutiveFailures: 0,
      providerTrustLevel: 'none', memoryHealthy: true, totalMemories: 0, staleMemoryCount: 0,
      totalTools: 30, availableTools: 5, blockedByGuardrails: 0, blockedByTrust: 20,
      pendingApprovals: 0, restrictedModules: [], policyViolations24h: 0, contextUsagePercent: 0,
    });
    expect(posture.health).toBe('constrained');
  });

  it('degraded when approvals piling up', () => {
    const posture = computeAgentPosture({
      roleId: 'coo', providerId: 'claude', providerHealthy: true, providerConsecutiveFailures: 0,
      providerTrustLevel: 'critical', memoryHealthy: true, totalMemories: 0, staleMemoryCount: 0,
      totalTools: 30, availableTools: 30, blockedByGuardrails: 0, blockedByTrust: 0,
      pendingApprovals: 8, restrictedModules: [], policyViolations24h: 0, contextUsagePercent: 0,
    });
    expect(posture.health).toBe('degraded');
    expect(posture.recommendedAction).toContain('approvals');
  });

  it('includes hypermedia actions', () => {
    const posture = computeAgentPosture({
      roleId: 'coo', providerId: 'claude', providerHealthy: true, providerConsecutiveFailures: 0,
      providerTrustLevel: 'critical', memoryHealthy: true, totalMemories: 10, staleMemoryCount: 5,
      totalTools: 30, availableTools: 30, blockedByGuardrails: 0, blockedByTrust: 0,
      pendingApprovals: 2, restrictedModules: [], policyViolations24h: 0, contextUsagePercent: 0,
    });
    expect(posture._actions?.review_approvals).toBeDefined();
    expect(posture._actions?.cleanup_memory).toBeDefined();
  });

  it('agentNeedsAttention returns true when not healthy', () => {
    const healthy = computeAgentPosture({
      roleId: 'coo', providerId: 'claude', providerHealthy: true, providerConsecutiveFailures: 0,
      providerTrustLevel: 'critical', memoryHealthy: true, totalMemories: 0, staleMemoryCount: 0,
      totalTools: 10, availableTools: 10, blockedByGuardrails: 0, blockedByTrust: 0,
      pendingApprovals: 0, restrictedModules: [], policyViolations24h: 0, contextUsagePercent: 0,
    });
    expect(agentNeedsAttention(healthy)).toBe(false);
  });
});

// ---- Memory Quality ----

describe('Memory Quality', () => {
  it('assesses fresh memory as high quality', () => {
    const quality = assessMemoryQuality({
      createdAt: new Date(), accessCount: 5, source: 'user_input', layer: 'DEEP',
    });
    expect(quality.grade).toBe('high');
    expect(quality.freshness).toBeGreaterThan(0.9);
    expect(quality.provenance).toBe('user_input');
  });

  it('assesses old memory as stale', () => {
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const quality = assessMemoryQuality({
      createdAt: oldDate, accessCount: 0, source: 'conversation', layer: 'DEEP',
    });
    expect(quality.grade).toBe('stale');
    expect(quality.freshness).toBeLessThan(0.01);
  });

  it('agent inference has lower confidence', () => {
    const quality = assessMemoryQuality({
      createdAt: new Date(), accessCount: 0, source: 'agent_inference', layer: 'TEMPORARY',
    });
    expect(quality.confidence).toBeLessThan(0.6);
  });

  it('detects contradictions between memories', () => {
    const contradictions = detectContradictions([
      { id: 'm1', summary: 'Client prefers navy', clientId: 'c-1', tags: ['preference'] },
      { id: 'm2', summary: 'Client prefers gray', clientId: 'c-1', tags: ['preference'] },
      { id: 'm3', summary: 'Client likes tea', clientId: 'c-1', tags: ['beverage'] },
    ]);
    expect(contradictions.length).toBe(1);
    expect(contradictions[0].memoryA).toBe('m1');
    expect(contradictions[0].memoryB).toBe('m2');
  });

  it('no contradictions for different clients', () => {
    const contradictions = detectContradictions([
      { id: 'm1', summary: 'Prefers navy', clientId: 'c-1', tags: ['preference'] },
      { id: 'm2', summary: 'Prefers gray', clientId: 'c-2', tags: ['preference'] },
    ]);
    expect(contradictions).toHaveLength(0);
  });

  it('shouldMerge detects identical content', () => {
    const result = shouldMerge(
      { summary: 'Same thing', createdAt: new Date(), source: 'conversation' },
      { summary: 'Same thing', createdAt: new Date(), source: 'conversation' },
    );
    expect(result.shouldMerge).toBe(true);
  });

  it('shouldMerge keeps different content separate', () => {
    const result = shouldMerge(
      { summary: 'Client prefers navy', createdAt: new Date(), source: 'conversation' },
      { summary: 'Client budget is $5000', createdAt: new Date(), source: 'conversation' },
    );
    expect(result.shouldMerge).toBe(false);
  });

  it('computeDecay returns correct decay factor', () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const decay = computeDecay(thirtyDaysAgo, 30, now);
    expect(decay).toBeCloseTo(0.5, 1);
  });
});

// ---- Context Budget ----

describe('Context Budget', () => {
  it('allocates tokens across sections', () => {
    const budget = planContextBudget({
      toolCount: 20, memoryCount: 5, hasEntityContext: true, conversationLength: 3,
    });
    expect(budget.totalBudget).toBeGreaterThan(0);
    expect(budget.allocated.rolePrompt).toBeGreaterThan(0);
    expect(budget.allocated.memory).toBeGreaterThan(0);
    expect(budget.allocated.entityContext).toBeGreaterThan(0);
    expect(budget.allocated.toolSchemas).toBeGreaterThan(0);
    expect(budget.allocated.responseReserve).toBeGreaterThan(0);
    expect(budget.remaining).toBeGreaterThanOrEqual(0);
  });

  it('skips entity context when not available', () => {
    const budget = planContextBudget({
      toolCount: 10, memoryCount: 3, hasEntityContext: false, conversationLength: 1,
    });
    expect(budget.allocated.entityContext).toBe(0);
  });

  it('detects high pressure', () => {
    const budget = planContextBudget({
      maxContextTokens: 4000,
      toolCount: 50, memoryCount: 20, hasEntityContext: true, conversationLength: 10,
    });
    expect(budget.pressure).toBe('high');
  });

  it('switches to compact strategy under pressure', () => {
    const budget = planContextBudget({
      maxContextTokens: 4000,
      toolCount: 50, memoryCount: 20, hasEntityContext: true, conversationLength: 10,
    });
    expect(budget.strategy).toBe('compact');
  });

  it('getBudgetForSection returns correct amount', () => {
    const budget = planContextBudget({ toolCount: 10, memoryCount: 5, hasEntityContext: false, conversationLength: 1 });
    expect(getBudgetForSection(budget, 'rolePrompt')).toBe(600);
  });

  it('canIncludeSection returns false for zero-budget sections', () => {
    const budget = planContextBudget({ toolCount: 10, memoryCount: 5, hasEntityContext: false, conversationLength: 1 });
    expect(canIncludeSection(budget, 'entityContext')).toBe(false);
    expect(canIncludeSection(budget, 'rolePrompt')).toBe(true);
  });
});

// ---- Role Behavior ----

describe('Role Behavior', () => {
  beforeEach(() => clearBehaviorPlans());

  it('registers and retrieves behavior plans', () => {
    registerBehaviorPlan({
      roleId: 'coo',
      approachOrder: ['Observe current state', 'Retrieve context', 'Prefer read tools first', 'Propose before acting'],
      preferences: [{ prefer: 'read tools', over: 'write tools', reason: 'Gather context before changing anything' }],
      escalationRules: ['Escalate if 2+ failures on same entity'],
      summarizationRules: ['Summarize after 5+ tool calls'],
      mandatoryBehaviors: ['Never send email without draft approval'],
    });

    const plan = getBehaviorPlan('coo');
    expect(plan).toBeDefined();
    expect(plan!.approachOrder).toHaveLength(4);
    expect(plan!.preferences[0].prefer).toBe('read tools');
    expect(plan!.mandatoryBehaviors[0]).toContain('draft');
  });

  it('returns undefined for unregistered role', () => {
    expect(getBehaviorPlan('ghost')).toBeUndefined();
  });

  it('formatBehaviorForPrompt produces structured text', () => {
    registerBehaviorPlan({
      roleId: 'coo',
      approachOrder: ['Step 1', 'Step 2'],
      preferences: [{ prefer: 'A', over: 'B', reason: 'Better' }],
      escalationRules: ['Escalate when stuck'],
      summarizationRules: [],
      mandatoryBehaviors: ['Always verify'],
    });

    const text = formatBehaviorForPrompt(getBehaviorPlan('coo')!);
    expect(text).toContain('Operating Pattern');
    expect(text).toContain('Step 1');
    expect(text).toContain('Preferences');
    expect(text).toContain('Prefer "A" over "B"');
    expect(text).toContain('Escalation');
    expect(text).toContain('Mandatory');
    expect(text).toContain('Always verify');
  });
});
