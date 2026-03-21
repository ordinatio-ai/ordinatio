// ===========================================
// ORDINATIO DOMUS — CLI Init Command
// ===========================================
// Runs automatically after `npm install @ordinatio/domus`
// or manually via `npx ordinatio init`.
// Interactive setup: module selection → install →
// DB → schema push → seed → config file.
// ===========================================

import * as readline from 'readline';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { getAllModules } from '../wiring/registry';
import { writeMergedSchema } from '../schema/merge';
import type { DomusConfigFile } from '../types';

const MODULE_PACKAGES: Record<string, string> = {
  email: '@ordinatio/email',
  tasks: '@ordinatio/tasks',
  entities: '@ordinatio/entities',
  auth: '@ordinatio/auth',
};

function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' {
  // Check lockfiles in priority order
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
  // Check npm_config_user_agent (set by the running package manager)
  const ua = process.env.npm_config_user_agent || '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  return 'npm';
}

function installPackages(packages: string[]): void {
  if (packages.length === 0) return;
  const pm = detectPackageManager();
  const cmd = pm === 'yarn'
    ? `yarn add ${packages.join(' ')}`
    : `${pm} install ${packages.join(' ')}`;
  execSync(cmd, { stdio: 'inherit' });
}

export async function init(): Promise<void> {
  const rl = createPrompt();

  console.log();
  console.log('  ┌─────────────────────────────┐');
  console.log('  │  Ordinatio — Domus Setup     │');
  console.log('  └─────────────────────────────┘');
  console.log();

  // --- Check for existing config ---
  const configPath = resolve(process.cwd(), '.ordinatio.json');
  if (existsSync(configPath)) {
    const overwrite = await ask(rl, '  .ordinatio.json already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Aborted.');
      rl.close();
      return;
    }
  }

  // --- Module selection ---
  const modules = getAllModules();
  console.log('  Which modules do you need?');
  const selectedModules: string[] = [];

  for (const mod of modules) {
    const answer = await ask(rl, `  [y/N] ${mod.name} — ${mod.description}: `);
    if (answer.toLowerCase() === 'y') {
      selectedModules.push(mod.name);
    }
  }

  if (selectedModules.length === 0) {
    console.log('  No modules selected. Aborted.');
    rl.close();
    return;
  }

  console.log();
  console.log(`  Selected: ${selectedModules.join(', ')}`);
  console.log();

  // --- Install module packages ---
  const packagesToInstall = selectedModules
    .map(m => MODULE_PACKAGES[m])
    .filter(Boolean);

  if (packagesToInstall.length > 0) {
    const pm = detectPackageManager();
    console.log(`  Installing ${packagesToInstall.join(', ')} (via ${pm})...`);
    try {
      installPackages(packagesToInstall);
      console.log(`  ✓ Modules installed`);
    } catch {
      console.error('  ✗ Package installation failed. Install manually and re-run.');
      rl.close();
      return;
    }
    console.log();
  }

  // --- Database setup ---
  console.log('  Database setup:');
  console.log('  (1) Create a new PostgreSQL database');
  console.log('  (2) Use an existing database URL');
  const dbChoice = await ask(rl, '  > ');

  let databaseUrl: string;

  if (dbChoice === '1') {
    const dbName = await ask(rl, '  Database name [ordinatio]: ') || 'ordinatio';
    const dbHost = await ask(rl, '  Host [localhost]: ') || 'localhost';
    const dbPort = await ask(rl, '  Port [5432]: ') || '5432';
    const dbUser = await ask(rl, '  User [postgres]: ') || 'postgres';
    const dbPassword = await ask(rl, '  Password []: ');

    const userPart = dbPassword ? `${dbUser}:${dbPassword}` : dbUser;
    databaseUrl = `postgresql://${userPart}@${dbHost}:${dbPort}/${dbName}`;

    try {
      // Attempt to create the database
      const createUrl = `postgresql://${userPart}@${dbHost}:${dbPort}/postgres`;
      execSync(`psql "${createUrl}" -c "CREATE DATABASE ${dbName}" 2>/dev/null`, { stdio: 'pipe' });
      console.log(`  ✓ Database "${dbName}" created`);
    } catch {
      console.log(`  ⓘ Database "${dbName}" may already exist (continuing)`);
    }
  } else {
    databaseUrl = await ask(rl, '  Database URL: ');
    if (!databaseUrl) {
      console.log('  No database URL provided. Aborted.');
      rl.close();
      return;
    }
  }

  rl.close();

  // --- Push schema ---
  console.log();
  try {
    const schemaPath = writeMergedSchema(selectedModules);
    const tableCount = countModels(selectedModules);

    // Set DATABASE_URL for prisma and push
    execSync(`DATABASE_URL="${databaseUrl}" npx prisma db push --schema "${schemaPath}" --skip-generate`, {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    console.log(`  ✓ Schema pushed (${tableCount} tables)`);
  } catch (err) {
    console.error(`  ✗ Schema push failed: ${err instanceof Error ? err.message : err}`);
    console.error('  Make sure PostgreSQL is running and the database URL is correct.');
    process.exit(1);
  }

  // --- Seed defaults ---
  try {
    // Dynamic import for PrismaClient — Prisma 7 ESM may export on .default
    const prismaImport = await import('@prisma/client') as Record<string, unknown>;
    const PrismaClient = (prismaImport.PrismaClient ?? (prismaImport.default as Record<string, unknown>)?.PrismaClient) as
      new (opts: { datasourceUrl: string }) => { $connect: () => Promise<void>; $disconnect: () => Promise<void> };
    const db = new PrismaClient({ datasourceUrl: databaseUrl });
    await db.$connect();

    for (const modName of selectedModules) {
      const mod = modules.find(m => m.name === modName);
      if (mod?.seed) {
        await mod.seed(db);
      }
    }

    console.log(`  ✓ Defaults seeded`);
    await db.$disconnect();
  } catch (err) {
    console.log(`  ⓘ Seed skipped: ${err instanceof Error ? err.message : 'PrismaClient not available'}`);
  }

  // --- Write config file ---
  const config: DomusConfigFile = {
    databaseUrl,
    modules: selectedModules,
    features: buildDefaultFeatures(selectedModules),
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ Config written to .ordinatio.json`);

  // --- Next steps ---
  console.log();
  console.log('  Next steps:');
  console.log('');
  console.log("    import { createDomus } from '@ordinatio/domus'");
  console.log('    const app = await createDomus()  // reads .ordinatio.json');
  console.log();
}

export function countModels(modules: string[]): number {
  const counts: Record<string, number> = {
    email: 8,
    tasks: 7,
    entities: 12,
    auth: 4,
  };
  return modules.reduce((sum, m) => sum + (counts[m] || 0), 0);
}

export function buildDefaultFeatures(modules: string[]): Record<string, boolean> {
  const features: Record<string, boolean> = {};
  if (modules.includes('email')) {
    features.OAEM_PROTOCOL = true;
    features.EMAIL_TEMPLATES = true;
    features.EMAIL_MULTI_PROVIDER = true;
  }
  if (modules.includes('tasks')) {
    features.TASK_ENGINE_V2 = true;
  }
  if (modules.includes('entities')) {
    features.ENTITY_KNOWLEDGE = true;
  }
  if (modules.includes('auth')) {
    features.CSRF_PROTECTION = true;
    features.ACCOUNT_LOCKOUT = true;
  }

  // Cross-module feature flags (opt-in, disabled by default)
  if (modules.includes('email') && modules.includes('entities')) {
    features.AUTO_CONTACT_FROM_EMAIL = false;
  }
  if (modules.includes('tasks') && modules.includes('entities')) {
    features.AUTO_KNOWLEDGE_ON_TASK_COMPLETE = false;
  }
  return features;
}
