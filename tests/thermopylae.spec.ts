import { test, expect } from '@playwright/test'

// the walkthrough is a second page of the site: a three.js scene with a scripted tour
test('the Thermopylae walkthrough renders and steps through its scenes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('thermopylae.html')
  await expect(page).toHaveTitle(/Thermopylae/)

  const canvas = page.locator('#scene')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  expect(box.width).toBeGreaterThan(300)
  expect(box.height).toBeGreaterThan(300)

  // opens on the first scene
  await expect(page.locator('body.ready')).toBeAttached({ timeout: 30_000 })
  await expect(page.locator('#stage-title')).toHaveText('The Hot Gates')
  await expect(page.locator('#counter')).toHaveText('1 / 11')
  await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled()

  // next button and arrow keys advance the tour; the hash follows
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.locator('#stage-title')).toHaveText('Xerxes waits at Trachis')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#s=2')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#counter')).toHaveText('3 / 11')

  // place names are drawn as DOM labels over the canvas
  await expect
    .poll(async () => page.locator('#labels .label:visible').count(), { timeout: 20_000 })
    .toBeGreaterThan(2)

  // the legend lists both sides
  await page.getByRole('button', { name: 'legend' }).click()
  await expect(page.locator('#legend-list li')).toHaveCount(8)
  await expect(page.locator('#legend')).toContainText('Spartans')
  await expect(page.locator('#legend')).toContainText('Immortals')

  // a deep link lands on its scene
  await page.goto('thermopylae.html#s=10')
  await expect(page.locator('#stage-title')).toHaveText('The last stand on Kolonos hill')

  expect(errors).toEqual([])
})

test('the histomap links to the walkthrough', async ({ page }) => {
  await page.goto('')
  const link = page.getByRole('link', { name: /Thermopylae 3D/ })
  await expect(link).toHaveAttribute('href', /thermopylae\.html$/)
})
