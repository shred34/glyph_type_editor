// Dessine une liste de motifs placés dans un <g>, selon le mode de rendu.
import { el } from './svg.js'

export const RENDUS = ['plein', 'contour fusionné', 'contours séparés', 'halo']

function useOf(it) {
  return el('use', {
    href: '#piece-' + it.piece,
    transform: `translate(${it.x} ${it.y}) rotate(${it.rot}) scale(${it.sx} ${it.sy})`,
  })
}

export function drawItems(target, items, p) {
  target.replaceChildren()
  const layer = (attrs) => {
    const g = el('g', { 'stroke-linejoin': 'round', ...attrs })
    for (const it of items) g.append(useOf(it))
    target.append(g)
  }
  const w = p.epaisseur

  if (p.rendu === 'plein') {
    layer({ fill: p.encre, stroke: 'none' })
  } else if (p.rendu === 'contours séparés') {
    layer({ fill: 'none', stroke: p.contour, style: `--sw:${w}` })
  } else if (p.rendu === 'contour fusionné') {
    // contour épais dessous, puis remplissage couleur de fond : seul le contour extérieur reste
    layer({ fill: p.contour, stroke: p.contour, style: `--sw:${w * 2}` })
    layer({ fill: p.fond, stroke: 'none' })
  } else if (p.rendu === 'halo') {
    layer({ fill: p.contour, stroke: p.contour, style: `--sw:${w * 2}` })
    layer({ fill: p.encre, stroke: 'none' })
  }
}
