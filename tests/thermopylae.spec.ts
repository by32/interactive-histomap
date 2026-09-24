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
  // chapters step forward and back from the transport
  await page.getByRole('button', { name: 'Next chapter' }).click()
  await expect(page.locator('#film-number')).toHaveText('02 / 14')
  await page.getByRole('button', { name: 'Previous chapter' }).click()
  await expect(page.locator('#film-number')).toHaveText('01 / 14')
  await page.getByRole('button', { name: 'Back to walkthrough' }).click()
  await expect(page.locator('body')).not.toHaveAttribute('data-mode', 'film')
  await expect(page.locator('#panel')).toBeVisible()
  expect(errors).toEqual([])
})

test('the walkthrough steps through its scenes', async ({ page }) => {
  // many steps and both topographies against software WebGL: give it room
  test.setTimeout(360_000)
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

  // everything beyond the story and the step controls waits in the Options menu
  const options = page.getByRole('button', { name: 'Options' })
  await expect(page.locator('#menu')).toBeHidden()
  await options.click()
  await expect(page.locator('#menu')).toBeVisible()

  // the armies legend lists both sides; opening it closes the menu
  await page.getByRole('button', { name: 'Armies' }).click()
  await expect(page.locator('#menu')).toBeHidden()
  await expect(page.locator('#legend-list li')).toHaveCount(8)
  await expect(page.locator('#legend')).toContainText('Spartans')
  await expect(page.locator('#legend')).toContainText('Immortals')
  await page.locator('#legend-close').click()
  await expect(page.locator('#legend')).toBeHidden()

  // the topography switch swaps in today's silted plain and is remembered in the hash
  await expect(page.locator('body')).toHaveAttribute('data-topo', '480bc')
  await options.click()
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
  // loads the GLB and both terrain textures into software WebGL: give it room
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('thermopylae.html#s=3')
  await expect(page.locator('body')).toHaveAttribute('data-soldiers', 'blender', { timeout: 30_000 })
  await expect(page.locator('body')).toHaveAttribute('data-terrain', 'baked', { timeout: 60_000 })
  // a still exists for this step: it is either waiting for the view to settle or shown
  await expect(page.locator('body')).toHaveAttribute('data-still', /waiting|shown|none/, { timeout: 30_000 })
  // the cinematic switch in the Options menu turns stills off and back on
  await page.getByRole('button', { name: 'Options' }).click()
  const chip = page.getByRole('button', { name: 'Cinematic stills' })
  await chip.click()
  await expect(page.locator('body')).toHaveAttribute('data-still', 'off')
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('c=0')
  await chip.click()
  await expect(page.locator('body')).not.toHaveAttribute('data-still', 'off')
  // the Cycles film is offered only once one has been published with the site
  // (a dev or preview server may answer a missing file with the page itself, so parse it)
  const hasFilm = await page.evaluate(async () => {
    const r = await fetch('thermopylae/film/film.json')
    return r.ok && (await r.text().then((t) => { try { return Boolean(JSON.parse(t).sources) } catch { return false } }))
  })
  await expect(page.locator('#rendered-film-open')).toBeHidden()
  if (hasFilm) await expect(page.locator('body')).toHaveAttribute('data-rendered-film', 'available')
  expect(errors).toEqual([])
})

test('the histomap links to the walkthrough', async ({ page }) => {
  await page.goto('')
  const link = page.getByRole('link', { name: /Thermopylae 3D/ })
  await expect(link).toHaveAttribute('href', /thermopylae\.html$/)
})
