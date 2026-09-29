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
export const BASIC_COLLECTION = 'formes'

// Formes de base, dessinées directement ici (polygones réguliers, pointe en haut, rayon 50)
const polygon = (n, turn = -90) =>
  'M' +
  Array.from({ length: n }, (_, k) => {
    const a = ((turn + (360 / n) * k) * Math.PI) / 180
    return `${(50 * Math.cos(a)).toFixed(3)} ${(50 * Math.sin(a)).toFixed(3)}`
  }).join('L') +
  'Z'
const star = (n, outer, inner) =>
  'M' +
  Array.from({ length: n * 2 }, (_, k) => {
    const a = ((-90 + (180 / n) * k) * Math.PI) / 180
    const r = k % 2 ? inner : outer
    return `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`
  }).join('L') +
  'Z'
// [id, code, nom, tracé, échelle, décalage vertical] — l'échelle réduit les formes pleines, qui paraissent sinon plus lourdes
// que les motifs gravés (le carré, le plus massif, est le plus réduit)
const BASIC_SHAPES = [
  ['forme-carre', 'F1', 'carré', 'M-50 -50H50V50H-50Z', 0.6],
  ['forme-rond', 'F2', 'rond', 'M-50 0A50 50 0 1 0 50 0A50 50 0 1 0 -50 0Z', 0.7],
  ['forme-triangle', 'F3', 'triangle', polygon(3), 0.75],
  // étoile à 5 branches
  ['forme-etoile', 'F4', 'étoile', star(5, 50, 20), 0.75],
  ['forme-pentagone', 'F5', 'pentagone', polygon(5), 0.72],
  // croix : un peu plus grande et légèrement descendue (décalage de 3 unités vers le bas)
  ['forme-croix', 'F6', 'croix', 'M-15 -50H15V-15H50V15H15V50H-15V15H-50V-15H-15Z', 0.63, 3],
]

function shortLabel(id) {
  const m = id.match(/^(symbols-|taches)?(\d+)/)
  if (!m) return id
  return ({ 'symbols-': 'S', taches: 'T' }[m[1]] || '') + m[2]
}

async function loadIndex({ dir, name }) {
  const res = await fetch(`${import.meta.env.BASE_URL}${dir}/index.json`)
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
      const text = await fetch(import.meta.env.BASE_URL + entry.file).then((r) => r.text())
      const source = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('path')
      const node = el('g')
      node.append(el('path', { d: source.getAttribute('d'), 'fill-rule': 'evenodd' }))
      return { id: entry.id, label: shortLabel(entry.id), collection: entry.collection, node }
    }),
  )

  // Glyphes : codes G1, G2… dans l'ordre d'affichage d'avant (4, 5, 19…, puis S1, S15…).
  // Seul le nom affiché change : les identifiants internes restent les mêmes (réglages, rôles, cycle, états…).
  const glyphes = builtIn.filter((p) => p.collection === 'glyphes')
  glyphes
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    .forEach((p, i) => (p.label = `G${i + 1}`))

  const basic = BASIC_SHAPES.map(([id, label, nom, d, echelle, decalage]) => {
    const node = el('g')
    node.append(el('path', { d, 'fill-rule': 'evenodd' }))
    return { id, label, nom, collection: BASIC_COLLECTION, node, echelle, decalage }
  })

  // motifs personnels : plusieurs formes possibles, déjà nettoyées à l'import
  const custom = loadCustom().map((m, i) => {
    const node = el('g')
    const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${m.svg}</svg>`, 'image/svg+xml')
    for (const sh of doc.documentElement.querySelectorAll(SHAPES)) node.append(document.importNode(sh, true))
    return { id: m.id, label: `M${i + 1}`, collection: CUSTOM_COLLECTION, node, nom: m.nom }
  })

  const pieces = []
  for (const p of [...basic, ...builtIn, ...custom]) {
    measure.append(p.node)
    const b = p.node.getBBox()
    if (!(b.width > 0 || b.height > 0)) {
      p.node.remove()
      continue // motif vide : ignoré plutôt que de casser le rendu
    }
    const s = (100 * (p.echelle || 1)) / Math.max(b.width, b.height)
    const shapes = p.node.querySelectorAll(SHAPES)
    for (const sh of shapes) {
      // L'épaisseur du contour (--sw) reste exprimée en unités de case
      sh.style.strokeWidth = `calc(var(--sw, 0) * ${1 / s})`
      sh.dataset.k = 1 / s
    }
    // pour le rendu canvas de l'aperçu : même recentrage que dans le <defs>
    // décalage : déplace le motif dans sa case (en unités de case, positif = vers le bas)
    const cy = b.y + b.height / 2 - (p.decalage || 0) / s
    Object.assign(p, { s, cx: b.x + b.width / 2, cy, paths: shapesToPaths(shapes) })
    const g = el('g', {
      id: 'piece-' + p.id,
      transform: `scale(${s}) translate(${-(b.x + b.width / 2)} ${-cy})`,
    })
    g.append(...p.node.childNodes)
    defs.append(g)
    delete p.node
    pieces.push(p)
  }
  measure.remove()

  const order = [BASIC_COLLECTION, ...COLLECTIONS.map((c) => c.name), CUSTOM_COLLECTION]
  return pieces.sort(
    (a, b) =>
      order.indexOf(a.collection) - order.indexOf(b.collection) ||
      (a.collection === BASIC_COLLECTION ? 0 : a.label.localeCompare(b.label, undefined, { numeric: true })),
  )
}
