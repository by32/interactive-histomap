import { test, expect } from '@playwright/test'

test('the histomap loads, renders, and responds', async ({ page }) => {
  await page.goto('')
  await expect(page).toHaveTitle(/Interactive Histomap/)

  // map canvas comes up with real dimensions
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  const box = await canvas.boundingBox()
  expect(box!.width).toBeGreaterThan(300)
  expect(box!.height).toBeGreaterThan(300)

  // ribbon renders a healthy number of streams
  const streams = page.locator('svg.ribbon path.stream')
  await expect
    .poll(async () => streams.count(), { timeout: 20_000 })
    .toBeGreaterThan(10)

  // boots at the first snapshot
  const year = page.locator('.year-label')
  await expect(year).toHaveText('2000 BC')

  // clicking the ribbon scrubs the year
  const ribbon = page.locator('svg.ribbon')
  const rb = (await ribbon.boundingBox())!
  await page.mouse.click(rb.x + rb.width * 0.6, rb.y + rb.height * 0.5)
  await expect(year).not.toHaveText('2000 BC')
  const afterScrub = await year.textContent()

  // step button advances one snapshot
  await page.getByRole('button', { name: 'Next snapshot' }).click()
  await expect(year).not.toHaveText(afterScrub!)

  // time-scale toggle switches modes
  const toggle = page.locator('.scale-toggle')
  await expect(toggle).toHaveText('linear time')
  await toggle.click()
  await expect(toggle).toHaveText('compressed time')

  // search selects an entity and opens the info panel
  await page.fill('.search-box input', 'roman emp')
  await page.locator('.search-results button').first().click()
  await expect(page.locator('.info-panel h2')).toHaveText(/Rome|Roman/)
  await expect(page.locator('.info-panel')).toContainText('km²')

  // wait for polygons before the visual record
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'test-results/smoke-desktop.png' })
})

test('mobile layout: horizontal ribbon below the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('#y=1500')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(async () => page.locator('svg.ribbon path.stream').count(), { timeout: 20_000 })
    .toBeGreaterThan(10)
  const map = (await page.locator('.map-wrap').boundingBox())!
  const ribbon = (await page.locator('.ribbon-panel').boundingBox())!
  expect(ribbon.y).toBeGreaterThan(map.y) // ribbon sits below the map
  expect(ribbon.width).toBeGreaterThan(ribbon.height) // horizontal orientation
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/smoke-mobile.png' })
})
