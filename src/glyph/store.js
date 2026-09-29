// Lettres modifiées : grille (rows) + réglages par case (cells), historique annuler / rétablir.
// Une lettre = { rows: ['.###.', …], cells: { 'x,y': { piece, rot, scale } } }
// Chaque alphabet de départ garde ses propres retouches, dans son propre tiroir du navigateur.
import { ALPHABETS as BUILTIN, CHARSET } from '../alphabet.js'

// ---------- Alphabets personnels (créés dans le tool) ----------
// Liste enregistrée dans le navigateur : [{ id, nom, base }]. `base` = dessin de départ
// (vide pour un alphabet vierge, copie pour « copier cet alphabet »). Chaque alphabet perso a un
// identifiant unique : son tiroir ne peut jamais se mélanger avec celui d'un autre alphabet.
const PERSO_KEY = 'type-tool:alphabets-perso'
const PERSO_PREFIX = '✎ '

function loadPerso() {
  try {
    const list = JSON.parse(localStorage.getItem(PERSO_KEY)) || []
    return list.filter((a) => a && typeof a.id === 'string' && typeof a.nom === 'string')
  } catch {
    return []
  }
}

function blankAlphabet() {
  const out = {}
  for (const ch of CHARSET) out[ch] = Array.from({ length: 7 }, () => '.....')
  out[' '] = Array.from({ length: 7 }, () => '...')
  return out
}

const perso = loadPerso()
const persoByName = new Map(perso.map((a) => [PERSO_PREFIX + a.nom, a]))
const ALPHABETS = { ...BUILTIN }
for (const a of perso) ALPHABETS[PERSO_PREFIX + a.nom] = a.base && typeof a.base === 'object' ? a.base : blankAlphabet()

export const ALPHABET_NAMES = Object.keys(ALPHABETS)
export const isPersoAlphabet = (name) => persoByName.has(name)

let current = ALPHABET_NAMES[0]
// le premier alphabet garde l'ancienne clé, pour ne pas perdre les lettres déjà dessinées
// (les alphabets de minuscules ont leur propre tiroir, sinon ils partageraient celui des capitales du même nom)
const keyOf = (name) => {
  if (persoByName.has(name)) return `type-tool:glyphs:perso-${persoByName.get(name).id}`
  if (name === ALPHABET_NAMES[0]) return 'type-tool:glyphs'
  const [first] = name.split(' ')
  return `type-tool:glyphs:${first}${name.includes('minuscules') ? '-minuscules' : ''}`
}
const MAX_SIZE = 40
const up = (c) => c.toUpperCase()
const clone = (g) => structuredClone(g)

// edits : lettres retouchées ; stash : versions retouchées mises de côté par le bouton « original »
let edits = load()
let stash = load(':modifiees')

function load(suffix = '') {
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(current) + suffix)) || {}
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
    if (Object.keys(stash).length) localStorage.setItem(keyOf(current) + ':modifiees', JSON.stringify(stash))
    else localStorage.removeItem(keyOf(current) + ':modifiees')
  } catch {}
}

export const getAlphabet = () => current

export function setAlphabet(name) {
  if (!ALPHABETS[name] || name === current) return
  current = name
  edits = load()
  stash = load(':modifiees')
  undoStack.length = 0
  redoStack.length = 0
}

export function getGlyph(char) {
  const c = up(char)
  const base = ALPHABETS[current]
  if (edits[c]) return edits[c]
  const b = base[c] || base[' ']
  return Array.isArray(b) ? { rows: b, cells: {} } : b
}

export const isEdited = (char) => up(char) in edits

// caractères ajoutés par l'utilisateur (absents de l'alphabet de départ), dans l'ordre de création
export const customChars = () => [...new Set([...Object.keys(edits), ...Object.keys(stash)])].filter((c) => c !== ' ' && !(c in ALPHABETS[current]))

export function createChar(char) {
  const c = up(char)
  if (c in edits || c in ALPHABETS[current]) return c
  snapshot(c)
  const { rows, cols } = size(getGlyph('A'))
  edits[c] = { rows: Array.from({ length: rows }, () => '.'.repeat(cols)), cells: {} }
  save()
  return c
}

// ---------- Bouton « original » (on / off) ----------
// on : la lettre d'origine s'affiche et la version retouchée est mise de côté ; off : la version retouchée revient
export const showsOriginal = (char) => up(char) in stash
export const canToggleOriginal = (char) => up(char) in edits || up(char) in stash

export function toggleOriginal(char) {
  const c = up(char)
  snapshot(c)
  if (c in stash) {
    edits[c] = stash[c]
    delete stash[c]
  } else if (c in edits) {
    stash[c] = edits[c]
    delete edits[c]
  }
  save()
}
export const size = (g) => ({ cols: g.rows[0]?.length || 0, rows: g.rows.length })

// ---------- Historique ----------
const undoStack = []
const redoStack = []

// À appeler avant chaque modification (une fois par geste)
export function snapshot(char) {
  const c = up(char)
  undoStack.push({ c, g: edits[c] && clone(edits[c]), s: stash[c] && clone(stash[c]) })
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
}

function swap(from, to) {
  const e = from.pop()
  if (!e) return null
  to.push({ c: e.c, g: edits[e.c] && clone(edits[e.c]), s: stash[e.c] && clone(stash[e.c]) })
  if (e.g) edits[e.c] = e.g
  else delete edits[e.c]
  if (e.s) stash[e.c] = e.s
  else delete stash[e.c]
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
  delete stash[c] // on retouche la lettre : elle devient la nouvelle version modifiée (⌘Z pour revenir)
  save()
}

export function resetGlyph(char) {
  snapshot(char)
  delete edits[up(char)]
  delete stash[up(char)]
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

// ---------- Créer / supprimer un alphabet personnel ----------
// renvoie le nom affiché du nouvel alphabet, ou { error }
export function createAlphabet(nom, copyCurrent) {
  const clean = (nom || '').trim().slice(0, 40)
  if (!clean) return { error: 'donne un nom à l’alphabet' }
  const name = PERSO_PREFIX + clean
  if (name in ALPHABETS) return { error: `un alphabet « ${clean} » existe déjà` }
  let base = null
  if (copyCurrent) {
    // copie : toutes les lettres telles qu'elles s'affichent (retouches comprises), caractères ajoutés inclus
    base = {}
    for (const c of [...Object.keys(ALPHABETS[current]), ...customChars()]) base[c] = clone(getGlyph(c))
  }
  const list = loadPerso()
  list.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nom: clean, base })
  try {
    localStorage.setItem(PERSO_KEY, JSON.stringify(list))
  } catch {
    return { error: 'plus de place dans le navigateur' }
  }
  return { name }
}

export function deleteAlphabet(name) {
  const a = persoByName.get(name)
  if (!a) return
  try {
    localStorage.setItem(PERSO_KEY, JSON.stringify(loadPerso().filter((x) => x.id !== a.id)))
    localStorage.removeItem(keyOf(name))
    localStorage.removeItem(keyOf(name) + ':modifiees')
  } catch {}
}
