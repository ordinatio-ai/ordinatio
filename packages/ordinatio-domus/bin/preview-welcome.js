#!/usr/bin/env node

// Preview the Ordinatio welcome screen.
// Run: node packages/ordinatio-domus/bin/preview-welcome.js

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const cyan = '\x1b[36m';
const white = '\x1b[37m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const magenta = '\x1b[35m';

console.log('');
console.log(`${cyan}${bold}  ╔══════════════════════════════════════════════════════╗${reset}`);
console.log(`${cyan}${bold}  ║                                                      ║${reset}`);
console.log(`${cyan}${bold}  ║${reset}${white}${bold}             ⚙  O R D I N A T I O  ⚙                 ${reset}${cyan}${bold}║${reset}`);
console.log(`${cyan}${bold}  ║${reset}                                                      ${cyan}${bold}║${reset}`);
console.log(`${cyan}${bold}  ║${reset}${dim}        Enterprise Execution Infrastructure           ${reset}${cyan}${bold}║${reset}`);
console.log(`${cyan}${bold}  ║${reset}                                                      ${cyan}${bold}║${reset}`);
console.log(`${cyan}${bold}  ╚══════════════════════════════════════════════════════╝${reset}`);
console.log('');
console.log(`${white}${bold}  Installed modules:${reset}`);
console.log('');
console.log(`  ${green}●${reset} ${bold}domus${reset}        ${dim}Orchestrator — event bus, factory, auto-wiring${reset}`);
console.log(`  ${green}●${reset} ${bold}core${reset}         ${dim}Governance — covenants, admission, council${reset}`);
console.log(`  ${cyan}●${reset} ${bold}email${reset}        ${dim}Multi-provider email + OAEM protocol${reset}`);
console.log(`  ${cyan}●${reset} ${bold}tasks${reset}        ${dim}Agentic workflow engine${reset}`);
console.log(`  ${cyan}●${reset} ${bold}entities${reset}     ${dim}Entity knowledge + active reasoning${reset}`);
console.log(`  ${blue}●${reset} ${bold}auth${reset}         ${dim}Lockout, password, session, CSRF${reset}`);
console.log(`  ${blue}●${reset} ${bold}settings${reset}     ${dim}System settings, AI config, preferences${reset}`);
console.log(`  ${blue}●${reset} ${bold}activities${reset}   ${dim}Activity feed + Operational Intuition${reset}`);
console.log(`  ${magenta}●${reset} ${bold}security${reset}     ${dim}5-layer Security Control Plane${reset}`);
console.log(`  ${magenta}●${reset} ${bold}jobs${reset}         ${dim}Unified execution engine + DAG automations${reset}`);
console.log(`  ${yellow}●${reset} ${bold}agent${reset}        ${dim}LLM-agnostic agent framework${reset}`);
console.log('');
console.log(`${white}${bold}  Platform stats:${reset}`);
console.log(`  ${dim}├${reset} 11 packages  ${dim}│${reset}  3,859 tests  ${dim}│${reset}  v2.1 execution engine`);
console.log(`  ${dim}├${reset} 9 Domus modules with event bus auto-wiring`);
console.log(`  ${dim}├${reset} Enhanced v2 error diagnostics on every module`);
console.log(`  ${dim}└${reset} DAG executor • Intent verification • Proof artifacts`);
console.log('');
console.log(`${white}${bold}  Quick start:${reset}`);
console.log('');
console.log(`  ${dim}$${reset} npx ordinatio init       ${dim}← Interactive setup wizard${reset}`);
console.log(`  ${dim}$${reset} npx ordinatio add email   ${dim}← Add a module${reset}`);
console.log('');
console.log(`  ${dim}Or configure programmatically:${reset}`);
console.log('');
console.log(`  ${cyan}import${reset} { createDomus } ${cyan}from${reset} ${green}'@ordinatio/domus'${reset}`);
console.log(`  ${cyan}const${reset} app = ${cyan}await${reset} createDomus({`);
console.log(`    databaseUrl: process.env.DATABASE_URL,`);
console.log(`    modules: [${green}'email'${reset}, ${green}'tasks'${reset}, ${green}'entities'${reset}],`);
console.log(`  })`);
console.log('');
console.log(`  ${dim}Docs:${reset}  ${cyan}https://github.com/ordinatio-ai/ordinatio${reset}`);
console.log(`  ${dim}npm:${reset}   ${cyan}https://www.npmjs.com/org/ordinatio${reset}`);
console.log('');
