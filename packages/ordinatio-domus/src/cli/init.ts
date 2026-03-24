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
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
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

  const configPath = resolve(process.cwd(), '.ordinatio.json');
  if (existsSync(configPath)) {
    const overwrite = await ask(rl, '  .ordinatio.json already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Aborted.');
      rl.close();
      return;
    }
  }

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
    console.log('  No modules selected. Aborting setup.');
    rl.close();
    return;
  }

  const packagesToInstall = selectedModules.map((mod) => MODULE_PACKAGES[mod]).filter(Boolean);
  installPackages(packagesToInstall);

  const config: DomusConfigFile = {
    modules: selectedModules,
    databaseUrl: '',
  };

  const rlClose = () => { rl.close(); console.log('  Setup complete.'); };
  process.nextTick(rlClose);  // Close readline interface asynchronously
}
