// Fabrique un SVG autonome (lisible dans Illustrator, Figma…) à partir de l'aperçu
import { NS, el } from '../svg.js'

const XLINK = 'http://www.w3.org/1999/xlink'

// fond = null → fond transparent ; meta = état du tool, inscrit dans le fichier pour pouvoir le ré-importer
export function buildSVG(svg, defs, fond, meta) {
  const out = svg.cloneNode(true)
  out.querySelectorAll('.hit').forEach((n) => n.remove())

  // Les épaisseurs de contour passent par une variable CSS (--sw) :
  // on les fige dans une copie des motifs utilisés, par calque.
  // Pour Illustrator (et autres logiciels) : les couleurs et le contour sont inscrits directement sur les formes
  // (sans dépendre de l'héritage à travers <use>), et les liens utilisent xlink:href.
  const newDefs = el('defs')
  out.querySelectorAll('.ink > g').forEach((layer, i) => {
    const sw = parseFloat(layer.style.getPropertyValue('--sw')) || 0
    layer.removeAttribute('style')
    const paint = {
      fill: layer.getAttribute('fill') || 'none',
      stroke: layer.getAttribute('stroke') || 'none',
      'stroke-linejoin': layer.getAttribute('stroke-linejoin') || 'round',
    }
    const done = new Set()
    for (const use of layer.querySelectorAll('use')) {
      const id = use.getAttribute('href').slice(1)
      const newId = `${id}-${i}`
      if (!done.has(id)) {
        done.add(id)
        const g = defs.querySelector('#' + id).cloneNode(true)
        g.id = newId
        // toutes les formes du motif (un motif personnel peut en avoir plusieurs)
        for (const shape of g.querySelectorAll('[data-k]')) {
          shape.removeAttribute('style')
          for (const [k, v] of Object.entries(paint)) shape.setAttribute(k, v)
          if (sw && paint.stroke !== 'none') shape.setAttribute('stroke-width', sw * shape.dataset.k)
          shape.removeAttribute('data-k')
        }
        newDefs.append(g)
      }
      use.removeAttribute('href')
      use.setAttributeNS(XLINK, 'xlink:href', '#' + newId)
    }
  })

  const vb = svg.viewBox.baseVal
  out.setAttribute('xmlns', NS)
  out.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', XLINK)
  out.setAttribute('version', '1.1')
  out.setAttribute('width', Math.round(vb.width))
  out.setAttribute('height', Math.round(vb.height))
  out.removeAttribute('id')
  if (fond) out.prepend(el('rect', { x: vb.x, y: vb.y, width: vb.width, height: vb.height, fill: fond }))
  out.prepend(newDefs)
  if (meta) {
    const m = el('metadata', { id: 'type-tool-etat' })
    m.textContent = JSON.stringify(meta)
    out.prepend(m)
  }

  return new XMLSerializer().serializeToString(out)
}

export function download(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function exportSVG(svg, defs, fond, filename, meta) {
  download(new Blob([buildSVG(svg, defs, fond, meta)], { type: 'image/svg+xml' }), filename)
}
