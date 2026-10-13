import {defineConfig,devices} from '@playwright/test';

// Run browser checks against the production build locally before Cloudflare
// deployment. No live customer accounts, passwords or saved projects are used.
export default defineConfig({
  testDir:'./e2e',
  timeout:30_000,
  expect:{timeout:10_000},
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?'github':'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure'
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
});
