/**
 * Mini lecteur XML (sans DOMParser) : assez pour lire un .docx, identique dans le navigateur et dans les tests.
 * Ne charge jamais de DTD ni d'entité externe : seules les 5 entités standard et les références numériques sont lues.
 */
export interface XEl { n: string; a: Record<string, string>; c: (XEl | string)[] }

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string): string =>
  s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return NAMED[e.toLowerCase()] ?? m
  })

/** Éléments dont les espaces comptent (texte d'un run) : les autres blancs entre balises sont ignorés. */
const KEEP_SPACE = new Set(['w:t', 'm:t', 'w:instrText', 'a:t'])
const ATTR = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export function parseXml(src: string): XEl {
  if (src.includes('<!DOCTYPE') || src.includes('<!ENTITY')) throw new Error('XML non pris en charge')
  const root: XEl = { n: '#root', a: {}, c: [] }
  const stack: XEl[] = [root]
  const L = src.length
  let i = 0
  while (i < L) {
    const lt = src.indexOf('<', i)
    const top = stack[stack.length - 1]
    if (lt < 0) { const t = src.slice(i); if (t.trim() || KEEP_SPACE.has(top.n)) top.c.push(decode(t)); break }
    if (lt > i) {
      const t = src.slice(i, lt)
      if (KEEP_SPACE.has(top.n) || t.trim()) top.c.push(decode(t))
    }
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? L : e + 3; continue }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt)
      top.c.push(src.slice(lt + 9, e < 0 ? L : e))
      i = e < 0 ? L : e + 3
      continue
    }
    if (src[lt + 1] === '?') { const e = src.indexOf('?>', lt); i = e < 0 ? L : e + 2; continue }
    if (src[lt + 1] === '!') { const e = src.indexOf('>', lt); i = e < 0 ? L : e + 1; continue }
    let j = lt + 1, q = ''
    while (j < L) {
      const ch = src[j]
      if (q) { if (ch === q) q = '' } else if (ch === '"' || ch === "'") q = ch
      else if (ch === '>') break
      j++
    }
    const raw = src.slice(lt + 1, j)
    i = j + 1
    if (raw[0] === '/') { if (stack.length > 1) stack.pop(); continue }
    const self = raw.endsWith('/')
    const body = self ? raw.slice(0, -1) : raw
    const nm = /^[^\s/]+/.exec(body)
    if (!nm) continue
    const el: XEl = { n: nm[0], a: {}, c: [] }
    if (body.length > nm[0].length) {
      ATTR.lastIndex = 0
      let m: RegExpExecArray | null
      const rest = body.slice(nm[0].length)
      while ((m = ATTR.exec(rest))) el.a[m[1]] = decode(m[2] ?? m[3] ?? '')
    }
    top.c.push(el)
    if (!self) stack.push(el)
  }
  const first = root.c.find((x): x is XEl => typeof x !== 'string')
  if (!first) throw new Error('XML vide')
  return first
}

export const isEl = (x: XEl | string | undefined): x is XEl => typeof x === 'object' && x !== null
/** Premier enfant portant ce nom. */
export const kid = (e: XEl | undefined, name: string): XEl | undefined => e?.c.find((x): x is XEl => isEl(x) && x.n === name)
/** Tous les enfants portant ce nom. */
export const kids = (e: XEl | undefined, name: string): XEl[] => (e ? e.c.filter((x): x is XEl => isEl(x) && x.n === name) : [])
export const attr = (e: XEl | undefined, name: string): string | undefined => e?.a[name]
/** Tout le texte contenu (descendants compris). */
export const textOf = (e: XEl): string => e.c.map(x => (typeof x === 'string' ? x : textOf(x))).join('')
