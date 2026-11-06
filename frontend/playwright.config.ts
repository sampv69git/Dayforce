import { defineConfig, devices } from '@playwright/test'

const API_PORT = 8100
const WEB_PORT = 5180

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
  webServer: [
    {
      command: `uv run uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: 'sqlite:///e2e.db',
        LLM_PROVIDER: 'rule_based',
        EMBEDDINGS_ENABLED: process.env.E2E_EMBEDDINGS ?? 'false',
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
        CORS_ORIGINS: `["http://localhost:${WEB_PORT}"]`,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}` },
    },
  ],
})
