import GUI from 'lil-gui'
import './style.css'
import { el } from './svg.js'
import { loadPieces, CUSTOM_COLLECTION } from './pieces.js'
import { analyzeSvgFile, loadCustom, saveCustom, setReport, takeReport } from './custom-motifs.js'
import { ALPHABET_NAMES, getGlyph, setAlphabet, size } from './glyph/store.js'
import { CELL, ROLES, layoutGlyph } from './glyph/layout.js'
import { RENDUS, drawItems } from './render.js'
import { setupEditor } from './editor.js'
import { SENS, EFFETS, PRESETS, PRESET_DESC, CYCLE_DEFAUT, defaultAnim, resetEffects, isActive, frameParams, animateItems, cycleDuration } from './anim.js'
import { createCanvasRenderer } from './canvas-render.js'
import { buildSVG, download } from './export/svg.js'
import { exportPNG, exportFrames } from './export/png.js'
import { mergeInto, loadSaved, saveSettings, clearSettings, fullState, applyState, readStateFile, wipeEverything } from './state.js'

const MARGIN = 1.5 * CELL // place pour les motifs qui débordent de la grille
const ROLE_NAMES = { extremite: 'extrémités', fut: 'fûts', angle: 'angles', jonction: 'jonctions' }

const $ = (s) => document.querySelector(s)
const defsHost = $('#defs')
const preview = $('#preview')

const pieces = await loadPieces(defsHost)
const ids = pieces.map((p) => p.id)
const labelOf = Object.fromEntries(pieces.map((p) => [p.id, p.label]))
const pick = (id) => (ids.includes(id) ? id : ids[0])

// ---------- État par défaut (celui du Spring Workshop) ----------
// Au chargement, on repart de ces valeurs, puis on applique ce que le navigateur a enregistré
// automatiquement. « réinitialiser les réglages » revient à ces valeurs.
const T29 = pick('taches29')
const params = {
  alphabet: ALPHABET_NAMES.includes('signature 7 lignes') ? 'signature 7 lignes' : ALPHABET_NAMES[0],
  texte: 'GLYPH & TYPE EDITOR',
  lettre: 'A',
  espacement: 1.5,

  mode: 'mix par rôle',
  motif: pick('95-design-syndrome-necronomicon'),
  roles: { extremite: T29, fut: T29, angle: T29, jonction: T29 },

  taille: 2.85,
  densite: 3,
  etirement: 1.75,
  orienter: true,
  rotation: 0,
  miroir: true,
  chaos: 0.1,
  graine: 1,

  rendu: 'halo',
  epaisseur: 2.5,
  encre: '#ffffff',
  contour: '#000000',
  fond: '#ffffff',
  grille: true,
}

const anim = defaultAnim()
const exportOpts = { largeur: 1920, transparent: true }

// Quand l'état par défaut change, on incrémente cette version : les réglages enregistrés avec une
// ancienne version sont ignorés (les lettres retouchées et les favoris, eux, sont toujours gardés).
const DEFAULTS_VERSION = 4
const saved = loadSaved()
if (saved && (saved.defaultsVersion === DEFAULTS_VERSION || saved.importe)) {
  mergeInto(params, saved.params)
  mergeInto(anim, saved.anim)
  mergeInto(exportOpts, saved.exportOpts)
}
anim.lecture = false
anim.image = 0
if (!ALPHABET_NAMES.includes(params.alphabet)) params.alphabet = ALPHABET_NAMES[0]
if (!ids.includes(params.motif)) params.motif = ids[0]
for (const r of Object.keys(params.roles)) if (!ids.includes(params.roles[r])) params.roles[r] = ids[0]
// liste du cycle : vide → liste par défaut ; on retire les motifs qui n'existent plus
if (!anim.cycle.liste.length) anim.cycle.liste = [...CYCLE_DEFAUT]
anim.cycle.liste = anim.cycle.liste.filter((id) => ids.includes(id))
setAlphabet(params.alphabet)

const settings = () => ({ defaultsVersion: DEFAULTS_VERSION, params, anim: { ...anim, lecture: false }, exportOpts })

// ---------- Message d'aide sous l'aperçu ----------
let statusTimer
function say(text, sticky = false) {
  $('#status').textContent = text
  clearTimeout(statusTimer)
  if (!sticky) statusTimer = setTimeout(() => ($('#status').textContent = ''), 9000)
}

// ---------- Aperçu du mot ----------
// Les lettres peuvent avoir des grilles de tailles différentes : on les aligne sur la ligne de base.
function wordLayout(p) {
  const chars = [...p.texte]
  const glyphs = chars.map((ch) => getGlyph(ch))
  const height = Math.max(1, ...glyphs.map((g) => size(g).rows))
  const items = []
  const boxes = []
  let x = 0
  chars.forEach((ch, i) => {
    const g = glyphs[i]
    const s = size(g)
    const dy = (height - s.rows) * CELL
    const li = chars.length > 1 ? i / (chars.length - 1) : 0
    for (const it of layoutGlyph(ch.toUpperCase(), g, p, pieces)) items.push({ ...it, x: it.x + x, y: it.y + dy, li })
    boxes.push({ ch, x, y: dy, w: s.cols * CELL, h: s.rows * CELL })
    x += (s.cols + p.espacement) * CELL
  })
  const width = Math.max(CELL, x - p.espacement * CELL)
  items.forEach((it, idx) => Object.assign(it, { idx, nx: it.x / width, ny: it.y / (height * CELL) }))
  return { items, boxes, width, height: height * CELL }
}

// La mise en page du mot ne change que si les réglages changent : on la garde en mémoire entre les images
let layoutVersion = 0
let layoutCache = { version: -1 }
const renderer = createCanvasRenderer($('#preview-canvas'), pieces)
// la taille de l'aperçu change (fenêtre redimensionnée…) : on redessine
new ResizeObserver(() => !exporting && renderPreview()).observe($('#preview-canvas'))

function currentLayout(p) {
  if (p !== params) return wordLayout(p) // bouillonnement « motifs aussi » : la graine change à chaque pas
  if (layoutCache.version !== layoutVersion) layoutCache = { version: layoutVersion, ...wordLayout(p) }
  return layoutCache
}

let hitsKey = ''
function renderHits(boxes, viewBox) {
  const key = JSON.stringify([boxes, params.lettre])
  if (key === hitsKey) return
  hitsKey = key
  preview.setAttribute('viewBox', viewBox.join(' '))
  const hits = $('#hits')
  hits.replaceChildren()
  for (const b of boxes) {
    const hit = el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, class: 'hit' })
    if (b.ch.toUpperCase() === params.lettre) hit.classList.add('current')
    hit.addEventListener('click', () => b.ch.trim() && setLettre(b.ch))
    hits.append(hit)
  }
}

// Arrêt (■) : l'aperçu montre le mot tel qu'il est réglé, sans aucun effet d'animation.
// Lecture ou pause : il montre l'image `frame` de l'animation.
let stopped = true

function frameState(frame, animated = !stopped) {
  const p = animated ? frameParams(params, anim, frame) : params
  const { items, boxes, width, height } = currentLayout(p)
  const viewBox = [-MARGIN, -MARGIN, width + 2 * MARGIN, height + 2 * MARGIN]
  return { p, items: animated ? animateItems(items, anim, frame) : items, boxes, viewBox }
}

// aperçu à l'écran : canvas
function renderPreview(frame = anim.image) {
  const { p, items, boxes, viewBox } = frameState(frame)
  renderHits(boxes, viewBox)
  renderer.draw(items, p, viewBox)
  renderTransport()
}

// exports : on dessine l'image en SVG (vrai vecteur), on la lit, puis on vide
function previewSVG(frame, meta, animated = !stopped) {
  const { p, items, viewBox } = frameState(frame, animated)
  preview.setAttribute('viewBox', viewBox.join(' '))
  drawItems($('#preview-ink'), items, p)
  const svg = buildSVG(preview, defsHost, fond(), meta)
  $('#preview-ink').replaceChildren()
  return svg
}

// ---------- Barre de lecture ----------
const playBtn = $('#play')
const scrub = $('#scrub')

function renderTransport() {
  playBtn.textContent = anim.lecture ? '❚❚ pause' : '▶ lecture'
  playBtn.classList.toggle('current', anim.lecture)
  stopBtn.classList.toggle('current', stopped)
  scrub.max = anim.images - 1
  scrub.value = anim.image
  $('#frame-info').textContent = stopped
    ? `aperçu fixe · boucle ${(anim.images / anim.ips).toFixed(1)} s`
    : `${anim.image + 1}/${anim.images} · ${(anim.images / anim.ips).toFixed(1)} s`
}

function play() {
  anim.lecture = true
  stopped = false
  renderPreview()
}

function stop() {
  anim.lecture = false
  anim.image = 0
  stopped = true
  renderPreview()
}



function togglePlay() {
  if (anim.lecture) {
    anim.lecture = false // pause : on reste sur l'image en cours
    renderTransport()
    return
  }
  if (!isActive(anim)) say('aucun effet actif : choisis un préréglage ou coche un effet dans « animation »')
  play()
}

const stopBtn = $('#stop')
playBtn.addEventListener('click', () => {
  togglePlay()
  playBtn.blur()
})
stopBtn.addEventListener('click', () => {
  stop()
  stopBtn.blur()
})
scrub.addEventListener('input', () => {
  anim.image = +scrub.value
  anim.lecture = false
  stopped = false // on inspecte une image de l'animation
  renderPreview()
})
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return
  if (e.key === ' ') {
    e.preventDefault()
    togglePlay()
  } else if (e.key === 'Escape') {
    stop()
  }
})

// ---------- Éditeur ----------
const editor = setupEditor({ params, pieces, update: () => update(), setLettre: (ch) => setLettre(ch) })

// ---------- Bibliothèque de motifs ----------
// mode « motif » : un clic choisit le motif principal (ou le pinceau si l'outil motif est actif)
// mode « cycle » : un clic ajoute / retire le motif de la liste du cycle
const library = $('#library')
let libraryMode = 'motif'
library.append(Object.assign(document.createElement('span'), { className: 'label', textContent: 'motifs' }))
const modeBar = Object.assign(document.createElement('div'), { className: 'library-mode' })
modeBar.append('clic : ')
for (const [mode, label] of [['motif', 'choisir le motif'], ['cycle', 'liste du cycle']]) {
  const b = Object.assign(document.createElement('button'), { textContent: label })
  b.dataset.mode = mode
  b.addEventListener('click', () => setLibraryMode(mode))
  modeBar.append(b)
}
const clearCycle = Object.assign(document.createElement('button'), { textContent: 'vider', title: 'vider la liste du cycle' })
clearCycle.addEventListener('click', () => {
  anim.cycle.liste = []
  update()
})
modeBar.append(clearCycle)
library.append(modeBar)

function setLibraryMode(mode) {
  libraryMode = mode
  if (mode === 'cycle') say('clique les motifs à faire défiler, dans l’ordre voulu (les numéros donnent l’ordre)')
  renderLibrary()
}

let collection = null
function sectionTitle(name) {
  const h = Object.assign(document.createElement('h2'), { textContent: name })
  library.append(h)
  return h
}
let customTitle = null
for (const p of pieces) {
  if (p.collection !== collection) {
    collection = p.collection
    const h = sectionTitle(collection)
    if (collection === CUSTOM_COLLECTION) customTitle = h
  }
  const thumb = el('svg', { viewBox: '-55 -55 110 110' })
  thumb.append(el('use', { href: '#piece-' + p.id }))
  const item = document.createElement('button')
  item.className = 'piece'
  item.title = p.nom ? `${p.label} · ${p.nom}` : p.label
  item.dataset.id = p.id
  item.append(thumb, p.label, Object.assign(document.createElement('i'), { className: 'badge' }))
  if (p.collection === CUSTOM_COLLECTION) {
    // ✕ : retirer ce motif personnel
    const remove = Object.assign(document.createElement('span'), { className: 'remove', textContent: '✕', title: 'retirer ce motif' })
    remove.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!confirm(`Retirer le motif ${p.label} (${p.nom}) ?`)) return
      saveCustom(loadCustom().filter((m) => m.id !== p.id))
      setReport([`motif ${p.label} (${p.nom}) retiré`])
      saveSettings(settings())
      location.reload()
    })
    item.append(remove)
  }
  item.addEventListener('click', () => {
    if (libraryMode === 'cycle') {
      const list = anim.cycle.liste
      const i = list.indexOf(p.id)
      if (i >= 0) list.splice(i, 1)
      else list.push(p.id)
      if (!anim.cycle.actif && list.length >= 2) {
        anim.cycle.actif = true
        refreshGui()
        say('cycle activé : lance la lecture pour voir les motifs défiler')
      }
      return update()
    }
    if (editor.pickPiece(p.id)) return renderLibrary()
    params.motif = p.id
    params.mode = 'mono'
    refreshGui()
    update()
  })
  library.append(item)
}

// ---------- Motifs personnels : ajout de SVG ----------
if (!customTitle) customTitle = sectionTitle(CUSTOM_COLLECTION)
const addFiles = Object.assign(document.createElement('input'), { type: 'file', accept: '.svg,image/svg+xml', multiple: true })
addFiles.addEventListener('change', () => {
  importFiles(addFiles.files)
  addFiles.value = ''
})
const customTools = Object.assign(document.createElement('div'), { className: 'custom-tools' })
const addBtn = Object.assign(document.createElement('button'), { textContent: '+ ajouter des SVG', title: 'formes pleines vectorisées, une couleur' })
addBtn.addEventListener('click', () => addFiles.click())
customTools.append(addBtn, ' ou glisse des .svg n’importe où sur la page')
library.append(customTools)

// message d'import, en haut de la bibliothèque (reste affiché jusqu'à ce qu'on le ferme)
const notice = Object.assign(document.createElement('div'), { className: 'library-notice', hidden: true })
modeBar.after(notice)
function showNotice(lines) {
  notice.replaceChildren()
  const close = Object.assign(document.createElement('button'), { textContent: '✕', title: 'fermer' })
  close.addEventListener('click', () => (notice.hidden = true))
  notice.append(close, ...lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })))
  notice.hidden = false
  library.scrollTop = 0
}

async function importFiles(fileList) {
  const files = [...fileList]
  if (!files.length) return
  const list = loadCustom()
  const lines = []
  let added = 0
  for (const f of files) {
    const r = await analyzeSvgFile(f)
    if (r.error) {
      lines.push(`✕ ${f.name} : ${r.error}`)
      continue
    }
    list.push({ id: `perso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, nom: f.name, svg: r.svg })
    added++
    lines.push(`✓ ${f.name} → M${list.length}${r.warnings.length ? ` (⚠ ${r.warnings.join(' ; ')})` : ''}`)
  }
  if (!added) return showNotice(lines)
  if (!saveCustom(list)) {
    return showNotice([...lines.filter((l) => l.startsWith('✕')), '✕ plus de place dans le navigateur : retire des motifs ou utilise des fichiers plus légers'])
  }
  // on recharge pour que les nouveaux motifs soient partout (menus, bibliothèque…) ; les réglages sont gardés
  setReport(lines)
  saveSettings(settings())
  location.reload()
}

// glisser-déposer n'importe où sur la page
let dragDepth = 0
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return
  dragDepth++
  library.classList.add('dropping')
})
document.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) library.classList.remove('dropping')
})
document.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault())
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  library.classList.remove('dropping')
  importFiles(e.dataTransfer.files)
})

// rapport de l'import précédent (affiché après le rechargement)
const report = takeReport()
if (report) {
  showNotice(report)
  requestAnimationFrame(() => customTitle.scrollIntoView({ block: 'start' }))
}

function renderLibrary() {
  const cycle = libraryMode === 'cycle'
  const used = cycle
    ? []
    : editor.state.tool === 'motif'
      ? [editor.state.brush]
      : params.mode === 'mono'
        ? [params.motif]
        : params.mode === 'mix par rôle'
          ? Object.values(params.roles)
          : []
  const set = new Set(used)
  for (const item of library.querySelectorAll('.piece')) {
    const n = anim.cycle.liste.indexOf(item.dataset.id)
    item.classList.toggle('active', set.has(item.dataset.id) || (cycle && n >= 0))
    item.querySelector('.badge').textContent = n >= 0 ? n + 1 : ''
  }
  for (const b of modeBar.querySelectorAll('button[data-mode]')) b.classList.toggle('current', b.dataset.mode === libraryMode)
  clearCycle.style.display = cycle ? '' : 'none'
  library.classList.toggle('cycle-mode', cycle)
}

// ---------- Réglages ----------
const gui = new GUI({ container: $('#gui'), title: 'réglages' })
const options = Object.fromEntries(pieces.map((p) => [p.label, p.id]))
const help = (c, text) => {
  c.domElement.title = text
  return c
}

const fTexte = gui.addFolder('texte')
help(fTexte.add(params, 'alphabet', ALPHABET_NAMES), 'dessin de départ des lettres — tes retouches sont gardées séparément pour chaque alphabet').onChange((name) => setAlphabet(name))
fTexte.add(params, 'texte').name('mot')
fTexte.add(params, 'espacement', -3, 8, 0.1)

const fMotifs = gui.addFolder('motifs')
fMotifs.add(params, 'mode', ['mono', 'mix par rôle', 'mix aléatoire'])
const cMotif = fMotifs.add(params, 'motif', options)
const cRoles = ROLES.map((r) => fMotifs.add(params.roles, r, options).name(ROLE_NAMES[r]))
// Tirages — mix par rôle : les 4 motifs ; mix aléatoire : la graine.
// Chaque mode a son historique (précédent / suivant) et ses favoris enregistrés.
const sameRoles = (a, b) => ROLES.every((r) => a[r] === b[r])
const rolesLabel = (roles) => ROLES.map((r) => labelOf[roles[r]] || '?').join(' · ')
const DRAWS = {
  'mix par rôle': {
    key: 'type-tool:favoris-roles',
    tirer: '🎲 tirer les rôles',
    get: () => ({ ...params.roles }),
    set: (v) => Object.assign(params.roles, v),
    same: sameRoles,
    random: () => {
      for (const r of ROLES) params.roles[r] = ids[Math.floor(Math.random() * ids.length)]
    },
    label: rolesLabel,
    valid: (f) => ROLES.every((r) => ids.includes(f[r])),
  },
  'mix aléatoire': {
    key: 'type-tool:favoris-aleatoire',
    tirer: '🎲 nouveau tirage',
    get: () => ({ graine: params.graine }),
    set: (v) => (params.graine = v.graine),
    same: (a, b) => a.graine === b.graine,
    random: () => (params.graine = 1 + Math.floor(Math.random() * 9999)),
    label: (v) => `graine ${v.graine}`,
    valid: (f) => Number.isInteger(f.graine),
  },
}
for (const d of Object.values(DRAWS)) {
  d.history = [d.get()]
  d.index = 0
  d.favorites = []
  try {
    d.favorites = (JSON.parse(localStorage.getItem(d.key)) || []).filter(d.valid)
  } catch {}
}
const currentDraw = () => DRAWS[params.mode]

function record(d) {
  const cur = d.get()
  if (d.same(d.history[d.index], cur)) return
  d.history.splice(d.index + 1)
  d.history.push(cur)
  if (d.history.length > 100) d.history.shift()
  d.index = d.history.length - 1
}

function applyDraw(d, v) {
  d.set(v)
  refreshGui()
}

const cTirer = fMotifs
  .add({ tirer: () => {
    const d = currentDraw()
    d.random()
    record(d)
    refreshGui()
  } }, 'tirer')
  .name('🎲 tirer')
const cPrev = fMotifs
  .add({ prev: () => {
    const d = currentDraw()
    if (d.index > 0) applyDraw(d, d.history[--d.index])
  } }, 'prev')
  .name('← tirage précédent')
const cNext = fMotifs
  .add({ next: () => {
    const d = currentDraw()
    if (d.index < d.history.length - 1) applyDraw(d, d.history[++d.index])
  } }, 'next')
  .name('→ tirage suivant')
const cFav = fMotifs
  .add({ fav: () => {
    const d = currentDraw()
    const cur = d.get()
    const i = d.favorites.findIndex((f) => d.same(f, cur))
    if (i >= 0) d.favorites.splice(i, 1)
    else d.favorites.push(cur)
    saveFavorites(d)
    say(i >= 0 ? 'retiré des favoris' : `ajouté aux favoris : ${d.label(cur)}`)
  } }, 'fav')
  .name('☆ garder en favori')

// un bouton par favori du mode en cours (clic = l'appliquer)
const fFavoris = fMotifs.addFolder('favoris')
let favoritesShown = null
function saveFavorites(d) {
  try {
    localStorage.setItem(d.key, JSON.stringify(d.favorites))
  } catch {}
  renderFavorites()
  update()
}
function renderFavorites() {
  const d = currentDraw()
  favoritesShown = d
  for (const c of [...fFavoris.controllers]) c.destroy()
  if (!d) return
  if (!d.favorites.length) fFavoris.add({ vide: () => {} }, 'vide').name('aucun favori pour l’instant').disable()
  d.favorites.forEach((f, i) => {
    fFavoris
      .add({ go: () => {
        applyDraw(d, f)
        record(d)
      } }, 'go')
      .name(`★ ${i + 1} · ${d.label(f)}`)
  })
}
renderFavorites()

const fForme = gui.addFolder('forme')
fForme.add(params, 'taille', 0.1, 6, 0.05).name('taille du motif')
help(fForme.add(params, 'densite', 1, 3, 1).name('densité'), '1 = un motif par case · 2 = deux fois plus de motifs, plus petits · 3 = trois fois plus')
fForme.add(params, 'etirement', 0.1, 6, 0.05).name('étirement')
fForme.add(params, 'orienter').name('suivre le trait')
fForme.add(params, 'rotation', -180, 180, 1)
fForme.add(params, 'miroir').name('miroir aléatoire')
fForme.add(params, 'chaos', 0, 3, 0.01)
fForme.add(params, 'graine', 1, 9999, 1)
fForme
  .add({ graine: () => {
    params.graine = 1 + Math.floor(Math.random() * 9999)
    record(DRAWS['mix aléatoire'])
    refreshGui()
  } }, 'graine')
  .name('🎲 nouvelle graine')

const fRendu = gui.addFolder('rendu')
fRendu.add(params, 'rendu', RENDUS)
const cEpaisseur = fRendu.add(params, 'epaisseur', 0, 60, 0.5).name('épaisseur contour')
fRendu.addColor(params, 'encre')
const cContour = fRendu.addColor(params, 'contour').name('couleur contour')
fRendu.addColor(params, 'fond')
fRendu.add(params, 'grille')

// ---------- Animation ----------
const fAnim = gui.addFolder('animation')
const presetState = { preset: '—' }
const cPreset = fAnim
  .add(presetState, 'preset', ['—', ...Object.keys(PRESETS)])
  .name('préréglage')
  .onChange((name) => {
    if (!PRESETS[name]) return
    resetEffects(anim)
    PRESETS[name](anim)
    if (anim.cycle.actif && anim.cycle.liste.length < 2) {
      // liste de départ : S20 → S18 → 53 → T7 (du plus maigre au plus épais)
      anim.cycle.liste = CYCLE_DEFAUT.filter((id) => ids.includes(id))
    }
    anim.image = 0
    play()
    say(`${name} : ${PRESET_DESC[name]}`)
    refreshGui()
  })
help(cPreset, 'choisir une combinaison d’effets toute prête (remplace les effets actuels)')
fAnim
  .add({ off: () => {
    resetEffects(anim)
    presetState.preset = '—'
    stop()
    say('tous les effets sont désactivés')
    refreshGui()
    update()
  } }, 'off')
  .name('✕ tout désactiver')
const cImages = help(fAnim.add(anim, 'images', 4, 480, 1).name('images / boucle'), 'nombre d’images de la boucle (calculé tout seul quand le cycle est actif)')
help(fAnim.add(anim, 'ips', 1, 60, 1).name('images / seconde'), '12 = saccadé façon stop motion · 24–30 = fluide')
help(fAnim.add(anim, 'sens', SENS).name('sens du décalage'), 'dans quel ordre les motifs réagissent quand un effet a du décalage')

// un dossier par effet, avec sa case « actif » en premier
const effectFolders = {}
function effect(key, title, build) {
  const f = fAnim.addFolder(title)
  f.close()
  help(f.add(anim[key], 'actif').name('actif'), EFFETS[key])
  build(f, anim[key])
  f.domElement.title = EFFETS[key]
  effectFolders[key] = { f, title }
}
effect('flottement', 'flottement', (f, o) => {
  f.add(o, 'amplitude', 0, 200, 1)
  help(f.add(o, 'vitesse', 1, 8, 1), 'nombre d’allers-retours par boucle (entier = boucle parfaite)')
})
effect('balancement', 'balancement', (f, o) => {
  f.add(o, 'amplitude', 0, 180, 1).name('amplitude (°)')
  help(f.add(o, 'vitesse', 1, 8, 1), 'nombre d’oscillations par boucle')
  help(f.add(o, 'decalage', 0, 3, 0.05).name('décalage'), '0 = tous ensemble · 1 = la vague traverse le mot une fois')
})
effect('rotation', 'rotation', (f, o) => {
  help(f.add(o, 'tours', -8, 8, 1).name('tours / boucle'), 'négatif = sens inverse')
  help(f.add(o, 'style', ['à-coups', 'continu']), 'à-coups : tour rapide puis pause · continu : vitesse constante')
  help(f.add(o, 'decalage', 0, 3, 0.05).name('décalage'), 'avec « à-coups », les motifs partent l’un après l’autre')
})
effect('pulsation', 'pulsation', (f, o) => {
  help(f.add(o, 'amplitude', 0, 3, 0.01), '> 1 : les motifs disparaissent un instant')
  f.add(o, 'vitesse', 1, 8, 1)
  f.add(o, 'decalage', 0, 3, 0.05).name('décalage')
})
effect('bouillonnement', 'bouillonnement', (f, o) => {
  help(f.add(o, 'pas', 1, 12, 1).name('toutes les n images'), '1 = change à chaque image · 3 = plus lent')
  f.add(o, 'force', 0, 6, 0.05)
  help(f.add(o, 'motifs').name('motifs aussi'), 'retire aussi au sort les miroirs et (en mix aléatoire) les motifs')
})
effect('apparition', 'apparition', (f, o) => {
  help(f.add(o, 'maintien', 0, 0.9, 0.01), 'part de la boucle où tout reste affiché')
  help(f.add(o, 'douceur', 0, 1, 0.01), '0 = apparition sèche · 1 = grossit lentement')
})
let cOrdre
effect('cycle', 'cycle des motifs', (f, o) => {
  cOrdre = f.add({ ordre: '' }, 'ordre').name('ordre').disable()
  f.add({ choisir: () => setLibraryMode('cycle') }, 'choisir').name('choisir les motifs →')
  help(f.add(o, 'vague', 0.2, 6, 0.1).name('durée d’une vague (s)'), 'temps que met un motif à traverser tout le mot')
  help(f.add(o, 'pause', -3, 3, 0.1).name('pause entre les vagues (s)'), '0 = la vague suivante part quand la précédente arrive au bout · négatif = elle part avant (les vagues se suivent de près)')
  help(f.add(o, 'fin', 0, 6, 0.1).name('pause à la fin (s)'), 'une fois le dernier motif arrivé au bout : temps d’attente avant de recommencer')
  help(f.add(o, 'finMode', ['recommencer', 'aller-retour']).name('à la fin'), 'recommencer : retour direct au 1er motif · aller-retour : les vagues repartent à l’envers')
  help(f.add(o, 'fondu', 0, 1, 0.01), '0 = le motif change d’un coup · plus haut = le nouveau motif grandit doucement')
  help(f.add(o, 'empiler').name('empiler les couches'), 'les motifs précédents restent dessous : la lettre s’épaissit couche par couche')
})

// ---------- Export ----------
const fExport = gui.addFolder('export')
const QUALITES = { 'écran — 1920 px': 1920, 'impression — 5000 px': 5000 }
if (!Object.values(QUALITES).includes(exportOpts.largeur)) exportOpts.largeur = 1920
help(fExport.add(exportOpts, 'largeur', QUALITES).name('qualité PNG'), 'impression : 5000 px de large, pour les grands formats (plus lent, surtout pour la boucle)')
fExport.add(exportOpts, 'transparent').name('fond transparent')
const fond = () => (exportOpts.transparent ? null : params.fond)

// Nom de fichier = recette : mot, alphabet, motifs (par rôle : E extrémités, F fûts, A angles, J jonctions),
// taille, densité, étirement, chaos, graine, rendu. L'état complet est aussi inscrit dans chaque fichier.
const slug = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
function recipe() {
  const L = (id) => labelOf[id] || id
  const r = params.roles
  const motifs =
    params.mode === 'mono'
      ? `mono-${L(params.motif)}`
      : params.mode === 'mix par rôle'
        ? `roles-E${L(r.extremite)}-F${L(r.fut)}-A${L(r.angle)}-J${L(r.jonction)}`
        : 'aleatoire'
  const rendu = params.rendu === 'plein' ? 'plein' : `${params.rendu}${params.epaisseur}`
  return [
    slug(params.texte.trim() || 'mot').toLowerCase(),
    slug(params.alphabet.split(' ')[0]),
    motifs,
    `t${params.taille}`,
    `d${params.densite}`,
    `e${params.etirement}`,
    `c${params.chaos}`,
    `g${params.graine}`,
    slug(rendu),
  ].join('_')
}
const meta = () => fullState(settings())

fExport
  .add({ svg: () => download(new Blob([previewSVG(anim.image, meta())], { type: 'image/svg+xml' }), `${recipe()}.svg`) }, 'svg')
  .name('exporter le mot (SVG)')
fExport
  .add({ png: () => exportPNG(previewSVG(anim.image), exportOpts.largeur, `${recipe()}_img${anim.image + 1}.png`, meta()) }, 'png')
  .name('exporter l’image (PNG)')
const cFrames = fExport.add({ frames: () => exportAnimation() }, 'frames').name('exporter la boucle (PNG)')

// ---------- Sauvegarde de l'état ----------
const fEtat = gui.addFolder('sauvegarde')
help(
  fEtat.add({ exp: () => download(new Blob([JSON.stringify(meta(), null, 2)], { type: 'application/json' }), `${recipe()}_etat.json`) }, 'exp').name('💾 exporter l’état (.json)'),
  'tout : réglages, animation, lettres retouchées, favoris',
)
const fileInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,.svg,.png' })
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]
  fileInput.value = ''
  if (!file) return
  try {
    const state = await readStateFile(file)
    if (confirm(`Remplacer l’état actuel (réglages, lettres retouchées, favoris) par celui de « ${file.name} » ?`)) applyState(state)
  } catch (e) {
    say(`import impossible : ${e.message}`)
  }
})
help(fEtat.add({ imp: () => fileInput.click() }, 'imp').name('📂 importer un état…'), 'un .json d’état, ou un SVG / PNG exporté par le tool')
help(
  fEtat.add({ reset: () => {
    if (!confirm('Revenir aux réglages par défaut ? (tes lettres retouchées et tes favoris sont gardés)')) return
    clearSettings()
    location.reload()
  } }, 'reset').name('↺ réglages par défaut'),
  'revient à l’état de départ du tool ; les lettres retouchées et les favoris sont gardés',
)
help(
  fEtat.add({ wipe: () => {
    const ok = confirm(
      'Tout réinitialiser ?\n\nRéglages, lettres retouchées, favoris, motifs et caractères ajoutés : tout sera effacé de ce navigateur et la page reviendra à son état de base.\n\nAstuce : « 💾 exporter l’état » avant, pour garder une sauvegarde.',
    )
    if (ok) wipeEverything()
  } }, 'wipe').name('🗑 tout réinitialiser (vider le cache)'),
  'efface tout ce que le tool a enregistré dans ce navigateur et remet la page à son état de base',
)

let exporting = false
async function exportAnimation() {
  if (exporting) return
  exporting = true
  const wasPlaying = anim.lecture
  const frame = anim.image
  anim.lecture = false
  try {
    await exportFrames({
      count: anim.images,
      width: exportOpts.largeur,
      name: `${recipe()}_boucle`,
      meta: meta(),
      frameSVG: (i) => {
        return previewSVG(i, null, true)
      },
      onProgress: (i, n) => cFrames.name(i < n ? `export… ${i + 1} / ${n}` : 'exporter la boucle (PNG)'),
    })
    say(`${anim.images} images exportées — à importer en séquence à ${anim.ips} images/s, elles bouclent`)
  } finally {
    exporting = false
    anim.lecture = wasPlaying
    anim.image = frame
    update()
  }
}

function refreshGui() {
  gui.controllersRecursive().forEach((c) => c.updateDisplay())
  update()
}

function setLettre(ch) {
  params.lettre = ch.toUpperCase()
  update()
}

gui.onChange(({ object, property, controller }) => {
  if (property === 'images') anim.image = Math.min(anim.image, anim.images - 1)
  // choix à la main = entre dans l'historique du mode
  if (object === params.roles) record(DRAWS['mix par rôle'])
  if (property === 'graine') record(DRAWS['mix aléatoire'])
  // toucher un effet à la main = on sort du préréglage
  if (controller !== cPreset && Object.values(anim).includes(object)) presetState.preset = '—'
  if (property === 'actif') {
    const key = Object.keys(EFFETS).find((k) => anim[k] === object)
    if (object.actif) {
      say(EFFETS[key])
      effectFolders[key].f.open()
      if (!anim.lecture) {
        anim.image = 0
        play()
      }
    } else if (!isActive(anim)) {
      stop() // plus aucun effet : retour à l'aperçu du mot
    }
  }
  cPreset.updateDisplay()
  update()
})

// ---------- Lecture de l'animation ----------
let last = 0
function tick(now) {
  requestAnimationFrame(tick)
  if (!anim.lecture || exporting) return
  if (now - last < 1000 / anim.ips) return
  last = now
  anim.image = (anim.image + 1) % anim.images
  renderPreview()
}
requestAnimationFrame(tick)

// ---------- Mise à jour (au plus une fois par image) ----------
let pending = false
function update() {
  if (pending) return
  pending = true
  requestAnimationFrame(() => {
    pending = false
    if (exporting) return
    cMotif.show(params.mode === 'mono')
    cRoles.forEach((c) => c.show(params.mode === 'mix par rôle'))
    const d = currentDraw()
    for (const c of [cTirer, cPrev, cNext, cFav]) c.show(!!d)
    fFavoris.show(!!d)
    if (d) {
      if (favoritesShown !== d) renderFavorites()
      const cur = d.get()
      cTirer.name(d.tirer)
      cPrev.enable(d.index > 0)
      cNext.enable(d.index < d.history.length - 1)
      cFav.name(d.favorites.some((f) => d.same(f, cur)) ? '★ favori (clic : retirer)' : '☆ garder en favori')
      // favori correspondant au tirage actuel mis en évidence
      fFavoris.controllers.forEach((c, i) => c.domElement.classList.toggle('current', !!d.favorites[i] && d.same(d.favorites[i], cur)))
    }
    cEpaisseur.show(params.rendu !== 'plein')
    cContour.show(params.rendu !== 'plein')
    // ● devant les effets actifs
    for (const [key, { f, title }] of Object.entries(effectFolders)) f.title((anim[key].actif ? '● ' : '') + title)
    // cycle : ordre affiché, et longueur de la boucle calculée d'après les durées
    cOrdre.object.ordre = anim.cycle.liste.map((id) => labelOf[id] || id).join(' → ') || '(vide)'
    cOrdre.updateDisplay()
    const cycling = anim.cycle.actif && anim.cycle.liste.length >= 2
    if (cycling) {
      anim.images = Math.max(2, Math.round(cycleDuration(anim.cycle) * anim.ips))
      anim.image = Math.min(anim.image, anim.images - 1)
      cImages.updateDisplay()
    }
    cImages.enable(!cycling)
    layoutVersion++
    document.body.style.setProperty('--fond', params.fond)
    saveSettings(settings()) // enregistrement automatique : le tool rouvre dans cet état
    renderPreview()
    editor.render()
    renderLibrary()
  })
}

update()
