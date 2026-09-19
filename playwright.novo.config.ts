import base from './playwright.config';
import {defineConfig} from '@playwright/test';

export default defineConfig({
  ...base,
  use: {...base.use, baseURL: 'http://127.0.0.1:4173'},
  webServer: {command: 'npx vite preview', url: 'http://127.0.0.1:4173', reuseExistingServer: true},
});
