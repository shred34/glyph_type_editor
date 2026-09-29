// Charge les SVG de public/pieces/ (glyphes) et public/taches/, et les place dans un <defs> partagé.
// Chaque motif est recentré et mis à l'échelle dans une boîte de 100 × 100 (= une case).
import { el } from './svg.js'

const COLLECTIONS = [
  { dir: 'pieces', name: 'glyphes' },
  { dir: 'taches', name: 'taches' },
]

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

  const pieces = await Promise.all(
    index.map(async (entry) => {
      const text = await fetch('/' + entry.file).then((r) => r.text())
      const source = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('path')
      const path = el('path', { d: source.getAttribute('d'), 'fill-rule': 'evenodd' })
      measure.append(path)
      return { id: entry.id, label: shortLabel(entry.id), collection: entry.collection, path }
    }),
  )

  for (const p of pieces) {
    const b = p.path.getBBox()
    const s = 100 / Math.max(b.width, b.height)
    // L'épaisseur du contour (--sw) reste exprimée en unités de case
    p.path.style.strokeWidth = `calc(var(--sw, 0) * ${1 / s})`
    p.path.dataset.k = 1 / s
    // pour le rendu canvas de l'aperçu : même recentrage que dans le <defs>
    Object.assign(p, { s, cx: b.x + b.width / 2, cy: b.y + b.height / 2, path2d: new Path2D(p.path.getAttribute('d')) })
    const g = el('g', {
      id: 'piece-' + p.id,
      transform: `scale(${s}) translate(${-(b.x + b.width / 2)} ${-(b.y + b.height / 2)})`,
    })
    g.append(p.path)
    defs.append(g)
  }
  measure.remove()

  const order = COLLECTIONS.map((c) => c.name)
  return pieces.sort(
    (a, b) =>
      order.indexOf(a.collection) - order.indexOf(b.collection) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
}
