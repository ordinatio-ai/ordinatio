// ===========================================
// ORDINATIO DOMUS — Schema Merger
// ===========================================
// Merges Prisma schema fragments from selected
// modules into a single schema file for
// `prisma db push`.
// ===========================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const SCHEMA_DIR = dirname(new URL(import.meta.url).pathname);

const MODULE_SCHEMAS: Record<string, string> = {
  email: 'email.prisma',
  tasks: 'tasks.prisma',
  entities: 'entities.prisma',
  auth: 'auth.prisma',
};

/**
 * Merge selected module schemas with the shared datasource/generator config.
 * Returns the combined Prisma schema as a string.
 */
export function mergeSchemas(modules: string[]): string {
  const shared = readFileSync(resolve(SCHEMA_DIR, 'shared.prisma'), 'utf-8');
  const parts = [shared];

  for (const mod of modules) {
    const file = MODULE_SCHEMAS[mod];
    if (!file) {
      throw new Error(`Unknown module "${mod}". Available: ${Object.keys(MODULE_SCHEMAS).join(', ')}`);
    }
    parts.push(readFileSync(resolve(SCHEMA_DIR, file), 'utf-8'));
  }

  return parts.join('\n\n');
}

/**
 * Write the merged schema to a temp file and return its path.
 * Used by `prisma db push --schema <path>`.
 */
export function writeMergedSchema(modules: string[], outDir?: string): string {
  const schema = mergeSchemas(modules);
  const dir = outDir ?? resolve(process.cwd(), '.ordinatio');
  mkdirSync(dir, { recursive: true });
  const outPath = resolve(dir, 'schema.prisma');
  writeFileSync(outPath, schema, 'utf-8');
  return outPath;
}

/**
 * Available module names for schema selection.
 */
export function availableModules(): string[] {
  return Object.keys(MODULE_SCHEMAS);
}
