#!/usr/bin/env node

// ===========================================
// ORDINATIO DOMUS — CLI Entry Point
// ===========================================
// Usage:
//   npx ordinatio init       — Initialize a new domus
//   npx ordinatio add <mod>  — Add a module to existing domus
// ===========================================

import { parseArgs } from 'node:util';

const { positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
});

const command = positionals[0];

switch (command) {
  case 'init': {
    const { init } = await import('../src/cli/init.js');
    await init();
    break;
  }
  case 'add': {
    const moduleName = positionals[1];
    if (!moduleName) {
      console.error('Usage: ordinatio add <module>');
      process.exit(1);
    }
    const { addModule } = await import('../src/cli/add-module.js');
    await addModule(moduleName);
    break;
  }
  default:
    console.log('Ordinatio Domus — The Ordinatio home unit');
    console.log();
    console.log('Commands:');
    console.log('  init          Initialize a new domus');
    console.log('  add <module>  Add a module to an existing domus');
    console.log();
    console.log('Available modules: email, tasks');
    break;
}
