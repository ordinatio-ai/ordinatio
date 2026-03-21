import { describe, it, expect } from 'vitest';
import { toClaudeTools, toOpenAIFunctions } from '../orchestrator/tool-adapter';
import type { AgentTool } from '../types';

function makeTool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    name: 'test_tool', description: 'A test tool', module: 'test',
    method: 'GET', endpoint: '/api/test', auth: 'session_cookie',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Search query' },
      { name: 'limit', type: 'number', required: false, description: 'Max results' },
    ],
    example: { query: 'test' }, responseShape: '{ results: [] }', whenToUse: 'searching',
    ...overrides,
  };
}

describe('Tool Adapter', () => {
  describe('toClaudeTools', () => {
    it('converts tools to Claude format', () => {
      const tools = [makeTool()];
      const claude = toClaudeTools(tools);
      expect(claude).toHaveLength(1);
      expect(claude[0]).toHaveProperty('name', 'test_tool');
      expect(claude[0]).toHaveProperty('description');
      expect(claude[0]).toHaveProperty('input_schema');
    });

    it('includes required params in schema', () => {
      const claude = toClaudeTools([makeTool()]);
      const schema = (claude[0] as any).input_schema;
      expect(schema.properties.query).toBeDefined();
      expect(schema.required).toContain('query');
      expect(schema.required).not.toContain('limit');
    });

    it('handles tools with no params', () => {
      const claude = toClaudeTools([makeTool({ params: [] })]);
      const schema = (claude[0] as any).input_schema;
      expect(schema.properties).toEqual({});
      expect(schema.required).toEqual([]);
    });

    it('converts multiple tools', () => {
      const tools = [makeTool({ name: 'a' }), makeTool({ name: 'b' }), makeTool({ name: 'c' })];
      expect(toClaudeTools(tools)).toHaveLength(3);
    });

    it('includes allowed values in description', () => {
      const tool = makeTool({
        params: [{ name: 'status', type: 'string', required: true, description: 'Order status', allowedValues: ['DRAFT', 'PLACED', 'SHIPPED'] }],
      });
      const claude = toClaudeTools([tool]);
      const schema = (claude[0] as any).input_schema;
      expect(schema.properties.status.enum ?? schema.properties.status.description).toBeTruthy();
    });
  });

  describe('toOpenAIFunctions', () => {
    it('converts tools to OpenAI function calling format', () => {
      const tools = [makeTool()];
      const openai = toOpenAIFunctions(tools);
      expect(openai).toHaveLength(1);
      expect(openai[0]).toHaveProperty('type', 'function');
      expect((openai[0] as any).function).toHaveProperty('name', 'test_tool');
      expect((openai[0] as any).function).toHaveProperty('parameters');
    });

    it('includes required params', () => {
      const openai = toOpenAIFunctions([makeTool()]);
      const params = (openai[0] as any).function.parameters;
      expect(params.properties.query).toBeDefined();
      expect(params.required).toContain('query');
    });

    it('handles empty tools', () => {
      expect(toOpenAIFunctions([])).toEqual([]);
    });
  });
});
