// Export PNG : une image, ou une animation image par image dans un .zip
import JSZip from 'jszip'
import { download } from './svg.js'
import { addPngText, asciiJSON } from '../state.js'

async function svgToPng(svgString, width) {
  const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w = Math.round(width)
    const h = Math.round((img.height / img.width) * width)
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

// meta = état du tool, inscrit dans le PNG (ré-importable)
export async function exportPNG(svgString, width, filename, meta) {
  const png = await svgToPng(svgString, width)
  download(meta ? await addPngText(png, asciiJSON(meta)) : png, filename)
}

// frameSVG(i) renvoie le SVG de l'image i ; onProgress(i, total) pour afficher l'avancement
export async function exportFrames({ count, frameSVG, width, name, onProgress, meta }) {
  const zip = new JSZip()
  const folder = zip.folder(name)
  if (meta) folder.file('etat.json', JSON.stringify(meta, null, 2))
  const text = meta && asciiJSON(meta)
  for (let i = 0; i < count; i++) {
    onProgress?.(i, count)
    let png = await svgToPng(frameSVG(i), width)
    if (text) png = await addPngText(png, text)
    folder.file(`${name}_${String(i + 1).padStart(4, '0')}.png`, png)
  }
  onProgress?.(count, count)
  download(await zip.generateAsync({ type: 'blob' }), `${name}.zip`)
}
