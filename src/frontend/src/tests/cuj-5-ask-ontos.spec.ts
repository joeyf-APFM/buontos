import { test, expect } from '@playwright/test'
import { loadDemoData, clearDemoData } from './helpers/demo-data'

test.beforeAll(async ({ request }) => {
  await loadDemoData(request)
})

test.afterAll(async ({ request }) => {
  await clearDemoData(request)
})

// ---------------------------------------------------------------------------
// CUJ-5  Ask Ontos — Natural Language Querying
// ---------------------------------------------------------------------------
test.describe('CUJ-5 — Ask Nucleus / Search', () => {
  test('search page loads and defaults to LLM tab', async ({ page }) => {
    await page.goto('/search')
    // The page should show the search interface with tabs
    await expect(
      page.getByRole('tablist').or(page.getByRole('textbox')).first()
    ).toBeVisible()
  })

  test('LLM search tab renders chat input', async ({ page }) => {
    await page.goto('/search/llm')
    // Should have a text input for questions (chat input or textarea)
    await expect(
      page.getByRole('textbox')
        .or(page.locator('textarea'))
        .first()
    ).toBeVisible()
  })

  test('index search tab renders search input', async ({ page }) => {
    await page.goto('/search/index')
    await expect(
      page.getByRole('textbox')
        .or(page.getByRole('searchbox'))
        .first()
    ).toBeVisible()
  })

  test('LLM search status endpoint responds', async ({ request }) => {
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
    const resp = await request.get(`${BACKEND_URL}/api/llm-search/status`)
    expect(resp.status()).toBe(200)
  })
})
