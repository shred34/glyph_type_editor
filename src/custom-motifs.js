// Motifs personnels : SVG glissés dans le tool par l'utilisateur.
// Chaque fichier est analysé ; seules les formes pleines sont gardées, nettoyées (sans couleur ni style)
// puis enregistrées dans le navigateur. Elles font donc partie de l'état exporté / importé.
import { NS, el } from './svg.js'

const KEY = 'type-tool:motifs'
const REPORT_KEY = 'type-tool-rapport-import' // sessionStorage : message affiché après le rechargement
const MAX_SIZE = 2 * 1024 * 1024 // 2 Mo par fichier
const SHAPES = 'path, rect, circle, ellipse, polygon, polyline'
const GEOMETRY = { path: ['d'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], polygon: ['points'], polyline: ['points'] }

export function loadCustom() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY)) || []
    return list.filter((m) => m && typeof m.id === 'string' && typeof m.svg === 'string')
  } catch {
    return []
  }
}

// renvoie false si le navigateur n'a plus de place
export function saveCustom(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

export function setReport(lines) {
  try {
    sessionStorage.setItem(REPORT_KEY, JSON.stringify(lines))
  } catch {}
}

export function takeReport() {
  try {
    const lines = JSON.parse(sessionStorage.getItem(REPORT_KEY))
    sessionStorage.removeItem(REPORT_KEY)
    return Array.isArray(lines) ? lines : null
  } catch {
    return null
  }
}

// ---------- Analyse d'un fichier ----------
// → { svg, warnings } si c'est utilisable, sinon { error }
export async function analyzeSvgFile(file) {
  const isSvg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml'
  if (!isSvg) return { error: 'ce n’est pas un fichier SVG (seuls les .svg vectorisés sont acceptés)' }
  if (file.size > MAX_SIZE) return { error: `fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1)} Mo, maximum 2 Mo) — simplifie les tracés` }

  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
  const src = doc.documentElement
  if (doc.querySelector('parsererror') || src.localName !== 'svg') return { error: 'SVG illisible (fichier abîmé ou mal exporté)' }

  // on le place un instant dans la page, invisible, pour lire les styles calculés et les transformations
  // (hors écran et transparent : surtout pas visibility:hidden, qui serait hérité par les formes)
  const box = el('svg', { width: 0, height: 0, style: 'position:absolute;left:-10000px;top:0;opacity:0;pointer-events:none' })
  const root = document.importNode(src, true)
  box.append(root)
  document.body.append(box)
  try {
    const kept = []
    let strokes = 0
    for (const sh of root.querySelectorAll(SHAPES)) {
      if (sh.closest('defs, clipPath, mask, pattern, marker, symbol')) continue
      const cs = getComputedStyle(sh)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
      if (cs.fill === 'none' || cs.fillOpacity === '0') {
        if (cs.stroke !== 'none') strokes++
        continue
      }
      // forme propre : géométrie + position, sans couleur ni style (le tool la recolore)
      const tag = sh.localName
      const clean = document.createElementNS(NS, tag)
      for (const a of GEOMETRY[tag]) if (sh.hasAttribute(a)) clean.setAttribute(a, sh.getAttribute(a))
      const m = sh.getCTM()
      if (m) clean.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(5)).join(' ')})`)
      clean.setAttribute('fill-rule', cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero')
      kept.push(clean)
    }

    // <line> n'a jamais de remplissage : c'est toujours un trait
    strokes += [...root.querySelectorAll('line')].filter((l) => !l.closest('defs, clipPath, mask, pattern, marker, symbol')).length
    const images = root.querySelectorAll('image').length
    const texts = root.querySelectorAll('text').length
    if (!kept.length) {
      if (images) return { error: 'contient une image bitmap, pas des formes vectorielles — vectorise-la d’abord (Illustrator : Objet → Vectorisation de l’image → Décomposer)' }
      if (texts) return { error: 'le texte n’est pas vectorisé — Illustrator : Texte → Vectoriser' }
      if (strokes) return { error: 'uniquement des traits sans remplissage — Illustrator : Objet → Tracé → Vectoriser le contour' }
      return { error: 'aucune forme vectorielle trouvée (fichier vide ?)' }
    }

    // taille réelle des formes gardées
    const g = el('g')
    kept.forEach((k) => g.append(k.cloneNode(true)))
    box.append(g)
    const b = g.getBBox()
    if (!(b.width > 0.01 || b.height > 0.01)) return { error: 'les formes sont vides (taille nulle)' }

    const warnings = []
    if (strokes) warnings.push(`${strokes} trait(s) sans remplissage ignoré(s) — Objet → Tracé → Vectoriser le contour`)
    if (texts) warnings.push('texte non vectorisé ignoré')
    if (images) warnings.push('image bitmap ignorée')
    return { svg: kept.map((k) => k.outerHTML).join(''), warnings }
  } catch {
    return { error: 'SVG impossible à analyser' }
  } finally {
    box.remove()
  }
}

// ---------- Formes → Path2D (pour l'aperçu sur canvas) ----------
function shapeD(sh) {
  const n = (a) => parseFloat(sh.getAttribute(a)) || 0
  switch (sh.localName) {
    case 'path':
      return sh.getAttribute('d') || ''
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')]
      let rx = Math.min(n('rx') || n('ry'), w / 2)
      let ry = Math.min(n('ry') || n('rx'), h / 2)
      if (!rx || !ry) return `M${x} ${y}h${w}v${h}h${-w}z`
      return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${-(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${-(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${rx} ${-ry}z`
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n('cx'), n('cy')]
      const rx = sh.localName === 'circle' ? n('r') : n('rx')
      const ry = sh.localName === 'circle' ? n('r') : n('ry')
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`
    }
    case 'polygon':
    case 'polyline': {
      const pts = (sh.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
      if (pts.length < 4) return ''
      let d = `M${pts[0]} ${pts[1]}`
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`
      return d + 'z'
    }
    default:
      return ''
  }
}

// une entrée par forme : { path2d, rule } (chaque forme garde sa règle de remplissage)
export function shapesToPaths(shapes) {
  return [...shapes].map((sh) => {
    const p = new Path2D()
    const t = sh.transform?.baseVal?.consolidate()?.matrix
    p.addPath(new Path2D(shapeD(sh)), t ? new DOMMatrix([t.a, t.b, t.c, t.d, t.e, t.f]) : undefined)
    return { path2d: p, rule: sh.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero' }
  })
}

export { SHAPES }
