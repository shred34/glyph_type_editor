// Animation en boucle.
// Tous les effets sont des fonctions de t (0 → 1 sur la boucle) avec des vitesses entières :
// la dernière image rejoint toujours la première, la boucle est parfaite par construction.

const TAU = Math.PI * 2
const frac = (x) => x - Math.floor(x)
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

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

// Ordre dans lequel le retard (décalage) se propage
export const SENS = ['gauche → droite', 'droite → gauche', 'haut → bas', 'bas → haut', 'centre → bords', 'lettre par lettre', 'aléatoire']

function delayOf(it, sens) {
  switch (sens) {
    case 'gauche → droite': return it.nx
    case 'droite → gauche': return 1 - it.nx
    case 'haut → bas': return it.ny
    case 'bas → haut': return 1 - it.ny
    case 'centre → bords': return Math.min(1, Math.hypot(it.nx - 0.5, it.ny - 0.5) * 1.6)
    case 'lettre par lettre': return it.li
    default: return it.rand
  }
}

// Cycle par défaut : du plus maigre au plus épais → la lettre se construit couche par couche
export const CYCLE_DEFAUT = [
  'symbols-20-engraving-design-syndrome-necronomicon',
  'symbols-18-engraving-design-syndrome-necronomicon',
  '53-design-syndrome-necronomicon',
  'taches7',
]

export function defaultAnim() {
  return {
    lecture: false,
    image: 0,
    images: 48,
    ips: 24,
    sens: 'gauche → droite',
    flottement: { actif: false, amplitude: 15, vitesse: 1 },
    balancement: { actif: false, amplitude: 20, vitesse: 1, decalage: 0.5 },
    rotation: { actif: false, tours: 1, style: 'à-coups', decalage: 0.5 },
    pulsation: { actif: false, amplitude: 0.3, vitesse: 1, decalage: 0.5 },
    bouillonnement: { actif: false, pas: 2, force: 1, motifs: false },
    apparition: { actif: false, maintien: 0.3, douceur: 0.5 },
    // cycle : le 1er motif seul, puis chaque motif suivant traverse tout le mot en vague, l'un après l'autre
    cycle: {
      actif: false,
      liste: [...CYCLE_DEFAUT],
      vague: 1.5, // secondes pour qu'une vague traverse le mot
      pause: -0.9, // secondes entre deux vagues ; négatif = la vague suivante part avant que la précédente soit au bout
      fin: 1, // secondes sur le dernier motif (une fois arrivé au bout) avant de recommencer
      finMode: 'recommencer',
      fondu: 0,
      empiler: false,
    },
  }
}

export const EFFETS = {
  flottement: 'Flottement : chaque motif dérive doucement autour de sa place, chacun à son rythme (aucun retard à régler, c’est déjà irrégulier).',
  balancement: 'Balancement : les motifs oscillent à gauche / à droite. Décalage > 0 : la vague part selon le « sens du décalage ».',
  rotation: 'Rotation : tours complets par boucle. « à-coups » = chaque motif fait son tour d’un coup puis se repose ; avec du décalage ils partent l’un après l’autre.',
  pulsation: 'Pulsation : les motifs grossissent et rétrécissent. Amplitude > 1 : ils disparaissent un instant.',
  bouillonnement: 'Bouillonnement : toutes les n images, chaque motif saute un peu, façon dessin image par image. « motifs aussi » retire au sort miroirs et motifs.',
  apparition: 'Apparition : les motifs apparaissent un à un dans le sens du décalage, restent (maintien), puis disparaissent. La boucle recommence à vide.',
  cycle: 'Cycle : on part du 1er motif de la liste ; chaque motif suivant traverse le mot en vague (sens du décalage), et le suivant ne part que quand la vague précédente est arrivée au bout. La durée de la boucle se calcule toute seule.',
}

// Préréglages : partent de tout désactivé, puis activent une combinaison
export const PRESETS = {
  'flottement doux': (a) => Object.assign(a.flottement, { actif: true, amplitude: 12, vitesse: 1 }),
  onde: (a) => {
    Object.assign(a.pulsation, { actif: true, amplitude: 0.4, vitesse: 1, decalage: 1 })
    a.sens = 'gauche → droite'
  },
  balancier: (a) => {
    Object.assign(a.balancement, { actif: true, amplitude: 25, vitesse: 1, decalage: 0.5 })
    a.sens = 'gauche → droite'
  },
  'stop motion': (a) => {
    Object.assign(a.bouillonnement, { actif: true, pas: 2, force: 1 })
    Object.assign(a, { images: 24, ips: 12 })
  },
  tourbillon: (a) => {
    Object.assign(a.rotation, { actif: true, tours: 1, style: 'à-coups', decalage: 1 })
    a.sens = 'lettre par lettre'
  },
  écriture: (a) => {
    Object.assign(a.apparition, { actif: true, maintien: 0.35, douceur: 0.4 })
    a.sens = 'gauche → droite'
  },
  construction: (a) => {
    Object.assign(a.cycle, { actif: true, vague: 1.5, pause: -0.9, fin: 1, finMode: 'recommencer', fondu: 0, empiler: false })
    Object.assign(a, { ips: 24, sens: 'gauche → droite' })
  },
  métamorphose: (a) => {
    Object.assign(a.cycle, { actif: true, vague: 0.8, pause: 0, fin: 0, finMode: 'recommencer', fondu: 0.4, empiler: false })
    a.sens = 'aléatoire'
  },
  organique: (a) => {
    Object.assign(a.flottement, { actif: true, amplitude: 8, vitesse: 1 })
    Object.assign(a.balancement, { actif: true, amplitude: 12, vitesse: 1, decalage: 1 })
    Object.assign(a.pulsation, { actif: true, amplitude: 0.15, vitesse: 2, decalage: 1 })
    a.sens = 'aléatoire'
  },
}

export const PRESET_DESC = {
  'flottement doux': 'Les motifs flottent lentement, chacun à son rythme.',
  onde: 'Une vague de grossissement traverse le mot de gauche à droite.',
  balancier: 'Les motifs se balancent, avec un retard de gauche à droite.',
  'stop motion': 'Tremblement image par image, 12 images/s, comme un dessin animé fait main.',
  tourbillon: 'Chaque lettre fait un tour, l’une après l’autre.',
  écriture: 'Le mot s’écrit de gauche à droite, reste affiché, puis s’efface.',
  construction: 'La lettre se construit couche par couche : du motif le plus maigre au plus épais, une vague après l’autre, de gauche à droite.',
  métamorphose: 'Les motifs se transforment en décalé, dans un ordre aléatoire. Choisis la liste : bibliothèque → mode « cycle ».',
  organique: 'Flottement + balancement + pulsation, avec des retards aléatoires : vivant et irrégulier.',
}

export const isActive = (a) => Object.keys(EFFETS).some((k) => a[k].actif)

export function resetEffects(a) {
  const d = defaultAnim()
  // la liste du cycle est gardée
  for (const k of Object.keys(EFFETS)) Object.assign(a[k], d[k], k === 'cycle' ? { liste: a.cycle.liste } : {})
}

// Réglages qui changent d'une image à l'autre (avant la mise en page)
export function frameParams(p, a, frame) {
  const b = a.bouillonnement
  if (!b.actif || !b.motifs) return p
  return { ...p, graine: p.graine + Math.floor((frame % a.images) / b.pas) * 101 }
}

// apparition : 0 → 1 (entrée), maintien, 1 → 0 (sortie), vide au début et à la fin
function appear(t, d, ap) {
  const A = (1 - ap.maintien) / 2
  const dur = Math.max(0.001, ap.douceur * A)
  const spread = A - dur
  const tin = d * spread
  const tout = A + ap.maintien + d * spread
  if (t < tin) return 0
  if (t < tin + dur) return ease((t - tin) / dur)
  if (t < tout) return 1
  if (t < tout + dur) return 1 - ease((t - tout) / dur)
  return 0
}

// Rythme du cycle : la vague k (k = 1 … n-1) part à (k-1) × (vague + pause) ; une pause négative fait
// chevaucher les vagues. Après la dernière vague arrivée au bout, on attend `fin` puis on recommence.
const gap = (cy) => Math.max(cy.vague + cy.pause, cy.vague * 0.05)
function oneWay(cy) {
  const n = cy.liste.length
  return (n - 2) * gap(cy) + cy.vague + cy.fin
}

export function cycleDuration(cy) {
  if (cy.liste.length < 2) return 0
  return cy.finMode === 'aller-retour' ? 2 * oneWay(cy) : oneWay(cy)
}

// Pour un motif (retard d de 0 à 1) au temps `time` (secondes) : quelles couches afficher, et à quelle échelle
function cycleLayers(cy, time, d) {
  const n = cy.liste.length
  const one = oneWay(cy)
  const back = cy.finMode === 'aller-retour' && time >= one
  const tt = back ? time - one : time
  let now = back ? n - 1 : 0
  let before = now
  let since = Infinity
  for (let k = 1; k < n; k++) {
    // la vague k atteint ce motif après d × durée de la vague
    const at = (k - 1) * gap(cy) + d * cy.vague
    if (tt < at) break
    now = back ? n - 1 - k : k
    before = back ? n - k : k - 1
    since = tt - at
  }
  const grow = cy.fondu > 0 ? ease(since / (cy.fondu * cy.vague)) : 1
  // le nouveau motif pousse par-dessus l'ancien, qui reste entier jusqu'à ce que le nouveau soit complet
  if (!cy.empiler) return grow >= 1 || before === now ? [[now, 1]] : [[before, 1], [now, grow]]
  // couches empilées : tous les motifs de la liste jusqu'au motif en cours (les plus fins dessus)
  const top = Math.max(now, before)
  const layers = []
  for (let i = top; i >= 0; i--) {
    let k = 1
    if (i === now && before < now) k = grow // couche qui arrive
    if (i === before && before > now) k = 1 - grow // couche qui repart
    layers.push([i, k])
  }
  return layers
}

// Effets appliqués aux motifs placés. Chaque motif porte nx, ny (position 0–1), li (lettre 0–1), idx.
export function animateItems(items, a, frame) {
  frame %= a.images // l'image « images » est la même que l'image 0 : la boucle se referme
  const t = frame / a.images
  const { flottement: fl, balancement: ba, rotation: ro, pulsation: pu, bouillonnement: bo, apparition: ap, cycle: cy } = a
  const step = Math.floor(frame / bo.pas)
  const out = []
  const cycling = cy.actif && cy.liste.length >= 2
  const time = frame / a.ips

  for (const it of items) {
    const r = random(hash('m' + it.idx))
    it.rand = r()
    const d = delayOf(it, a.sens)
    let { x, y, rot, piece } = it
    let k = 1

    if (fl.actif) {
      // deux harmoniques avec des phases propres à chaque motif : mouvement irrégulier mais bouclé
      const [p1, p2, p3, p4] = [r(), r(), r(), r()]
      const v = fl.vitesse
      x += fl.amplitude * (Math.sin(TAU * (v * t + p1)) + 0.4 * Math.sin(TAU * (2 * v * t + p2)))
      y += fl.amplitude * (Math.sin(TAU * (v * t + p3)) + 0.4 * Math.sin(TAU * (2 * v * t + p4)))
    }
    if (ba.actif) rot += ba.amplitude * Math.sin(TAU * (ba.vitesse * t - d * ba.decalage))
    if (ro.actif && ro.tours) {
      const u = frac(t - d * ro.decalage)
      const n = Math.abs(ro.tours)
      const turns = ro.style === 'à-coups' ? Math.floor(n * u) + ease(frac(n * u) * 1.6) : n * u
      rot += Math.sign(ro.tours) * 360 * turns
    }
    if (pu.actif) k *= Math.max(0, 1 + pu.amplitude * Math.sin(TAU * (pu.vitesse * t - d * pu.decalage)))
    if (bo.actif) {
      const j = random(hash(`b${step}|${it.idx}`))
      x += (j() * 2 - 1) * bo.force * 20
      y += (j() * 2 - 1) * bo.force * 20
      rot += (j() * 2 - 1) * bo.force * 12
    }
    if (ap.actif) k *= appear(t, d, ap)

    const layers = cycling ? cycleLayers(cy, time, d).map(([i, g]) => [cy.liste[i], g]) : [[piece, 1]]
    for (const [pc, g] of layers) {
      const kk = k * g
      if (kk < 0.001) continue
      out.push({ ...it, x, y, rot, piece: pc, sx: it.sx * kk, sy: it.sy * kk })
    }
  }
  return out
}
