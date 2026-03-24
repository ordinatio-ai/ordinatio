import { executeStep, Step } from './dag-steps';

export function executeDAG(dag: any): any {
  const results: any[] = [];

  for (const step of dag.steps) {
    const result = executeStep(step);
    results.push(result);
  }

  return results;
}
