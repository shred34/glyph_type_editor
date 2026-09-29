// Lettres modifiées : grille (rows) + réglages par case (cells), historique annuler / rétablir.
// Une lettre = { rows: ['.###.', …], cells: { 'x,y': { piece, rot, scale } } }
// Chaque alphabet de départ garde ses propres retouches.
import { ALPHABETS } from '../alphabet.js'

export const ALPHABET_NAMES = Object.keys(ALPHABETS)
let current = ALPHABET_NAMES[0]
// le premier alphabet garde l'ancienne clé, pour ne pas perdre les lettres déjà dessinées
// (les alphabets de minuscules ont leur propre tiroir, sinon ils partageraient celui des capitales du même nom)
const keyOf = (name) => {
  if (name === ALPHABET_NAMES[0]) return 'type-tool:glyphs'
  const [first] = name.split(' ')
  return `type-tool:glyphs:${first}${name.includes('minuscules') ? '-minuscules' : ''}`
}
const MAX_SIZE = 40
const up = (c) => c.toUpperCase()
const clone = (g) => structuredClone(g)

let edits = load()

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(current))) || {}
    // ancien format : simple liste de lignes
    for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) raw[k] = { rows: v, cells: {} }
    return raw
  } catch {
    return {}
  }
}

function save() {
  try {
    localStorage.setItem(keyOf(current), JSON.stringify(edits))
  } catch {}
}

export const getAlphabet = () => current

export function setAlphabet(name) {
  if (!ALPHABETS[name] || name === current) return
  current = name
  edits = load()
  undoStack.length = 0
  redoStack.length = 0
}

export function getGlyph(char) {
  const c = up(char)
  const base = ALPHABETS[current]
  return edits[c] || { rows: base[c] || base[' '], cells: {} }
}

export const isEdited = (char) => up(char) in edits
export const size = (g) => ({ cols: g.rows[0]?.length || 0, rows: g.rows.length })

// ---------- Historique ----------
const undoStack = []
const redoStack = []

// À appeler avant chaque modification (une fois par geste)
export function snapshot(char) {
  const c = up(char)
  undoStack.push({ c, g: edits[c] && clone(edits[c]) })
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
}

function swap(from, to) {
  const e = from.pop()
  if (!e) return null
  to.push({ c: e.c, g: edits[e.c] && clone(edits[e.c]) })
  if (e.g) edits[e.c] = e.g
  else delete edits[e.c]
  save()
  return e.c
}

export const undo = () => swap(undoStack, redoStack)
export const redo = () => swap(redoStack, undoStack)

export function mutate(char, fn) {
  const c = up(char)
  const g = clone(getGlyph(c))
  fn(g)
  edits[c] = g
  save()
}

export function resetGlyph(char) {
  snapshot(char)
  delete edits[up(char)]
  save()
}

// ---------- Opérations sur une lettre ----------
export const isOn = (g, x, y) => g.rows[y]?.[x] === '#'

export function setOn(g, x, y, on) {
  const row = [...g.rows[y]]
  row[x] = on ? '#' : '.'
  g.rows[y] = row.join('')
  if (!on) delete g.cells[`${x},${y}`]
}

// fn reçoit une copie des réglages de la case et renvoie les nouveaux (null = effacer)
export function patchCell(g, x, y, fn) {
  const k = `${x},${y}`
  const o = Object.fromEntries(Object.entries(fn({ ...g.cells[k] }) || {}).filter(([, v]) => v !== undefined))
  if (Object.keys(o).length) g.cells[k] = o
  else delete g.cells[k]
}

// Reconstruit la grille : source(x, y) donne la case d'origine de chaque nouvelle case
function rebuild(g, cols, rows, source) {
  const next = { rows: [], cells: {} }
  for (let y = 0; y < rows; y++) {
    let row = ''
    for (let x = 0; x < cols; x++) {
      const s = source(x, y)
      const on = s && isOn(g, s[0], s[1])
      row += on ? '#' : '.'
      const o = on && g.cells[`${s[0]},${s[1]}`]
      if (o) next.cells[`${x},${y}`] = { ...o }
    }
    next.rows.push(row)
  }
  g.rows = next.rows
  g.cells = next.cells
}

const clamp = (n) => Math.max(1, Math.min(MAX_SIZE, n))

export const ops = {
  vider(g) {
    const { cols, rows } = size(g)
    rebuild(g, cols, rows, () => null)
  },
  inverser(g) {
    g.rows = g.rows.map((r) => [...r].map((c) => (c === '#' ? '.' : '#')).join(''))
    g.cells = {}
  },
  miroirH(g) {
    const { cols, rows } = size(g)
    rebuild(g, cols, rows, (x, y) => [cols - 1 - x, y])
  },
  miroirV(g) {
    const { cols, rows } = size(g)
    rebuild(g, cols, rows, (x, y) => [x, rows - 1 - y])
  },
  decaler(g, dx, dy) {
    const { cols, rows } = size(g)
    rebuild(g, cols, rows, (x, y) => [x - dx, y - dy])
  },
  doubler(g) {
    const { cols, rows } = size(g)
    if (cols * 2 > MAX_SIZE || rows * 2 > MAX_SIZE) return
    rebuild(g, cols * 2, rows * 2, (x, y) => [x >> 1, y >> 1])
  },
  // le coin bas-gauche reste fixe : la ligne de base ne bouge pas
  redimensionner(g, cols, rows) {
    const s = size(g)
    const c = clamp(cols)
    const r = clamp(rows)
    rebuild(g, c, r, (x, y) => [x, y - (r - s.rows)])
  },
}
