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
import { getModule as getModuleDef } from '../wiring/registry';

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

  // Install the module package
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

  // Add to module list
  config.modules.push(moduleName);

  // Push updated schema
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
    console.log(`  ✓ Schema updated`);
  } catch (err) {
    console.error(`  ✗ Schema push failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Seed defaults
  try {
    const prismaImport = await import('@prisma/client') as Record<string, unknown>;
    const PrismaClient = (prismaImport.PrismaClient ?? (prismaImport.default as Record<string, unknown>)?.PrismaClient) as
      new (opts: { datasourceUrl: string | undefined }) => { $connect: () => Promise<void>; $disconnect: () => Promise<void> };
    const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;
    const db = new PrismaClient({ datasourceUrl: databaseUrl });
    await db.$connect();

    if (mod.seed) {
      await mod.seed(db);
      console.log(`  ✓ Defaults seeded`);
    }

    await db.$disconnect();
  } catch {
    console.log(`  ⓘ Seed skipped`);
  }

  // Update config
  if (!config.features) config.features = {};
  if (moduleName === 'email') {
    config.features.OAEM_PROTOCOL = true;
    config.features.EMAIL_TEMPLATES = true;
    config.features.EMAIL_MULTI_PROVIDER = true;
  }
  if (moduleName === 'tasks') {
    config.features.TASK_ENGINE_V2 = true;
  }
  if (moduleName === 'entities') {
    config.features.ENTITY_KNOWLEDGE = true;
  }
  if (moduleName === 'auth') {
    config.features.CSRF_PROTECTION = true;
    config.features.ACCOUNT_LOCKOUT = true;
  }

  // Cross-module feature flags (opt-in, disabled by default)
  if (
    (moduleName === 'email' && config.modules.includes('entities')) ||
    (moduleName === 'entities' && config.modules.includes('email'))
  ) {
    config.features.AUTO_CONTACT_FROM_EMAIL ??= false;
  }
  if (
    (moduleName === 'tasks' && config.modules.includes('entities')) ||
    (moduleName === 'entities' && config.modules.includes('tasks'))
  ) {
    config.features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE ??= false;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ Config updated`);

  // Show auto-wiring info
  const wiringInfo = getWiringInfo(config.modules);
  if (wiringInfo.length > 0) {
    console.log();
    console.log('  Auto-wiring enabled:');
    for (const info of wiringInfo) {
      console.log(`    ${info}`);
    }
  }

  console.log();
}

export function getWiringInfo(modules: string[]): string[] {
  const info: string[] = [];
  for (const modName of modules) {
    const def = getModuleDef(modName);
    if (def?.events) {
      const emits = def.events.emits;
      if (emits.length > 0) {
        info.push(`${modName} emits: ${emits.join(', ')}`);
      }
    }
  }
  if (info.length > 0) {
    info.unshift('Event bus auto-wiring active — modules communicate via events');
  }
  return info;
}
