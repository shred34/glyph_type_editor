// Déformations du mot entier (réglages « forme → shape ») : elles déplacent les motifs,
// donc la structure des lettres, sans toucher à la forme de chaque motif.
// Appliquées à l'aperçu du mot et aux exports ; l'éditeur de lettre reste sur sa grille.
import { CELL } from './glyph/layout.js'

export const ENSEMBLE_NEUTRE = { hauteur: 1, resserrer: 1, inclinaison: 0, vague: 0, periode: 4, courbe: 0, desordre: 0 }

export const isNeutral = (e) =>
  e.hauteur === 1 && e.resserrer === 1 && e.inclinaison === 0 && e.vague === 0 && e.courbe === 0 && e.desordre === 0

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}
function random(str) {
  let a = hash(str)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

// items : motifs placés (avec it.letter = n° de la lettre) ; boxes : cases des lettres ; H : hauteur du mot (base = H)
// renvoie { items, boxes, bounds: [x, y, largeur, hauteur] }
export function shapeWord(items, boxes, width, H, e, espacement, graine, margin) {
  const k = e.resserrer
  const h = e.hauteur
  const B = H // ligne de base

  // resserrer : chaque lettre rétrécit autour de son centre, et le mot se resserre avec elle
  const starts = []
  let cursor = 0
  for (const b of boxes) {
    starts.push(cursor)
    cursor += b.w * k + espacement * CELL
  }
  const W = Math.max(CELL, cursor - espacement * CELL)
  const avgAdvance = boxes.length ? cursor / boxes.length : 5 * CELL
  const tan = Math.tan(rad(e.inclinaison))

  // désordre : un léger tour et décalage par lettre (même résultat pour une même graine)
  const jitter = boxes.map((_, i) => {
    const r = random(`ensemble|${graine}|${i}`)
    return { a: (r() * 2 - 1) * 15 * e.desordre, dx: (r() * 2 - 1) * 0.5 * CELL * e.desordre, dy: (r() * 2 - 1) * 0.5 * CELL * e.desordre }
  })

  const place = (x0, y0, li) => {
    const b = boxes[li]
    // 1. resserrer (autour de la lettre, base fixe) puis 2. étirer en hauteur (base fixe)
    let x = starts[li] + (x0 - b.x) * k
    let y = B - (B - y0) * k * h
    let rot = 0
    // 3. désordre : rotation + décalage de la lettre autour de son centre
    const j = jitter[li]
    if (e.desordre) {
      const cx = starts[li] + (b.w * k) / 2
      const cy = B - (b.h * k * h) / 2
      const c = Math.cos(rad(j.a))
      const s = Math.sin(rad(j.a))
      const [px, py] = [x - cx, y - cy]
      x = cx + px * c - py * s + j.dx
      y = cy + px * s + py * c + j.dy
      rot += j.a
    }
    // 4. inclinaison (italique) : le haut penche vers la droite
    x += (B - y) * tan
    // 5. vague de la ligne de base (les motifs suivent la pente)
    if (e.vague) {
      const w = (2 * Math.PI) / (e.periode * avgAdvance)
      y += e.vague * CELL * Math.sin(w * x)
      rot += deg(Math.atan(e.vague * CELL * w * Math.cos(w * x)))
    }
    // 6. courbe en arc : le milieu du mot monte (courbe > 0) ou descend (courbe < 0)
    if (e.courbe) {
      const u = (x - W / 2) / (W / 2)
      y -= e.courbe * 2 * CELL * (1 - u * u)
      rot += deg(Math.atan(e.courbe * 2 * CELL * ((2 * u) / (W / 2))))
    }
    return { x, y, rot }
  }

  const out = items.map((it) => {
    const p = place(it.x, it.y, it.letter)
    return { ...it, x: p.x, y: p.y, rot: it.rot + p.rot }
  })

  // zones cliquables des lettres : autour de leurs motifs déformés
  const newBoxes = boxes.map((b, li) => {
    const mine = out.filter((it) => it.letter === li)
    if (!mine.length) {
      const p = place(b.x + b.w / 2, b.y + b.h, li)
      return { ...b, x: p.x - (b.w * k) / 2, y: p.y - b.h * k * h, w: b.w * k, h: b.h * k * h }
    }
    const xs = mine.map((it) => it.x)
    const ys = mine.map((it) => it.y)
    const x0 = Math.min(...xs) - CELL / 2
    const y0 = Math.min(...ys) - CELL / 2
    return { ...b, x: x0, y: y0, w: Math.max(...xs) + CELL / 2 - x0, h: Math.max(...ys) + CELL / 2 - y0 }
  })

  // cadre de l'aperçu : tous les motifs + la ligne de base, avec la marge habituelle
  const xs = [0, W, ...out.map((it) => it.x)]
  const ys = [B, B - H * k * h, ...out.map((it) => it.y)]
  const minX = Math.min(...xs) - margin
  const minY = Math.min(...ys) - margin
  const bounds = [minX, minY, Math.max(...xs) + margin - minX, Math.max(...ys) + margin - minY]
  return { items: out, boxes: newBoxes, bounds }
}
