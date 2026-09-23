import { test, expect } from '@playwright/test'

// the walkthrough is a second page of the site: a three.js scene with a
// scripted tour and a seekable film of the whole battle
test('the Thermopylae page opens on the film and returns to the walkthrough', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('thermopylae.html')
  await expect(page).toHaveTitle(/Thermopylae/)
  await expect(page.locator('body.ready')).toBeAttached({ timeout: 30_000 })

  const canvas = page.locator('#scene')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  expect(box.width).toBeGreaterThan(300)
  expect(box.height).toBeGreaterThan(300)

  // with no hash the film starts
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'film')
  await expect(page.locator('#cinema')).toBeVisible()
  await page.getByRole('button', { name: 'Back to walkthrough' }).click()
  await expect(page.locator('body')).not.toHaveAttribute('data-mode', 'film')
  await expect(page.locator('#panel')).toBeVisible()
  expect(errors).toEqual([])
})

test('the walkthrough steps through its scenes', async ({ page }) => {
  // many steps against software WebGL: give it room
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('thermopylae.html#s=1')
  await expect(page.locator('body.ready')).toBeAttached({ timeout: 30_000 })
  await expect(page.locator('#stage-title')).toHaveText('The Hot Gates')
  await expect(page.locator('#counter')).toHaveText('01 / 11')
  await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled()

  // next button and arrow keys advance the tour; the hash follows
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.locator('#stage-title')).toHaveText('Xerxes waits at Trachis')
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('s=2')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#counter')).toHaveText('03 / 11')

  // place names are drawn as DOM labels over the canvas
  await expect
    .poll(async () => page.locator('#labels .label:visible').count(), { timeout: 20_000 })
    .toBeGreaterThan(2)

  // the armies legend lists both sides
  await page.getByRole('button', { name: 'Armies' }).click()
  await expect(page.locator('#legend-list li')).toHaveCount(8)
  await expect(page.locator('#legend')).toContainText('Spartans')
  await expect(page.locator('#legend')).toContainText('Immortals')
  await page.getByRole('button', { name: 'Armies' }).click()

  // the topography switch swaps in today's silted plain and is remembered in the hash
  await expect(page.locator('body')).toHaveAttribute('data-topo', '480bc')
  await page.getByRole('button', { name: 'Today' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-topo', 'today')
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('t=today')
  await page.keyboard.press('t')
  await expect(page.locator('body')).toHaveAttribute('data-topo', '480bc')

  // a deep link lands on its scene
  await page.goto('thermopylae.html#s=10')
  await expect(page.locator('#stage-title')).toHaveText('The last stand on Kolonos hill')

  expect(errors).toEqual([])
})

test('the Blender assets load: soldiers, baked terrain, stills and the rendered film', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('thermopylae.html#s=3')
  await expect(page.locator('body')).toHaveAttribute('data-soldiers', 'blender', { timeout: 30_000 })
  await expect(page.locator('body')).toHaveAttribute('data-terrain', 'baked', { timeout: 60_000 })
  // a still exists for this step: it is either waiting for the view to settle or shown
  await expect(page.locator('body')).toHaveAttribute('data-still', /waiting|shown|none/, { timeout: 30_000 })
  // the cinematic chip turns stills off and back on
  const chip = page.getByRole('button', { name: 'Cinematic' })
  await chip.click()
  await expect(page.locator('body')).toHaveAttribute('data-still', 'off')
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('c=0')
  await chip.click()
  await expect(page.locator('body')).not.toHaveAttribute('data-still', 'off')
  // the Cycles film is offered only once one has been published with the site
  const hasFilm = await page.evaluate(async () => (await fetch('thermopylae/film/film.json')).ok)
  await expect(page.locator('#rendered-film-open')).toBeHidden()
  if (hasFilm) await expect(page.locator('body')).toHaveAttribute('data-rendered-film', 'available')
  expect(errors).toEqual([])
})

test('the histomap links to the walkthrough', async ({ page }) => {
  await page.goto('')
  const link = page.getByRole('link', { name: /Thermopylae 3D/ })
  await expect(link).toHaveAttribute('href', /thermopylae\.html$/)
})
