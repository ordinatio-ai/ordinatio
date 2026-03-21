import { describe, it, expect } from 'vitest';
import { MEMORY_TOOLS } from '../memory/memory-tools';

describe('Memory Tools', () => {
  it('has exactly 3 built-in tools', () => {
    expect(MEMORY_TOOLS).toHaveLength(3);
  });

  it('includes remember tool', () => {
    const tool = MEMORY_TOOLS.find(t => t.name === 'remember');
    expect(tool).toBeDefined();
    expect(tool!.module).toBe('memory');
    expect(tool!.method).toBe('POST');
    expect(tool!.params.some(p => p.name === 'summary')).toBe(true);
  });

  it('includes recall tool', () => {
    const tool = MEMORY_TOOLS.find(t => t.name === 'recall');
    expect(tool).toBeDefined();
    expect(tool!.module).toBe('memory');
    expect(tool!.method).toBe('GET');
  });

  it('includes forget tool', () => {
    const tool = MEMORY_TOOLS.find(t => t.name === 'forget');
    expect(tool).toBeDefined();
    expect(tool!.module).toBe('memory');
    expect(tool!.method).toBe('DELETE');
  });

  it('all tools have dataSensitivity set', () => {
    for (const tool of MEMORY_TOOLS) {
      expect(tool.dataSensitivity).toBeDefined();
    }
  });

  it('all tools have required fields', () => {
    for (const tool of MEMORY_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.endpoint).toBeTruthy();
      expect(tool.whenToUse).toBeTruthy();
      expect(tool.responseShape).toBeTruthy();
    }
  });
});
