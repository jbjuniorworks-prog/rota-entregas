import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    include: ['app/src/**/*.test.ts'],
    globals: true,
  },
});
