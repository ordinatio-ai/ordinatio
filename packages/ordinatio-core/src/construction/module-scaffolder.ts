// IHS
/**
 * Module Scaffolder (Book V §X)
 *
 * Generates the canonical directory layout for a new module.
 * Returns a ModuleScaffold with file paths and content — does NOT
 * write to disk. Ordinatio-core is infrastructure-neutral.
 *
 * "Every module begins with the same skeleton.
 *  Uniformity of structure enables uniformity of understanding."
 *
 * DEPENDS ON: construction/types, covenant/types
 * USED BY: module admission pipeline, CLI tools
 */

import type { ModuleIdentity } from '../covenant/types';
import type { ModuleScaffold, ScaffoldFile } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toUpperSnakeCase(kebab: string): string {
  return kebab.toUpperCase().replace(/-/g, '_');
}

// ---------------------------------------------------------------------------
// File generators
// ---------------------------------------------------------------------------

function makePackageJson(id: string): string {
  return JSON.stringify({
    name: `@ordinatio/${id}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: './src/index.ts',
    types: './src/index.ts',
    scripts: {
      'test:run': 'vitest run',
      'test:watch': 'vitest watch',
    },
    dependencies: {
      '@ordinatio/core': 'workspace:*',
    },
    devDependencies: {
      vitest: '^4.0.0',
      typescript: '^5.0.0',
    },
  }, null, 2) + '\n';
}

function makeTsconfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      declaration: true,
      outDir: './dist',
      rootDir: './src',
    },
    include: ['src'],
  }, null, 2) + '\n';
}

function makeIndexTs(id: string): string {
  return `// IHS
/**
 * ${toPascalCase(id)} — Barrel Export
 */

export * from './types';
export * from './covenant';
`;
}

function makeTypesTs(id: string, description: string): string {
  return `// IHS
/**
 * ${toPascalCase(id)} — Types
 *
 * ${description}
 */

// Define your module's types here.
// Entity types, event payloads, capability input/output shapes.

export interface ${toPascalCase(id)}Config {
  /** Module configuration placeholder */
  readonly enabled: boolean;
}
`;
}

function makeCovenantTs(identity: ModuleIdentity): string {
  const { id, canonicalId, version, description, status, tier } = identity;
  return `// IHS
/**
 * ${toPascalCase(id)} — Module Covenant
 *
 * The machine-readable contract for this module.
 */

import type { ModuleCovenant } from '@ordinatio/core';

export const ${toUpperSnakeCase(id)}_COVENANT: ModuleCovenant = {
  identity: {
    id: '${id}',
    canonicalId: '${canonicalId}',
    version: '${version}',
    description: '${description}',
    status: '${status}',
    tier: '${tier}',
    dedication: 'IHS',
  },
  domain: {
    entities: [
      // { name: 'YourEntity', description: '...', hasContextLayer: false },
    ],
    events: [
      // { id: '${id.split('-')[0]}.created', description: '...', payloadShape: '{ id: string }' },
    ],
    subscriptions: [],
  },
  capabilities: [
    // At least one capability is required.
    // {
    //   id: '${id.split('-')[0]}.read',
    //   description: '...',
    //   type: 'query',
    //   risk: 'observe',
    //   dataSensitivity: 'none',
    //   inputs: [],
    //   output: '{ data: object }',
    //   whenToUse: '...',
    // },
  ],
  dependencies: [],
  invariants: {
    alwaysTrue: [
      // At least one required.
    ],
    neverHappens: [
      // At least one required.
    ],
  },
  healthCheck: async () => ({
    healthy: true,
    message: '${toPascalCase(id)} health check not yet implemented',
    checkedAt: new Date(),
  }),
};
`;
}

function makeErrorsTs(id: string): string {
  const prefix = toUpperSnakeCase(id).replace(/_ENGINE$/, '').replace(/_/g, '');
  return `// IHS
/**
 * ${toPascalCase(id)} — Error Registry
 *
 * Every error gets a unique, timestamped reference ID.
 * Format: ${prefix}_{CODE}-{TIMESTAMP}
 */

export const ${toUpperSnakeCase(id)}_ERRORS: Record<string, {
  file: string;
  function: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  description: string;
  diagnosis: string[];
}> = {
  // Add error codes here as the module grows.
  // '${prefix}_100': {
  //   file: 'src/service.ts',
  //   function: 'yourFunction',
  //   severity: 'medium',
  //   recoverable: true,
  //   description: 'Description of what went wrong',
  //   diagnosis: ['Check X', 'Verify Y'],
  // },
};

export function moduleError(code: string, context?: Record<string, unknown>) {
  const ref = \`\${code}-\${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}\`;
  const entry = ${toUpperSnakeCase(id)}_ERRORS[code];
  return {
    code,
    ref,
    timestamp: new Date().toISOString(),
    module: '${id}',
    ...(entry ?? {}),
    context: context ?? {},
  };
}
`;
}

function makeCovenantTestTs(id: string): string {
  return `// IHS
import { describe, it, expect } from 'vitest';
import { validateCovenant } from '@ordinatio/core';
import { ${toUpperSnakeCase(id)}_COVENANT } from '../covenant';

describe('${toPascalCase(id)} Covenant', () => {
  it('passes covenant validation', () => {
    const result = validateCovenant(${toUpperSnakeCase(id)}_COVENANT);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });
});
`;
}

function makeReadme(identity: ModuleIdentity): string {
  return `# ${toPascalCase(identity.id)}

> ${identity.description}

**Canonical ID:** ${identity.canonicalId}
**Status:** ${identity.status}
**Tier:** ${identity.tier}
**Version:** ${identity.version}

## Overview

This module is part of the Ordinatio architecture.

## Getting Started

\`\`\`bash
pnpm install
pnpm test:run
\`\`\`
`;
}

function makeServiceTs(id: string): string {
  return `// IHS
/**
 * ${toPascalCase(id)} — Service
 *
 * Placeholder service interface. Implement your module's
 * core business logic here.
 */

export interface ${toPascalCase(id)}Service {
  /** Health check */
  isHealthy(): Promise<boolean>;
}
`;
}

// ---------------------------------------------------------------------------
// Main scaffolder
// ---------------------------------------------------------------------------

/**
 * Generate a canonical module scaffold from a ModuleIdentity.
 *
 * Returns file paths and content. Does NOT write to disk.
 */
export function generateModuleScaffold(identity: ModuleIdentity): ModuleScaffold {
  const { id } = identity;
  const packageDir = `packages/${id}`;

  const requiredFiles: ScaffoldFile[] = [
    { path: `${packageDir}/package.json`, content: makePackageJson(id), required: true, purpose: 'Package configuration' },
    { path: `${packageDir}/tsconfig.json`, content: makeTsconfig(), required: true, purpose: 'TypeScript configuration' },
    { path: `${packageDir}/src/index.ts`, content: makeIndexTs(id), required: true, purpose: 'Barrel export' },
    { path: `${packageDir}/src/types.ts`, content: makeTypesTs(id, identity.description), required: true, purpose: 'Type definitions' },
    { path: `${packageDir}/src/covenant.ts`, content: makeCovenantTs(identity), required: true, purpose: 'Module Covenant' },
    { path: `${packageDir}/src/errors.ts`, content: makeErrorsTs(id), required: true, purpose: 'Error registry' },
    { path: `${packageDir}/src/__tests__/covenant.test.ts`, content: makeCovenantTestTs(id), required: true, purpose: 'Covenant validation test' },
    { path: `${packageDir}/README.md`, content: makeReadme(identity), required: true, purpose: 'Module documentation' },
  ];

  const optionalFiles: ScaffoldFile[] = [
    { path: `${packageDir}/src/service.ts`, content: makeServiceTs(id), required: false, purpose: 'Service interface placeholder' },
  ];

  const files = [...requiredFiles, ...optionalFiles];

  return {
    identity,
    packageName: `@ordinatio/${id}`,
    packageDir,
    files,
    totalFiles: files.length,
    requiredFiles: requiredFiles.length,
  };
}
