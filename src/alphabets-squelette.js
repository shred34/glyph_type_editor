// Alphabets redessinés à partir du squelette du classique.
// Chaque lettre 5 × 7 est lue comme une suite de traits (verticaux, horizontaux, diagonales),
// puis redessinée sur une grille 2 × plus fine : chaque trait peut avoir sa propre épaisseur,
// s'affiner, se plier, et chaque extrémité sa propre terminaison → lettres asymétriques.
// Le hasard est fixé par lettre : même dessin à chaque chargement.

const S = 2 // finesse : 1 case du classique = 2 cases ici
const P = 2 // marge autour, pour les terminaisons qui débordent

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

// ---------- Lecture du squelette ----------
const FORWARD = [[1, 0], [0, 1], [1, 1], [-1, 1]]
const ALL = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [-1, 1], [1, -1]]

function skeleton(rows) {
  const on = (x, y) => rows[y]?.[x] === '#'
  const linked = (x, y, dx, dy) => on(x, y) && on(x + dx, y + dy) && (!(dx && dy) || (!on(x + dx, y) && !on(x, y + dy)))
  const degree = (x, y) => ALL.filter(([dx, dy]) => linked(x, y, dx, dy)).length
  const strokes = []
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '#') return
      if (!degree(x, y)) strokes.push({ pts: [[x, y]], dx: 0, dy: 0 })
      for (const [dx, dy] of FORWARD) {
        if (!linked(x, y, dx, dy) || linked(x - dx, y - dy, dx, dy)) continue
        const pts = [[x, y]]
        let [cx, cy] = [x, y]
        while (linked(cx, cy, dx, dy)) pts.push([(cx += dx), (cy += dy)])
        strokes.push({ pts, dx, dy })
      }
    }),
  )
  return { strokes, degree }
}

// ---------- Dessin ----------
function canvas(w, h) {
  const W = (w - 1) * S + 1 + 2 * P
  const H = (h - 1) * S + 1 + 2 * P
  const g = Array.from({ length: H }, () => Array(W).fill(false))
  const set = (x, y) => {
    if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = true
  }
  return { g, set, W, H, map: ([x, y]) => [P + x * S, P + y * S] }
}

// Trait de A à B ; thick(u) → [a, b] : épaisseur de chaque côté du trait (u de 0 à 1)
function segment(c, A, B, thick) {
  const [ax, ay] = A
  const [bx, by] = B
  const vx = bx - ax
  const vy = by - ay
  const L = Math.hypot(vx, vy)
  if (L < 0.01) {
    const [a, b] = thick(0)
    const r = Math.max(a, b)
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) c.set(Math.round(ax + x), Math.round(ay + y))
    return
  }
  const [ux, uy] = [vx / L, vy / L]
  const [nx, ny] = [-uy, ux]
  const x0 = Math.floor(Math.min(ax, bx)) - 4
  const x1 = Math.ceil(Math.max(ax, bx)) + 4
  const y0 = Math.floor(Math.min(ay, by)) - 4
  const y1 = Math.ceil(Math.max(ay, by)) + 4
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x - ax
      const py = y - ay
      const u = (px * ux + py * uy) / L
      if (u < -0.02 || u > 1.02) continue
      const s = px * nx + py * ny
      const [a, b] = thick(Math.min(1, Math.max(0, u)))
      if (s >= -a - 0.45 && s <= b + 0.45) c.set(x, y)
    }
  }
}

// épaisseur totale t (en cases) → [côté a, côté b]
const split = (t) => {
  const a = Math.floor((t - 1) / 2)
  return [Math.max(0, a), Math.max(0, t - 1 - a)]
}
const lerp = (a, b, u) => a + (b - a) * u
const add = ([x, y], [dx, dy], k = 1) => [x + dx * k, y + dy * k]

// retire les colonnes vides à gauche et à droite : chaque lettre prend sa largeur naturelle
function toRows(g, keepWidth) {
  let l = 0
  let r = g[0].length - 1
  if (!keepWidth) {
    while (l < r && g.every((row) => !row[l])) l++
    while (r > l && g.every((row) => !row[r])) r--
  }
  return g.map((row) => row.slice(l, r + 1).map((on) => (on ? '#' : '.')).join(''))
}

function derive(base, name, draw) {
  const out = {}
  for (const [ch, rows] of Object.entries(base)) {
    const c = canvas(rows[0].length, rows.length)
    const sk = skeleton(rows)
    draw(c, sk, random(name + ch), ch)
    out[ch] = toRows(c.g, ch === ' ')
  }
  return out
}

// extrémités d'un trait : [point, direction vers l'extérieur] si le point n'a qu'un seul voisin
function ends(st, degree) {
  const res = []
  if (st.pts.length < 2) return res
  const [first, last] = [st.pts[0], st.pts[st.pts.length - 1]]
  if (degree(...first) === 1) res.push({ p: first, out: [-st.dx, -st.dy] })
  if (degree(...last) === 1) res.push({ p: last, out: [st.dx, st.dy] })
  return res
}

// ---------- 1. Plume : épaisseur selon la direction (plume biseautée à 30°) ----------
const PEN = [Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6)]
function plume(c, { strokes, degree }) {
  for (const st of strokes) {
    const L = Math.hypot(st.dx, st.dy) || 1
    const w = Math.abs((st.dx / L) * PEN[1] - (st.dy / L) * PEN[0]) // 0 = parallèle à la plume (fin), 1 = perpendiculaire (épais)
    const t = Math.max(1, Math.round(w * 2.4))
    const A = c.map(st.pts[0])
    const B = c.map(st.pts[st.pts.length - 1])
    segment(c, A, B, () => split(t))
    for (const { p, out } of ends(st, degree)) {
      const q = c.map(p)
      // attaque fine en haut (vers le haut-gauche), sortie fine en bas (vers la droite)
      if (out[1] < 0) segment(c, q, add(q, [-2, -1]), () => [0, 0])
      else if (out[1] > 0) segment(c, q, add(q, [2, 0]), () => [0, 0])
      else if (out[0] > 0) segment(c, q, add(q, [1, 2]), () => [0, 0])
    }
  }
}

// ---------- 2. Terminaisons : chaque extrémité a sa propre fin, diagonales effilées ----------
function terminaisons(c, { strokes, degree }, r) {
  for (const st of strokes) {
    const A = c.map(st.pts[0])
    const B = c.map(st.pts[st.pts.length - 1])
    if (st.dx && st.dy) {
      // diagonale : s'affine d'un bout à l'autre, sens tiré au sort
      const [t0, t1] = r() < 0.5 ? [1, 3.4] : [3.4, 1]
      segment(c, A, B, (u) => split(Math.round(lerp(t0, t1, u))))
    } else {
      segment(c, A, B, () => [0, 1])
    }
    for (const { p, out } of ends(st, degree)) {
      const q = c.map(p)
      const side = r() < 0.5 ? 1 : -1
      const perp = [-out[1] * side, out[0] * side]
      const kind = Math.floor(r() * 5)
      if (kind === 0) segment(c, q, add(add(q, out, 1), perp, 2), () => [0, 0]) // barbe de flèche
      else if (kind === 1) segment(c, add(q, out, 1), add(add(q, out, 1), perp, 2), () => [0, 0]) // crochet
      else if (kind === 2) segment(c, add(q, out, 1), add(q, out, 1), () => [1, 1]) // goutte
      else if (kind === 3) segment(c, q, add(q, out, 2), () => [0, 0]) // prolongement fin
      else {
        // coupe en biais : on retire le coin d'un côté
        const [x, y] = add(add(q, perp, 1), out, 0)
        if (c.g[y]?.[x] !== undefined) c.g[y][x] = false
      }
    }
  }
}

// ---------- 3. Brisé : traits pliés, épaisseurs changeantes, extrémités irrégulières ----------
function brise(c, { strokes, degree }, r) {
  for (const st of strokes) {
    let A = c.map(st.pts[0])
    let B = c.map(st.pts[st.pts.length - 1])
    const dir = [st.dx, st.dy]
    // extrémités libres : un peu plus longues ou plus courtes
    for (const { p, out } of ends(st, degree)) {
      const k = [-1, 1, 2][Math.floor(r() * 3)]
      if (p === st.pts[0]) A = add(A, out, k)
      else B = add(B, out, k)
    }
    const diag = st.dx && st.dy
    const t = diag ? 1 + Math.floor(r() * 3) : 2
    const th = () => split(t)
    if (st.pts.length >= 3) {
      // pli : un point du trait est déplacé d'une case sur le côté
      const f = 0.3 + r() * 0.4
      const side = r() < 0.5 ? 1 : -1
      const M = add([lerp(A[0], B[0], f), lerp(A[1], B[1], f)].map(Math.round), [-dir[1] * side, dir[0] * side], 1)
      segment(c, A, M, th)
      segment(c, M, B, th)
    } else {
      segment(c, A, B, th)
    }
  }
}

export function skeletonAlphabets(base) {
  return {
    'plume 17 lignes': derive(base, 'plume', plume),
    'terminaisons 17 lignes': derive(base, 'terminaisons', terminaisons),
    'brisé 17 lignes': derive(base, 'brise', brise),
  }
}
