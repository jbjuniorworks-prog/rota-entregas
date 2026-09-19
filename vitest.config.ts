import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['app/src/**/*.test.ts'],
    exclude: process.env.PARIDADE ? [] : ['**/*.local.test.ts', '**/node_modules/**'],
    globals: true,
  },
});
