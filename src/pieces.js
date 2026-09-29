// Charge les SVG de public/pieces/ (glyphes), public/taches/ et les motifs personnels (ajoutés par glisser-déposer),
// et les place dans un <defs> partagé.
// Chaque motif est recentré et mis à l'échelle dans une boîte de 100 × 100 (= une case).
import { NS, el } from './svg.js'
import { loadCustom, shapesToPaths, SHAPES } from './custom-motifs.js'

const COLLECTIONS = [
  { dir: 'pieces', name: 'glyphes' },
  { dir: 'taches', name: 'taches' },
]
export const CUSTOM_COLLECTION = 'mes motifs'

function shortLabel(id) {
  const m = id.match(/^(symbols-|taches)?(\d+)/)
  if (!m) return id
  return ({ 'symbols-': 'S', taches: 'T' }[m[1]] || '') + m[2]
}

async function loadIndex({ dir, name }) {
  const res = await fetch(`/${dir}/index.json`)
  if (!res.ok) return []
  return (await res.json()).map((entry) => ({ ...entry, collection: name }))
}

export async function loadPieces(host) {
  const index = (await Promise.all(COLLECTIONS.map(loadIndex))).flat()
  const defs = el('defs')
  const measure = el('g')
  host.append(defs, measure)

  // motifs du projet : un seul tracé par fichier (vectorisation potrace)
  const builtIn = await Promise.all(
    index.map(async (entry) => {
      const text = await fetch('/' + entry.file).then((r) => r.text())
      const source = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('path')
      const node = el('g')
      node.append(el('path', { d: source.getAttribute('d'), 'fill-rule': 'evenodd' }))
      return { id: entry.id, label: shortLabel(entry.id), collection: entry.collection, node }
    }),
  )

  // motifs personnels : plusieurs formes possibles, déjà nettoyées à l'import
  const custom = loadCustom().map((m, i) => {
    const node = el('g')
    const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${m.svg}</svg>`, 'image/svg+xml')
    for (const sh of doc.documentElement.querySelectorAll(SHAPES)) node.append(document.importNode(sh, true))
    return { id: m.id, label: `M${i + 1}`, collection: CUSTOM_COLLECTION, node, nom: m.nom }
  })

  const pieces = []
  for (const p of [...builtIn, ...custom]) {
    measure.append(p.node)
    const b = p.node.getBBox()
    if (!(b.width > 0 || b.height > 0)) {
      p.node.remove()
      continue // motif vide : ignoré plutôt que de casser le rendu
    }
    const s = 100 / Math.max(b.width, b.height)
    const shapes = p.node.querySelectorAll(SHAPES)
    for (const sh of shapes) {
      // L'épaisseur du contour (--sw) reste exprimée en unités de case
      sh.style.strokeWidth = `calc(var(--sw, 0) * ${1 / s})`
      sh.dataset.k = 1 / s
    }
    // pour le rendu canvas de l'aperçu : même recentrage que dans le <defs>
    Object.assign(p, { s, cx: b.x + b.width / 2, cy: b.y + b.height / 2, paths: shapesToPaths(shapes) })
    const g = el('g', {
      id: 'piece-' + p.id,
      transform: `scale(${s}) translate(${-(b.x + b.width / 2)} ${-(b.y + b.height / 2)})`,
    })
    g.append(...p.node.childNodes)
    defs.append(g)
    delete p.node
    pieces.push(p)
  }
  measure.remove()

  const order = [...COLLECTIONS.map((c) => c.name), CUSTOM_COLLECTION]
  return pieces.sort(
    (a, b) =>
      order.indexOf(a.collection) - order.indexOf(b.collection) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
}
