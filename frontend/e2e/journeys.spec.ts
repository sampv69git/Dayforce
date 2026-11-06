import { expect, test } from '@playwright/test'
import { expectAccessible, resetData, signInAs } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetData(page)
})

test('J1: manager fixes a root cause and its cascade with one countersignature', async ({ page }) => {
  await signInAs(page, 'Maya Chen')
  await expect(page).toHaveURL(/\/queue/)
  await expect(page.getByRole('heading', { name: 'Exceptions' })).toBeVisible()
  await page.locator('[data-id]').filter({ hasText: 'Two shifts joined' }).first().click()
  const detail = page.getByRole('region', { name: 'Exception detail' })
  await expect(detail.getByRole('heading', { name: 'Two shifts joined by missed punches' })).toBeVisible()
  await expect(detail.getByLabel('Harness gates')).toBeVisible()
  await expect(detail.getByText('This correction also resolves')).toBeVisible()
  await expectAccessible(page, 'exception detail')
  await detail.getByRole('button', { name: /Approve/ }).click()
  await detail.getByRole('button', { name: /Confirm/ }).click()
  await expect(page.getByText(/Countersigned\. 2 related exceptions resolved too\./)).toBeVisible()
  await expect(page.getByText(/3 of \d+ resolved/)).toBeVisible()
})

test('J2: payroll resolves an escalation with conflicting evidence', async ({ page }) => {
  await signInAs(page, 'Maya Chen')
  await page.locator('[data-id]').filter({ hasText: 'Sam Okafor' }).first().click()
  await expect(page.getByText('Why escalated:')).toBeVisible()
  await signInAs(page, 'Arjun Rao')
  await expect(page).toHaveURL(/\/payroll/)
  await page.getByRole('button', { name: /Sam Okafor/ }).click()
  await expect(page.getByText(/conflicts with scanner activity/).first()).toBeVisible()
  await expectAccessible(page, 'payroll')
})

test('J3: employee confirms a missed punch on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInAs(page, 'Diego Alvarez')
  await expect(page.getByRole('heading', { name: 'Hi Diego' })).toBeVisible()
  await expectAccessible(page, 'employee home')
  await page.getByRole('button', { name: /^Yes, / }).click()
  await expect(page.getByText(/Sent to your manager/)).toBeVisible()
  await expect(page.getByText('Confirmation sent. Waiting for your manager.')).toBeVisible()
})

test('J4: a fault replay is caught by the harness and falls back visibly', async ({ page }) => {
  await signInAs(page, 'Maya Chen')
  await page.locator('[data-id]').filter({ hasText: 'Kai Morgan' }).first().click()
  await expect(page.getByRole('link', { name: /Inspect trace/ })).toBeVisible()
  await signInAs(page, 'Arjun Rao')
  await page.goto('/inspector')
  await page.locator('tbody a').first().click()
  await expect(page.getByText('Pipeline waterfall')).toBeVisible()
  await page.getByRole('button', { name: 'Replay with fault' }).click()
  await page.getByRole('button', { name: /Hallucinated clause/ }).click()
  await expect(page.getByText(/Fault replay: hallucinated clause/)).toBeVisible()
  await expect(page.getByText('Rule-based fallback').first()).toBeVisible()
  await expect(page.getByText(/G3 unknown clause/).first()).toBeVisible()
  await expectAccessible(page, 'inspector')
})

test('J5: degraded mode keeps the workflow usable without an LLM', async ({ page }) => {
  await signInAs(page, 'Maya Chen')
  await expect(page.getByText('Rule-based mode')).toBeVisible()
  await page.locator('[data-id]').filter({ hasText: 'Priya Natarajan' }).first().click()
  const detail = page.getByRole('region', { name: 'Exception detail' })
  await expect(detail.getByText('Record one hour of meal premium; do not edit break punches.')).toBeVisible()
  await expect(detail.getByRole('button', { name: /Approve/ })).toBeEnabled()
  await expectAccessible(page, 'queue')
})

test('landing page is accessible and explains the product', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The model drafts.')
  await expectAccessible(page, 'personas')
})
