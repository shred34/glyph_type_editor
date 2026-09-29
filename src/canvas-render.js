// Aperçu sur canvas : chaque motif est dessiné une seule fois dans une petite image (par couleur et épaisseur),
// puis simplement recopié, tourné et mis à l'échelle à chaque image. Beaucoup plus fluide que des milliers
// d'éléments SVG. Les exports, eux, restent en vrai vecteur (voir export/svg.js).

const RES = 2.5 // pixels par unité de case dans les images en cache (1 case = 100 unités)

export function createCanvasRenderer(canvas, pieces) {
  const ctx = canvas.getContext('2d')
  const byId = Object.fromEntries(pieces.map((p) => [p.id, p]))
  const cache = new Map()

  // kind : 'fill' (plein), 'outline' (contour seul), 'expanded' (plein + contour, pour halo et contour fusionné)
  function sprite(id, kind, color, sw) {
    const key = `${id}|${kind}|${color}|${sw}`
    let spr = cache.get(key)
    if (spr) return spr
    const p = byId[id]
    if (!p) return null
    if (cache.size > 300) cache.clear()
    const pad = (kind === 'fill' ? 0 : sw / 2) + 2
    const size = 100 + 2 * pad
    const px = Math.ceil(size * RES)
    const img = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px })
    const c = img.getContext('2d')
    c.setTransform(RES, 0, 0, RES, px / 2, px / 2)
    c.scale(p.s, p.s)
    c.translate(-p.cx, -p.cy)
    if (kind !== 'outline') {
      c.fillStyle = color
      c.fill(p.path2d, 'evenodd')
    }
    if (kind !== 'fill' && sw > 0) {
      c.strokeStyle = color
      c.lineWidth = sw / p.s
      c.lineJoin = 'round'
      c.stroke(p.path2d)
    }
    spr = { img, size }
    cache.set(key, spr)
    return spr
  }

  function layersFor(p) {
    const w = p.epaisseur
    switch (p.rendu) {
      case 'contours séparés':
        return [['outline', p.contour, w]]
      case 'contour fusionné':
        return [['expanded', p.contour, w * 2], ['fill', p.fond, 0]]
      case 'halo':
        return [['expanded', p.contour, w * 2], ['fill', p.encre, 0]]
      default:
        return [['fill', p.encre, 0]]
    }
  }

  // viewBox = [x, y, largeur, hauteur], cadré comme un SVG en « xMidYMid meet »
  function draw(items, p, [vx, vy, vw, vh]) {
    const dpr = window.devicePixelRatio || 1
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!cw || !ch) return
    const k = Math.min(cw / vw, ch / vh)
    const K = k * dpr
    const E = ((cw - vw * k) / 2 - vx * k) * dpr
    const F = ((ch - vh * k) / 2 - vy * k) * dpr

    for (const [kind, color, sw] of layersFor(p)) {
      for (const it of items) {
        const spr = sprite(it.piece, kind, color, sw)
        if (!spr) continue
        const r = (it.rot * Math.PI) / 180
        const cos = Math.cos(r)
        const sin = Math.sin(r)
        ctx.setTransform(K * cos * it.sx, K * sin * it.sx, -K * sin * it.sy, K * cos * it.sy, K * it.x + E, K * it.y + F)
        ctx.drawImage(spr.img, -spr.size / 2, -spr.size / 2, spr.size, spr.size)
      }
    }
  }

  return { draw }
}
