#!/usr/bin/env node

// ===========================================
// ORDINATIO — Welcome Animation
// ===========================================
// A radiant source of divine light emanates
// perfect order outward. Mathematical.
// Structured. Beautiful.
// ===========================================

const { stdout } = process;
const cols = stdout.columns || 80;
const rows = stdout.rows || 24;
const cx = Math.floor(cols / 2);
const cy = Math.floor(rows / 2);

// Terminal chars are ~2.1x taller than wide
const ASPECT = 2.1;

stdout.write('\x1b[?25l'); // hide cursor
stdout.write('\x1b[2J');   // clear

// ---- 256-color ramp: white → cyan → blue → grey → gone ----
const ramp = [
  '\x1b[38;5;231m', '\x1b[38;5;195m', '\x1b[38;5;159m',
  '\x1b[38;5;123m', '\x1b[38;5;87m',  '\x1b[38;5;81m',
  '\x1b[38;5;75m',  '\x1b[38;5;69m',  '\x1b[38;5;63m',
  '\x1b[38;5;62m',  '\x1b[38;5;61m',  '\x1b[38;5;60m',
  '\x1b[38;5;59m',  '\x1b[38;5;242m', '\x1b[38;5;238m',
  '\x1b[38;5;236m', '\x1b[38;5;234m',
];
const R = '\x1b[0m';
const B = '\x1b[1m';

// ---- Sacred character sets by distance ----
const glyphsByDensity = [
  '████',          // 0: solid core
  '▓▓▓',          // 1: dense
  '▒▒░',          // 2: medium
  '⣿⣾⣽⣻⣷⣯⣟⡿⢿⣻',  // 3: braille dense
  '⡇⡏⡷⣇⣏⣷⢻⡾⣽⢿',  // 4: braille medium
  '⠿⠻⠽⠾⡛⡞⢧⢺⣙⣒',  // 5: braille sparse
  '⠇⠋⠞⠴⡘⡰⢃⢔⣁⣈',  // 6: braille dots
  '⠂⠄⠈⠐⠠⡀⢀',       // 7: braille minimal
];

const codeFragments = [
  'intent:', 'plan()', 'proof{}', 'trust', 'emit', 'DAG', 'exec',
  'node', 'edge', 'gate', 'domus', 'bus', 'seed', 'CoDE',
];

// ---- Compute a clean circle distance ----
function dist(x, y) {
  const dx = (x - cx) / ASPECT;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---- Render one frame ----
function renderFrame(frame) {
  // Multiple expanding waves — new wave every 20 frames
  const waveInterval = 20;
  const waveSpeed = 0.35;
  const waveWidth = 3.5;
  const numWaves = Math.floor(frame / waveInterval) + 1;

  // Build frame as single string
  let out = '\x1b[H';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const d = dist(x, y);

      // Core glow (always visible, pulsing)
      if (d < 2.0 + Math.sin(frame * 0.2) * 0.3) {
        const intensity = 1 - d / 2.5;
        const ci = Math.max(0, Math.floor((1 - intensity) * 3));
        const gi = Math.min(Math.floor(d), 1);
        out += ramp[ci] + B + glyphsByDensity[gi][Math.floor(Math.random() * glyphsByDensity[gi].length)] + R;
        continue;
      }

      // Check all active waves
      let bestCombined = 0;
      let bestCi = ramp.length - 1;

      for (let w = 0; w < numWaves; w++) {
        const waveAge = frame - (w * waveInterval);
        if (waveAge < 0) continue;
        const waveRadius = waveAge * waveSpeed;
        const ringDist = Math.abs(d - waveRadius);

        if (ringDist < waveWidth && d > 2.0 && d < waveRadius + 1) {
          const ringIntensity = 1 - (ringDist / waveWidth);
          const fadeFactor = Math.max(0, 1 - d / (rows * 0.45));
          const combined = ringIntensity * fadeFactor;

          if (combined > bestCombined) {
            bestCombined = combined;
            bestCi = Math.min(Math.floor((1 - combined) * ramp.length), ramp.length - 1);
          }
        }
      }

      if (bestCombined > 0.02) {
        let char;
        if (bestCombined > 0.7) {
          const set = glyphsByDensity[2];
          char = set[Math.floor(Math.random() * set.length)];
        } else if (bestCombined > 0.5) {
          const set = glyphsByDensity[3];
          char = set[Math.floor(Math.random() * set.length)];
        } else if (bestCombined > 0.3) {
          const set = glyphsByDensity[5];
          char = set[Math.floor(Math.random() * set.length)];
        } else if (bestCombined > 0.15) {
          const set = glyphsByDensity[7];
          char = set[Math.floor(Math.random() * set.length)];
        } else {
          if (Math.random() < 0.08) {
            const frag = codeFragments[Math.floor(Math.random() * codeFragments.length)];
            char = frag[0];
          } else {
            char = ' ';
          }
        }
        out += ramp[bestCi] + char + R;
        continue;
      }

      // Sparse trailing particles between waves
      if (d > 2.5 && frame > 10 && Math.random() < 0.008) {
        const ci = Math.min(Math.floor(d / (rows * 0.4) * ramp.length + 10), ramp.length - 1);
        const set = glyphsByDensity[7];
        out += ramp[ci] + set[Math.floor(Math.random() * set.length)] + R;
        continue;
      }

      out += ' ';
    }
    if (y < rows - 1) out += '\n';
  }

  // Title overlay (fades in after frame 80)
  if (frame > 80) {
    const title = '⚙  O R D I N A T I O  ⚙';
    const sub = 'Enterprise Execution Infrastructure';
    const titleAlpha = Math.min((frame - 80) / 25, 1);
    const titleChars = Math.floor(titleAlpha * title.length);
    const tx = cx - Math.floor(title.length / 2);
    const ty = cy - 5;

    if (ty >= 0 && ty < rows) {
      out += `\x1b[${ty + 1};${tx + 1}H`;
      for (let i = 0; i < titleChars; i++) {
        const ci = Math.max(0, Math.min(2, Math.floor(i / title.length * 3)));
        out += ramp[ci] + B + title[i] + R;
      }
    }

    if (frame > 95) {
      const subAlpha = Math.min((frame - 95) / 20, 1);
      const subChars = Math.floor(subAlpha * sub.length);
      const sx = cx - Math.floor(sub.length / 2);
      const sy = cy - 3;
      if (sy >= 0 && sy < rows) {
        out += `\x1b[${sy + 1};${sx + 1}H`;
        out += '\x1b[38;5;245m';
        out += sub.slice(0, subChars);
        out += R;
      }
    }
  }

  stdout.write(out);
}

// ---- Run animation ----
let frame = 0;
const totalFrames = 200;

const interval = setInterval(() => {
  renderFrame(frame);
  frame++;

  if (frame >= totalFrames) {
    clearInterval(interval);
    stdout.write('\x1b[2J\x1b[H\x1b[?25h');

    // Final branded screen
    const c = '\x1b[36m', b = '\x1b[1m', d = '\x1b[2m', w = '\x1b[37m';
    const g = '\x1b[32m', bl = '\x1b[34m', m = '\x1b[35m', y = '\x1b[33m';
    const r = R;

    console.log([
      '',
      `${c}${b}  ╔══════════════════════════════════════════════════════╗${r}`,
      `${c}${b}  ║                                                      ║${r}`,
      `${c}${b}  ║${r}${w}${b}             ⚙  O R D I N A T I O  ⚙                 ${r}${c}${b}║${r}`,
      `${c}${b}  ║${r}                                                      ${c}${b}║${r}`,
      `${c}${b}  ║${r}${d}        Enterprise Execution Infrastructure           ${r}${c}${b}║${r}`,
      `${c}${b}  ║${r}                                                      ${c}${b}║${r}`,
      `${c}${b}  ╚══════════════════════════════════════════════════════╝${r}`,
      '',
      `${w}${b}  Installed modules:${r}`,
      '',
      `  ${g}●${r} ${b}domus${r}        ${d}Orchestrator — event bus, factory, auto-wiring${r}`,
      `  ${g}●${r} ${b}core${r}         ${d}Governance — covenants, admission, council${r}`,
      `  ${c}●${r} ${b}email${r}        ${d}Multi-provider email + OAEM protocol${r}`,
      `  ${c}●${r} ${b}tasks${r}        ${d}Agentic workflow engine${r}`,
      `  ${c}●${r} ${b}entities${r}     ${d}Entity knowledge + active reasoning${r}`,
      `  ${bl}●${r} ${b}auth${r}         ${d}Lockout, password, session, CSRF${r}`,
      `  ${bl}●${r} ${b}settings${r}     ${d}System settings, AI config, preferences${r}`,
      `  ${bl}●${r} ${b}activities${r}   ${d}Activity feed + Operational Intuition${r}`,
      `  ${m}●${r} ${b}security${r}     ${d}5-layer Security Control Plane${r}`,
      `  ${m}●${r} ${b}jobs${r}         ${d}Unified execution engine + DAG automations${r}`,
      `  ${y}●${r} ${b}agent${r}        ${d}LLM-agnostic agent framework${r}`,
      '',
      `${w}${b}  Platform stats:${r}`,
      `  ${d}├${r} 11 packages  ${d}│${r}  3,859 tests  ${d}│${r}  v2.1 execution engine`,
      `  ${d}├${r} 9 Domus modules with event bus auto-wiring`,
      `  ${d}├${r} Enhanced v2 error diagnostics on every module`,
      `  ${d}└${r} DAG executor • Intent verification • Proof artifacts`,
      '',
      `${w}${b}  Quick start:${r}`,
      '',
      `  ${d}$${r} npx ordinatio init       ${d}← Interactive setup wizard${r}`,
      `  ${d}$${r} npx ordinatio add email   ${d}← Add a module${r}`,
      '',
      `  ${d}Docs:${r}  ${c}https://github.com/ordinatio-ai/ordinatio${r}`,
      `  ${d}npm:${r}   ${c}https://www.npmjs.com/org/ordinatio${r}`,
      '',
    ].join('\n'));
  }
}, 50);

process.on('SIGINT', () => {
  stdout.write('\x1b[?25h\x1b[2J\x1b[H');
  process.exit(0);
});
