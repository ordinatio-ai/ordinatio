// ===========================================
// ORDINATIO DOMUS — CLI Add Module Command
// ===========================================
// `npx ordinatio add <module>`
// Adds a module to an existing domus instance.
// Installs the package, pushes schema, seeds.
// ===========================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { getModule, getModuleNames } from '../wiring/registry';
import { writeMergedSchema } from '../schema/merge';
import type { DomusConfigFile } from '../types';

const MODULE_PACKAGES: Record<string, string> = {
  email: '@ordinatio/email',
  tasks: '@ordinatio/tasks',
  entities: '@ordinatio/entities',
  auth: '@ordinatio/auth',
};

function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  return 'npm';
}

export async function addModule(moduleName: string): Promise<void> {
  const configPath = resolve(process.cwd(), '.ordinatio.json');

  if (!existsSync(configPath)) {
    console.error('  ✗ No .ordinatio.json found. Run `npx ordinatio init` first.');
    process.exit(1);
  }

  const mod = getModule(moduleName);
  if (!mod) {
    console.error(`  ✗ Unknown module "${moduleName}". Available: ${getModuleNames().join(', ')}`);
    process.exit(1);
  }

  const config: DomusConfigFile = JSON.parse(readFileSync(configPath, 'utf-8'));

  if (config.modules.includes(moduleName)) {
    console.log(`  ⓘ Module "${moduleName}" is already installed.`);
    return;
  }

  console.log();
  console.log(`  Adding module: ${moduleName}`);

  const pkg = MODULE_PACKAGES[moduleName];
  if (pkg) {
    const pm = detectPackageManager();
    console.log(`  Installing ${pkg}...`);
    try {
      const cmd = pm === 'yarn' ? `yarn add ${pkg}` : `${pm} install ${pkg}`;
      execSync(cmd, { stdio: 'inherit' });
      console.log(`  ✓ ${pkg} installed`);
    } catch {
      console.error(`  ✗ Failed to install ${pkg}. Install manually and re-run.`);
      process.exit(1);
    }
  }

  config.modules.push(moduleName);

  try {
    const schemaPath = writeMergedSchema(config.modules);
    const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('  ✗ No database URL found in config or DATABASE_URL env var.');
      process.exit(1);
    }

    execSync(`DATABASE_URL="${databaseUrl}" npx prisma db push --schema "${schemaPath}" --skip-generate`, {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log(`  ✓ Schema pushed for ${moduleName}`);
  } catch {
    console.error(`  ✗ Failed to push schema for ${moduleName}. Handle manually.`);
    process.exit(1);
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✓ Module "${moduleName}" added.`);
}