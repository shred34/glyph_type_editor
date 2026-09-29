export const NS = 'http://www.w3.org/2000/svg'

export function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
