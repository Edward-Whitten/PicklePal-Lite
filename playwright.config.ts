import { defineConfig } from '@playwright/test';

const viewport = (width: number, height: number) => ({ viewport: { width, height } });

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-portrait', use: viewport(390, 844) },
    { name: 'mobile-landscape', use: viewport(844, 390) },
    { name: 'tablet-portrait', use: viewport(768, 1024) },
    { name: 'tablet-landscape', use: viewport(1024, 768) },
    { name: 'desktop', use: viewport(1440, 900) },
    { name: 'ultra-wide', use: viewport(1920, 1080) },
  ],
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});