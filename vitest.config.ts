import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const configuredTmpDir = process.env.TMPDIR;
if (!configuredTmpDir || !configuredTmpDir.startsWith('/') || !existsSync(configuredTmpDir)) {
  process.env.TMPDIR = '/tmp';
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts']
  }
});
