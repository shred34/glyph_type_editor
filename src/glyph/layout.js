// Transforme une lettre (grille de cases) en liste de motifs placés.
export const CELL = 100
export const ROLES = ['extremite', 'fut', 'angle', 'jonction']

// Voisins : 4 directions droites + 4 diagonales
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]

const angleOf = (dx, dy) => (Math.atan2(dy, dx) * 180) / Math.PI

// Rôle d'une case selon ses liaisons, et l'angle qui aligne le haut du motif sur le trait
function classify(links) {
  if (links.length === 0) return { role: 'extremite', angle: 0 }
  if (links.length === 1) {
    const [dx, dy] = links[0]
    return { role: 'extremite', angle: angleOf(-dx, -dy) + 90 } // pointe vers l'extérieur
  }
  if (links.length === 2) {
    const [[ax, ay], [bx, by]] = links
    if (ax === -bx && ay === -by) {
      const [dx, dy] = ay < 0 || (ay === 0 && ax > 0) ? [ax, ay] : [bx, by]
      return { role: 'fut', angle: angleOf(dx, dy) + 90 }
    }
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    return { role: 'angle', angle: angleOf(-(ax / la + bx / lb), -(ay / la + by / lb)) + 90 }
  }
  return { role: 'jonction', angle: 0 }
}

export function analyse(rows) {
  const on = (x, y) => rows[y]?.[x] === '#'
  const cells = []
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '#') return
      const links = DIRS.filter(([dx, dy]) => {
        if (!on(x + dx, y + dy)) return false
        // une diagonale ne compte que si elle n'est pas déjà reliée par un coin
        return !(dx && dy) || (!on(x + dx, y) && !on(x, y + dy))
      })
      cells.push({ x, y, links, ...classify(links) })
    }),
  )
  return cells
}

// Hasard reproductible : une même lettre donne toujours le même résultat pour une graine
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

function random(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Place un motif sur une case (ou entre deux cases pour la densité)
function place(char, glyph, p, pieces, cell, key, own, sizeFactor) {
  const r = random(hash(`${p.graine}|${char}|${key}`))
  const randomPiece = pieces[Math.floor(r() * pieces.length)].id
  const piece =
    own.piece && pieces.some((pc) => pc.id === own.piece)
      ? own.piece
      : p.mode === 'mono'
        ? p.motif
        : p.mode === 'mix par rôle'
          ? p.roles[cell.role]
          : randomPiece

  const jitter = () => (r() * 2 - 1) * p.chaos
  const rot = (p.orienter ? cell.angle : 0) + p.rotation + jitter() * 45 + (own.rot || 0)
  const flip = p.miroir && r() < 0.5 ? -1 : 1
  const scale = p.taille * sizeFactor * (own.scale || 1)
  return {
    piece,
    role: cell.role,
    x: (cell.x + 0.5) * CELL + jitter() * 30,
    y: (cell.y + 0.5) * CELL + jitter() * 30,
    rot,
    sx: scale * flip,
    sy: scale * p.etirement,
  }
}

// densité 1 = un motif par case ; 2 = + un motif entre chaque paire de cases reliées ; 3 = + deux…
// les motifs rapetissent en proportion pour garder le même « poids » de lettre
export function layoutGlyph(char, glyph, p, pieces) {
  const n = Math.max(1, Math.round(p.densite || 1))
  const sizeFactor = 1 / Math.sqrt(n)
  const items = []
  for (const cell of analyse(glyph.rows)) {
    const own = glyph.cells[`${cell.x},${cell.y}`] || {}
    items.push({ ...place(char, glyph, p, pieces, cell, `${cell.x},${cell.y}`, own, sizeFactor), cx: cell.x, cy: cell.y })
    if (n === 1) continue
    // chaque liaison n'est traitée qu'une fois (vers la droite, ou vers le bas)
    for (const [dx, dy] of cell.links) {
      if (dx < 0 || (dx === 0 && dy < 0)) continue
      for (let j = 1; j < n; j++) {
        const f = j / n
        const mid = { x: cell.x + dx * f, y: cell.y + dy * f, role: 'fut', angle: angleOf(dx, dy) + 90 }
        items.push({ ...place(char, glyph, p, pieces, mid, `${cell.x},${cell.y},${dx},${dy},${j}`, {}, sizeFactor), extra: true })
      }
    }
  }
  return items
}
