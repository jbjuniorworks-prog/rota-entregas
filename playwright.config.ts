import {defineConfig} from '@playwright/test';

const URL = process.env.APP_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: 'testes/e2e',
  timeout: 90_000,
  expect: {timeout: 15_000},
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: URL,
    serviceWorkers: 'block',
    viewport: {width: 1280, height: 900},
    locale: 'pt-BR',
    timezoneId: 'America/Maceio',
  },
  webServer: process.env.APP_URL ? undefined : {
    command: 'npm run -s build && npx vite preview',
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
