import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    reporters: process.env.PUGIL_ENABLED === 'true'
      ? ['default', './src/pugil-reporter.ts']
      : ['default'],
  },
});
