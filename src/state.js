// État complet du tool : réglages, animation, export, lettres retouchées, favoris.
// - enregistré automatiquement dans le navigateur (le tool rouvre là où on l'a laissé)
// - exportable / importable en .json
// - inscrit dans chaque export SVG et PNG : on peut ré-importer un export pour retrouver ses réglages

const STATE_KEY = 'type-tool:etat'
const PNG_KEYWORD = 'type-tool'

// copie les valeurs de src dans target, seulement pour les clés qui existent déjà (et du même type)
export function mergeInto(target, src) {
  if (!src || typeof src !== 'object') return target
  for (const [k, v] of Object.entries(src)) {
    if (!(k in target)) continue
    const cur = target[k]
    if (Array.isArray(cur)) {
      if (Array.isArray(v)) target[k] = [...v]
    } else if (cur && typeof cur === 'object') {
      mergeInto(cur, v)
    } else if (typeof v === typeof cur) {
      target[k] = v
    }
  }
  return target
}

export function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY))
  } catch {
    return null
  }
}

// pendant une remise à zéro ou un import, plus aucun enregistrement : sinon l'enregistrement automatique
// pourrait réécrire l'ancien état juste avant le rechargement de la page
let frozen = false

// réglages seuls (enregistrement automatique)
export function saveSettings(settings) {
  if (frozen) return
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(settings))
  } catch {}
}

// (toujours suivi d'un rechargement : on bloque les enregistrements d'ici là)
export function clearSettings() {
  frozen = true
  try {
    localStorage.removeItem(STATE_KEY)
  } catch {}
}

// état complet : réglages + tout ce que le tool a enregistré (lettres, favoris…)
export function fullState(settings) {
  const storage = {}
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('type-tool:') && k !== STATE_KEY) storage[k] = localStorage.getItem(k)
  } catch {}
  return { outil: 'type-tool', version: 1, date: new Date().toISOString(), ...structuredClone(settings), storage }
}

// remplace l'état du navigateur par celui du fichier, puis recharge
export function applyState(state) {
  if (state?.outil !== 'type-tool') throw new Error('ce fichier ne contient pas d’état type-tool')
  frozen = true
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('type-tool:')) localStorage.removeItem(k)
    for (const [k, v] of Object.entries(state.storage || {})) if (k.startsWith('type-tool:')) localStorage.setItem(k, v)
    const { storage, outil, version, date, ...settings } = state
    // importe : ces réglages s'appliquent même s'ils viennent d'une ancienne version des réglages par défaut
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...settings, importe: true }))
  } catch {}
  location.reload()
}

// ---------- Lecture d'un état dans un fichier (.json, .svg ou .png exporté par le tool) ----------
export async function readStateFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.svg')) {
    const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
    const meta = doc.querySelector('metadata#type-tool-etat')
    if (!meta) throw new Error('ce SVG ne contient pas d’état (exporté avant cette version ?)')
    return JSON.parse(meta.textContent)
  }
  if (name.endsWith('.png')) {
    const text = readPngText(new Uint8Array(await file.arrayBuffer()), PNG_KEYWORD)
    if (!text) throw new Error('ce PNG ne contient pas d’état (exporté avant cette version ?)')
    return JSON.parse(text)
  }
  return JSON.parse(await file.text())
}

// JSON en ASCII pur (les accents deviennent \uXXXX) : sans risque dans un PNG
export const asciiJSON = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))

// ---------- Morceau de texte dans un PNG (chunk tEXt) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export async function addPngText(blob, text) {
  const png = new Uint8Array(await blob.arrayBuffer())
  const data = new TextEncoder().encode(`${PNG_KEYWORD}\0${text}`)
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(new TextEncoder().encode('tEXt'), 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  // on insère juste avant le dernier morceau (IEND, 12 octets)
  const iend = png.length - 12
  return new Blob([png.subarray(0, iend), chunk, png.subarray(iend)], { type: 'image/png' })
}

function readPngText(png, keyword) {
  const view = new DataView(png.buffer, png.byteOffset)
  let pos = 8
  while (pos + 8 <= png.length) {
    const len = view.getUint32(pos)
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8))
    if (type === 'tEXt') {
      const data = png.subarray(pos + 8, pos + 8 + len)
      const zero = data.indexOf(0)
      if (new TextDecoder().decode(data.subarray(0, zero)) === keyword) return new TextDecoder().decode(data.subarray(zero + 1))
    }
    pos += 12 + len
  }
  return null
}

// tout remettre à zéro : efface tout ce que le tool a enregistré dans le navigateur, puis recharge
export function wipeEverything() {
  frozen = true
  for (const store of [localStorage, sessionStorage]) {
    try {
      for (const k of Object.keys(store)) if (k.startsWith('type-tool')) store.removeItem(k)
    } catch {}
  }
  location.reload()
}
