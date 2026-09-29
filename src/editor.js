// Éditeur de lettre : barre des lettres, outils, dessin sur la grille.
import { el } from './svg.js'
import { CHARSET } from './alphabet.js'
import { CELL, layoutGlyph } from './glyph/layout.js'
import { drawItems } from './render.js'
import * as store from './glyph/store.js'

const MARGIN = 1.5 * CELL
const ROLE_TAGS = { extremite: 'E', fut: 'F', angle: 'A', jonction: 'J' }

const TOOLS = [
  { id: 'dessiner', key: 'd', label: 'dessiner', hint: 'cliquer-glisser pour remplir ou vider' },
  { id: 'effacer', key: 'e', label: 'effacer', hint: 'cliquer-glisser pour vider' },
  { id: 'motif', key: 'm', label: 'motif', hint: 'peindre le motif choisi (cliquer un motif à droite)' },
  { id: 'rotation', key: 'r', label: 'rotation', hint: 'clic : +45° · maj+clic : −45°' },
  { id: 'taille', key: 't', label: 'taille', hint: 'glisser : applique la taille choisie · maj : taille normale' },
  { id: 'nettoyer', key: 'n', label: 'nettoyer', hint: 'retirer les réglages de la case' },
]
const DRAG_TOOLS = new Set(['dessiner', 'effacer', 'motif', 'taille', 'nettoyer'])

export function setupEditor({ params, pieces, update, setLettre }) {
  const $ = (s) => document.querySelector(s)
  const svg = $('#editor')
  const grid = $('#grid')
  const marks = $('#marks')
  const state = { tool: 'dessiner', brush: params.motif, taille: 1, roles: false, clipboard: null }

  // ---------- Barre des lettres (+ caractères ajoutés par l'utilisateur) ----------
  const alphabet = $('#alphabet')
  let barKey = ''
  function renderBar() {
    const chars = [...CHARSET, ...store.customChars()]
    const key = chars.join('')
    if (key === barKey) return
    barKey = key
    alphabet.replaceChildren()
    for (const ch of chars) {
      const b = Object.assign(document.createElement('button'), { textContent: ch })
      b.dataset.char = ch
      b.addEventListener('click', () => setLettre(ch))
      alphabet.append(b)
    }
    const add = Object.assign(document.createElement('button'), { textContent: '+ caractère', className: 'add-char', title: 'dessiner un nouveau caractère (n’importe quelle touche du clavier : @ # * § € …)' })
    add.addEventListener('click', () => {
      const answer = prompt('Quel caractère veux-tu dessiner ? (une touche du clavier : @ # * § ( ) + / € …)')
      const ch = [...(answer || '').trim()][0]
      if (!ch) return
      setLettre(store.createChar(ch))
    })
    alphabet.append(add)
  }

  // ---------- Outils ----------
  const tools = $('#tools')
  for (const t of TOOLS) {
    const b = Object.assign(document.createElement('button'), { textContent: t.label, title: `${t.hint} (${t.key.toUpperCase()})` })
    b.dataset.tool = t.id
    b.addEventListener('click', () => setTool(t.id))
    tools.append(b)
  }
  const brush = el('svg', { viewBox: '-55 -55 110 110', class: 'brush' })
  const brushUse = el('use')
  brush.append(brushUse)
  // outil taille : la taille du pinceau
  const sizeBrush = Object.assign(document.createElement('span'), { className: 'size-brush', title: 'taille des cases peintes avec dessiner, motif et taille (×1 = normale)' })
  const sizeRange = Object.assign(document.createElement('input'), { type: 'range', min: 0.2, max: 4, step: 0.05, value: state.taille })
  const sizeValue = document.createElement('b')
  sizeRange.addEventListener('input', () => {
    state.taille = +sizeRange.value
    sizeValue.textContent = `×${state.taille.toFixed(2)}`
  })
  sizeValue.textContent = `×${state.taille.toFixed(2)}`
  sizeBrush.append(sizeRange, sizeValue)
  tools.append(brush, sizeBrush)

  function setTool(id) {
    state.tool = id
    render()
  }

  // ---------- Actions ----------
  const edit = (fn) => {
    store.snapshot(params.lettre)
    store.mutate(params.lettre, fn)
    update()
  }
  const history = (fn) => {
    const c = fn()
    if (c) setLettre(c)
  }
  const ACTIONS = [
    ['↶', 'annuler (⌘Z)', () => history(store.undo)],
    ['↷', 'rétablir (⇧⌘Z)', () => history(store.redo)],
    ['vider', 'vider la grille', () => edit(store.ops.vider)],
    ['inverser', 'inverser pleins et vides', () => edit(store.ops.inverser)],
    ['↔', 'miroir horizontal', () => edit(store.ops.miroirH)],
    ['↕', 'miroir vertical', () => edit(store.ops.miroirV)],
    ['←', 'décaler à gauche (alt+←)', () => edit((g) => store.ops.decaler(g, -1, 0))],
    ['→', 'décaler à droite (alt+→)', () => edit((g) => store.ops.decaler(g, 1, 0))],
    ['↑', 'décaler en haut (alt+↑)', () => edit((g) => store.ops.decaler(g, 0, -1))],
    ['↓', 'décaler en bas (alt+↓)', () => edit((g) => store.ops.decaler(g, 0, 1))],
    ['×2', 'doubler la résolution (chaque case devient 2 × 2)', () => edit(store.ops.doubler)],
    ['copier', 'copier la lettre', () => (state.clipboard = structuredClone(store.getGlyph(params.lettre)))],
    ['coller', 'coller dans la lettre', () => state.clipboard && edit((g) => Object.assign(g, structuredClone(state.clipboard)))],
  ]
  const actions = $('#actions')
  for (const [label, title, fn] of ACTIONS) {
    const b = Object.assign(document.createElement('button'), { textContent: label, title })
    b.addEventListener('click', fn)
    actions.append(b)
  }
  // « original » : on = lettre d'origine affichée (ta version est gardée de côté) ; off = ta version revient
  const originalBtn = Object.assign(document.createElement('button'), { textContent: 'original', title: 'afficher la lettre d’origine ; recliquer remet ta version modifiée' })
  originalBtn.addEventListener('click', () => {
    if (!store.canToggleOriginal(params.lettre)) return
    store.toggleOriginal(params.lettre)
    update()
  })
  // caractère ajouté : on peut le supprimer
  const deleteBtn = Object.assign(document.createElement('button'), { textContent: '✕ supprimer', title: 'supprimer ce caractère ajouté (⌘Z pour annuler)' })
  deleteBtn.addEventListener('click', () => {
    store.resetGlyph(params.lettre)
    setLettre('A')
  })
  actions.append(originalBtn, deleteBtn)

  // Taille de la grille
  const sizeBox = Object.assign(document.createElement('span'), { className: 'size' })
  const sizeInput = (label, axis) => {
    const input = Object.assign(document.createElement('input'), { type: 'number', min: 1, max: 40, title: label })
    input.addEventListener('change', () => {
      const s = store.size(store.getGlyph(params.lettre))
      const n = parseInt(input.value, 10) || 1
      edit((g) => store.ops.redimensionner(g, axis === 'cols' ? n : s.cols, axis === 'rows' ? n : s.rows))
    })
    return input
  }
  const colsInput = sizeInput('largeur (cases)', 'cols')
  const rowsInput = sizeInput('hauteur (cases)', 'rows')
  sizeBox.append(colsInput, '×', rowsInput)
  const rolesToggle = Object.assign(document.createElement('button'), { textContent: 'rôles', title: 'afficher le rôle des cases : E extrémité, F fût, A angle, J jonction' })
  rolesToggle.addEventListener('click', () => {
    state.roles = !state.roles
    render()
  })
  actions.append(sizeBox, rolesToggle)

  // ---------- Dessin à la souris ----------
  let stroke = null

  function cellAt(e) {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(grid.getScreenCTM().inverse())
    const x = Math.floor(pt.x / CELL)
    const y = Math.floor(pt.y / CELL)
    const { cols, rows } = store.size(store.getGlyph(params.lettre))
    return x >= 0 && y >= 0 && x < cols && y < rows ? [x, y] : null
  }

  // taille du pinceau appliquée à une case (×1 = on retire le réglage)
  const withSize = (o, t = state.taille) => ({ ...o, scale: Math.abs(t - 1) < 0.01 ? undefined : +t.toFixed(3) })

  function apply([x, y], e) {
    store.mutate(params.lettre, (g) => {
      switch (state.tool) {
        case 'dessiner':
          store.setOn(g, x, y, stroke.value)
          if (stroke.value) store.patchCell(g, x, y, (o) => withSize(o))
          break
        case 'effacer':
          store.setOn(g, x, y, false)
          break
        case 'motif':
          store.setOn(g, x, y, true)
          store.patchCell(g, x, y, (o) => withSize({ ...o, piece: state.brush }))
          break
        case 'rotation':
          if (!store.isOn(g, x, y)) return
          store.patchCell(g, x, y, (o) => ({ ...o, rot: (((o.rot || 0) + (e.shiftKey ? -45 : 45)) % 360 + 360) % 360 || undefined }))
          break
        case 'taille':
          // une case vide se remplit ; maj : taille normale
          store.setOn(g, x, y, true)
          store.patchCell(g, x, y, (o) => withSize(o, e.shiftKey ? 1 : state.taille))
          break
        case 'nettoyer':
          store.patchCell(g, x, y, () => null)
          break
      }
    })
    update()
  }

  svg.addEventListener('pointerdown', (e) => {
    const c = cellAt(e)
    if (!c) return
    store.snapshot(params.lettre)
    stroke = { key: c.join(), value: !store.isOn(store.getGlyph(params.lettre), ...c) }
    svg.setPointerCapture(e.pointerId)
    apply(c, e)
  })
  svg.addEventListener('pointermove', (e) => {
    if (!stroke || !DRAG_TOOLS.has(state.tool)) return
    const c = cellAt(e)
    if (!c || c.join() === stroke.key) return
    stroke.key = c.join()
    apply(c, e)
  })
  const end = () => (stroke = null)
  svg.addEventListener('pointerup', end)
  svg.addEventListener('pointercancel', end)

  // ---------- Raccourcis clavier ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      history(e.shiftKey ? store.redo : store.undo)
      return
    }
    if (mod) return
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (e.altKey && arrows[e.key]) {
      e.preventDefault()
      edit((g) => store.ops.decaler(g, ...arrows[e.key]))
      return
    }
    const tool = TOOLS.find((t) => t.key === e.key.toLowerCase())
    if (tool && !e.altKey) setTool(tool.id)
  })

  // ---------- Rendu ----------
  function render() {
    const glyph = store.getGlyph(params.lettre)
    const { cols, rows } = store.size(glyph)
    svg.setAttribute('viewBox', `${-MARGIN} ${-MARGIN} ${cols * CELL + 2 * MARGIN} ${rows * CELL + 2 * MARGIN}`)
    svg.classList.toggle('nogrid', !params.grille)

    grid.replaceChildren()
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = el('rect', { x: x * CELL, y: y * CELL, width: CELL, height: CELL, class: 'cell' })
        if (store.isOn(glyph, x, y)) cell.classList.add('on')
        grid.append(cell)
      }
    }
    // ligne de base
    grid.append(el('line', { x1: -CELL / 2, x2: (cols + 0.5) * CELL, y1: rows * CELL, y2: rows * CELL, class: 'baseline' }))

    const items = layoutGlyph(params.lettre, glyph, params, pieces)
    drawItems($('#editor-ink'), items, params)

    // repères : case avec réglages propres (point) et rôles
    marks.replaceChildren()
    for (const key of Object.keys(glyph.cells)) {
      const [x, y] = key.split(',').map(Number)
      if (store.isOn(glyph, x, y)) marks.append(el('circle', { cx: x * CELL + 14, cy: y * CELL + 14, r: 7, class: 'mark' }))
    }
    if (state.roles) {
      for (const it of items) {
        if (it.extra) continue
        const t = el('text', { x: (it.cx + 1) * CELL - 10, y: (it.cy + 1) * CELL - 10, class: 'role-tag' })
        t.textContent = ROLE_TAGS[it.role]
        marks.append(t)
      }
    }

    // barres
    renderBar()
    // alphabet en minuscules : la barre affiche les lettres en minuscules
    const lower = store.getAlphabet().includes('minuscules')
    for (const b of alphabet.querySelectorAll('button[data-char]')) {
      b.textContent = lower ? b.dataset.char.toLowerCase() : b.dataset.char
      b.classList.toggle('current', b.dataset.char === params.lettre)
      b.classList.toggle('edited', store.isEdited(b.dataset.char))
    }
    for (const b of tools.querySelectorAll('button')) b.classList.toggle('current', b.dataset.tool === state.tool)
    brush.style.display = state.tool === 'motif' ? '' : 'none'
    sizeBrush.style.display = ['dessiner', 'motif', 'taille'].includes(state.tool) ? '' : 'none'
    const custom = store.customChars().includes(params.lettre.toUpperCase())
    originalBtn.style.display = custom ? 'none' : ''
    deleteBtn.style.display = custom ? '' : 'none'
    originalBtn.disabled = !store.canToggleOriginal(params.lettre)
    originalBtn.classList.toggle('current', store.showsOriginal(params.lettre))
    originalBtn.textContent = store.showsOriginal(params.lettre) ? 'original : on' : 'original'
    brushUse.setAttribute('href', '#piece-' + state.brush)
    rolesToggle.classList.toggle('current', state.roles)
    if (document.activeElement !== colsInput) colsInput.value = cols
    if (document.activeElement !== rowsInput) rowsInput.value = rows

    const hint = store.showsOriginal(params.lettre)
      ? 'original affiché'
      : TOOLS.find((t) => t.id === state.tool).hint
    $('#editor-label').textContent = `lettre ${lower ? params.lettre.toLowerCase() : params.lettre} · ${cols}×${rows} · ${hint}`
  }

  return {
    render,
    state,
    // un clic dans la bibliothèque choisit le pinceau quand l'outil motif est actif
    pickPiece(id) {
      if (state.tool !== 'motif') return false
      state.brush = id
      render()
      return true
    },
  }
}
