import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export async function resetData(page: Page) {
  const login = await page.request.post('/api/v1/auth/demo-login', { data: { user_id: 'u-arjun' } })
  const { access_token } = await login.json()
  const reset = await page.request.post('/api/v1/admin/reset', { headers: { Authorization: `Bearer ${access_token}` } })
  expect(reset.ok()).toBeTruthy()
  await page.request.put('/api/v1/admin/provider', { headers: { Authorization: `Bearer ${access_token}` }, data: { provider: 'rule_based' } })
}

export async function signInAs(page: Page, name: string) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(name) }).first().click()
}

export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([])
}
