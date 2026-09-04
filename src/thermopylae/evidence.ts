const base = `${import.meta.env.BASE_URL}art/thermopylae/`

export const EVIDENCE = [
  {
    image: 'corinthian-helmet.jpg',
    title: 'A helmet from the age of the battle',
    short: 'Corinthian helmet',
    date: 'Greek · early 5th century BC',
    source: 'The Metropolitan Museum of Art · 2016.235a–c',
    href: 'https://www.metmuseum.org/art/collection/search/703054',
    credit: 'The Met Open Access · CC0',
    description: 'Bronze cheek pieces, a narrow nose guard and a rounded skull protect the face. This surviving helmet informs the Greek figures; it was not found at Thermopylae.',
  },
  {
    image: 'greek-persian-amphora.jpg',
    title: 'How a contemporary artist saw the armies',
    short: 'Greek warrior & Persian archer',
    date: 'Attic amphora · ca. 480–470 BC',
    source: 'The Metropolitan Museum of Art · 06.1021.117',
    href: 'https://www.metmuseum.org/art/collection/search/247283',
    credit: 'The Met Open Access · CC0',
    description: 'A Greek warrior attacks a Persian archer. Painted close to the time of the invasion, the vessel records contrasting equipment through a Greek artist’s eyes. The scene is not identified as Thermopylae.',
  },
  {
    image: 'persian-archers-frieze.jpg',
    title: 'Persian colour, preserved at Susa',
    short: 'Archers from the palace at Susa',
    date: 'Achaemenid · 522–486 BC',
    source: 'Musée du Louvre · AOD 488',
    href: 'https://collections.louvre.fr/en/ark:/53355/cl010170854',
    credit: 'Photograph: Jebulon, 2010 · public domain',
    creditHref: 'https://commons.wikimedia.org/wiki/File:Archers_frieze_Darius_1st_Palace_Suse_Louvre_AOD_488_a.jpg',
    description: 'Glazed bricks from Darius I’s palace show patterned robes, bows and spears. This is court imagery, not proof of a universal battlefield uniform or a certain portrait of the Immortals.',
  },
] as const

export function setupEvidence() {
  const dialog = document.querySelector<HTMLDialogElement>('#evidence-dialog')!
  const gallery = document.querySelector('#evidence-gallery')!
  for (const item of EVIDENCE) {
    const figure = document.createElement('figure')
    figure.innerHTML = `<div class="object-image"><img src="${base}${item.image}" alt="${item.short}" loading="lazy" width="650" height="800" /></div>
      <figcaption><p class="object-date">${item.date}</p><h3>${item.title}</h3><p>${item.description}</p>
      <a href="${item.href}" target="_blank" rel="noopener">${item.source} ↗</a>
      <small>${'creditHref' in item ? `<a href="${item.creditHref}" target="_blank" rel="noopener">${item.credit}</a>` : item.credit}</small></figcaption>`
    gallery.appendChild(figure)
  }
  const open = () => {
    if (!dialog.open) { dialog.showModal(); document.dispatchEvent(new Event('evidence-open')) }
  }
  document.querySelector('#evidence-open')!.addEventListener('click', open)
  document.querySelector('#artifact-card')!.addEventListener('click', open)
  document.querySelector('#evidence-close')!.addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close() })
  let previous = -1
  return (stage: number) => {
    const index = stage === 6 || stage === 7 ? 2 : stage >= 8 ? 0 : 1
    if (index === previous) return
    previous = index
    const item = EVIDENCE[index]
    const img = document.querySelector<HTMLImageElement>('#artifact-image')!
    img.src = base + item.image
    img.alt = item.short
    document.querySelector('#artifact-name')!.textContent = item.short
    document.querySelector('#artifact-date')!.textContent = item.date
  }
}
