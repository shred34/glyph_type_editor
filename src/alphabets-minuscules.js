// Alphabets en minuscules, sur 9 lignes :
//   lignes 0–1 : hampes (b, d, f, h, k, l, t) et points (i, j)
//   lignes 2–6 : hauteur d'x (la ligne de base est sous la ligne 6)
//   lignes 7–8 : jambages (g, j, p, q, y)
// Les chiffres et la ponctuation reprennent ceux de l'alphabet signature (hauteur des capitales = lignes 0–6).

const g = (s) => s.trim().split('\n').map((r) => r.trim())
const lowerBase = (rows) => [...rows, ...rows.slice(0, 2).map((r) => '.'.repeat(r.length))] // capitales → 9 lignes

// Signature minuscules : mêmes principes que « signature 7 lignes » —
// coin carré en bas à droite des lettres rondes, m et w larges et asymétriques, i et l étroits.
const SIGNATURE_MIN = {
  a: g(`
    .....
    .....
    .###.
    ....#
    .####
    #...#
    .####`),
  b: g(`
    #....
    #....
    ####.
    #...#
    #...#
    #...#
    #####`),
  c: g(`
    .....
    .....
    .###.
    #...#
    #....
    #....
    .####`),
  d: g(`
    ....#
    ....#
    .####
    #...#
    #...#
    #...#
    .####`),
  e: g(`
    .....
    .....
    .###.
    #...#
    #####
    #....
    .####`),
  f: g(`
    ..##
    .#..
    ###.
    .#..
    .#..
    .#..
    .#..`),
  g: g(`
    .....
    .....
    .####
    #...#
    #...#
    #...#
    .####
    ....#
    ####.`),
  h: g(`
    #....
    #....
    ####.
    #...#
    #...#
    #...#
    #...#`),
  i: g(`
    .#.
    ...
    ##.
    .#.
    .#.
    .#.
    ###`),
  j: g(`
    ...#
    ....
    ..##
    ...#
    ...#
    ...#
    ...#
    #..#
    .##.`),
  k: g(`
    #....
    #....
    #...#
    #..#.
    ###..
    #..#.
    #...#`),
  l: g(`
    ##.
    .#.
    .#.
    .#.
    .#.
    .#.
    .##`),
  m: g(`
    .......
    .......
    ##.###.
    #.#...#
    #.#...#
    #.#...#
    #.#...#`),
  n: g(`
    .....
    .....
    ####.
    #...#
    #...#
    #...#
    #...#`),
  o: g(`
    .....
    .....
    .###.
    #...#
    #...#
    #...#
    .####`),
  p: g(`
    .....
    .....
    ####.
    #...#
    #...#
    #...#
    #####
    #....
    #....`),
  q: g(`
    .....
    .....
    .####
    #...#
    #...#
    #...#
    .####
    ....#
    ....#`),
  r: g(`
    ....
    ....
    #.##
    ##..
    #...
    #...
    #...`),
  s: g(`
    .....
    .....
    .####
    #....
    .###.
    ....#
    #####`),
  t: g(`
    .#..
    .#..
    ####
    .#..
    .#..
    .#..
    ..##`),
  u: g(`
    .....
    .....
    #...#
    #...#
    #...#
    #...#
    .####`),
  v: g(`
    .....
    .....
    #...#
    #...#
    .#.#.
    .#.#.
    ..#..`),
  w: g(`
    .......
    .......
    #.....#
    #...#.#
    #..##.#
    #.#.#.#
    .#...#.`),
  x: g(`
    .....
    .....
    #...#
    .#.#.
    ..#..
    .#.#.
    #...#`),
  y: g(`
    .....
    .....
    #...#
    #...#
    #...#
    #...#
    .####
    ....#
    ####.`),
  z: g(`
    .....
    .....
    #####
    ...#.
    ..#..
    .#...
    #####`),
}

// Angulaires minuscules : famille de l'alphabet « angulaire » — panses en losange, aucune courbe
const ANGULAIRE_MIN = {
  a: g(`
    .....
    .....
    ..#.#
    .#.##
    #...#
    .#.##
    ..#.#`),
  b: g(`
    #....
    #....
    #.#..
    ##.#.
    #...#
    ##.#.
    #.#..`),
  c: g(`
    .....
    .....
    ..##.
    .#...
    #....
    .#...
    ..##.`),
  d: g(`
    ....#
    ....#
    ..#.#
    .#.##
    #...#
    .#.##
    ..#.#`),
  e: g(`
    .....
    .....
    ..#..
    .#.#.
    #####
    .#...
    ..##.`),
  f: g(`
    ..##
    .#..
    ###.
    .#..
    .#..
    .#..
    .#..`),
  g: g(`
    .....
    .....
    ..#.#
    .#.##
    #...#
    .#.##
    ..#.#
    ....#
    .###.`),
  h: g(`
    #....
    #....
    #.#..
    ##.#.
    #...#
    #...#
    #...#`),
  i: g(`
    .#.
    ...
    ##.
    .#.
    .#.
    .#.
    .##`),
  j: g(`
    ...#
    ....
    ..##
    ...#
    ...#
    ...#
    ...#
    ..#.
    ##..`),
  k: g(`
    #....
    #....
    #..#.
    #.#..
    ##...
    #.#..
    #..#.`),
  l: g(`
    #.
    #.
    #.
    #.
    #.
    #.
    .#`),
  m: g(`
    .......
    .......
    #.#.#..
    ##.#.#.
    #..#..#
    #..#..#
    #..#..#`),
  n: g(`
    .....
    .....
    #.#..
    ##.#.
    #...#
    #...#
    #...#`),
  o: g(`
    .....
    .....
    ..#..
    .#.#.
    #...#
    .#.#.
    ..#..`),
  p: g(`
    .....
    .....
    #.#..
    ##.#.
    #...#
    ##.#.
    #.#..
    #....
    #....`),
  q: g(`
    .....
    .....
    ..#.#
    .#.##
    #...#
    .#.##
    ..#.#
    ....#
    ....#`),
  r: g(`
    ....
    ....
    #..#
    #.#.
    ##..
    #...
    #...`),
  s: g(`
    .....
    .....
    ..###
    .#...
    ..#..
    ...#.
    ###..`),
  t: g(`
    .#..
    .#..
    ####
    .#..
    .#..
    .#..
    ..##`),
  u: g(`
    .....
    .....
    #...#
    #...#
    #...#
    .#.##
    ..#.#`),
  v: g(`
    .....
    .....
    #...#
    #...#
    .#.#.
    .#.#.
    ..#..`),
  w: g(`
    .......
    .......
    #.....#
    #..#..#
    .#.#.#.
    .#.#.#.
    ..#.#..`),
  x: g(`
    .....
    .....
    #...#
    .#.#.
    ..#..
    .#.#.
    #...#`),
  y: g(`
    .....
    .....
    #...#
    #...#
    .#.#.
    .#.#.
    ..#..
    .#...
    #....`),
  z: g(`
    .....
    .....
    #####
    ...#.
    ..#..
    .#...
    #####`),
}

// complète chaque lettre jusqu'à 9 lignes (les lettres sans jambage finissent sur la ligne de base)
function toNine(rows) {
  const out = [...rows]
  while (out.length < 9) out.push('.'.repeat(rows[0].length))
  return out
}

export function lowercaseAlphabets(SIGNATURE) {
  const signatureMin = {}
  // chiffres, ponctuation, espace : ceux de signature, ramenés à 9 lignes
  for (const [k, rows] of Object.entries(SIGNATURE)) if (!/^[A-Z]$/.test(k)) signatureMin[k] = lowerBase(rows)
  // lettres : les minuscules (rangées sous la clé en capitale, le tool cherche les lettres en capitales)
  for (const [k, rows] of Object.entries(SIGNATURE_MIN)) signatureMin[k.toUpperCase()] = toNine(rows)

  // angulaires : mêmes chiffres et ponctuation, lettres en losanges
  const angulaireMin = { ...signatureMin }
  for (const [k, rows] of Object.entries(ANGULAIRE_MIN)) angulaireMin[k.toUpperCase()] = toNine(rows)

  return {
    'signature minuscules 9 lignes': signatureMin,
    'angulaire minuscules 9 lignes': angulaireMin,
  }
}
