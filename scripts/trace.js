// Vectorise les PNG de chaque dossier source en SVG dans public/
// Usage : npm run trace
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import potrace from 'potrace'

const SOURCES = [
  { src: 'Glyphes', out: 'public/pieces', threshold: 128 },
  // seuil automatique : certaines taches sont grises et disparaîtraient à 128
  { src: 'Taches', out: 'public/taches', threshold: potrace.Potrace.THRESHOLD_AUTO },
]
const SIZE = 1200 // px : les petites images sont agrandies avant tracé, pour des courbes plus douces

const traceOptions = {
  turdSize: 20, // ignore les taches de moins de 20 px
  optTolerance: 0.4, // lissage des courbes
  color: '#000',
  background: 'transparent',
}

function slugify(name) {
  return name
    .replace(/\.png$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function trace(buffer, threshold) {
  return new Promise((resolve, reject) => {
    potrace.trace(buffer, { ...traceOptions, threshold }, (err, svg) => (err ? reject(err) : resolve(svg)))
  })
}

const start = Date.now()

for (const { src, out, threshold } of SOURCES) {
  const files = (await fs.readdir(src).catch(() => [])).filter((f) => /\.png$/i.test(f))
  if (!files.length) continue
  await fs.mkdir(out, { recursive: true })
  console.log(`\n${src}/ : ${files.length} images`)
  const index = []

  for (const file of files) {
    const t = Date.now()
    // Fond transparent -> blanc, sinon les pixels transparents sont lus comme noirs
    const buffer = await sharp(path.join(src, file))
      .flatten({ background: '#fff' })
      .resize({ width: SIZE, height: SIZE, fit: 'inside' })
      .png()
      .toBuffer()

    const svg = await trace(buffer, threshold)
    const id = slugify(file)
    await fs.writeFile(path.join(out, `${id}.svg`), svg)

    const kb = (Buffer.byteLength(svg) / 1024).toFixed(0)
    console.log(`✓ ${id}.svg  ${kb} Ko  ${((Date.now() - t) / 1000).toFixed(1)} s`)
    index.push({ id, file: `${path.basename(out)}/${id}.svg`, source: file })
  }

  await fs.writeFile(path.join(out, 'index.json'), JSON.stringify(index, null, 2))
}

console.log(`\nTerminé en ${((Date.now() - start) / 1000).toFixed(1)} s`)
