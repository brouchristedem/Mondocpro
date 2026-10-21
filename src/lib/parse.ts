import type { Block } from './types'

const SPECIAL = /^(introduction|conclusion|remerciements?|d[ée]dicace|r[ée]sum[ée]|abstract|sommaire|bibliographie|webographie|annexes?|avant-propos|liste des .+|table des mati[èe]res)( g[ée]n[ée]rale)?$/i
const CHAP = /^(chapitre|partie|section)\s+[\dIVXLC]+\b/i
const ROMAN = /^(I{1,3}|IV|VI{0,3}|IX|X)\s*[.)\-–]\s+\S/
const LETTER = /^[A-Z]\s*[.)]\s+\S/
const DEC1 = /^\d{1,2}\s*[.)]\s+\S/
const DEC2 = /^\d{1,2}\.\d{1,2}\.?\s+\S/
const DEC3 = /^\d{1,2}\.\d{1,2}\.\d{1,2}\.?\s+\S/
const CAPTION = /^tableau\s*\d*\s*[:.\-–—]?\s*(.*)$/i

const ORDER = ['chap', 'roman', 'letter', 'dec1', 'dec2', 'dec3'] as const
type Kind = (typeof ORDER)[number] | 'special' | 'caps'

function kindOf(line: string): Kind | null {
  if (line.length > 100 || /[.;,:]$/.test(line)) return null
  if (SPECIAL.test(line)) return 'special'
  if (CHAP.test(line)) return 'chap'
  if (DEC3.test(line)) return 'dec3'
  if (DEC2.test(line)) return 'dec2'
  if (ROMAN.test(line)) return 'roman'
  if (LETTER.test(line)) return 'letter'
  if (DEC1.test(line)) return 'dec1'
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (letters.length >= 4 && line.length <= 80 && letters === letters.toUpperCase()) return 'caps'
  return null
}

function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  return line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}
const isRowLine = (l: string) => l.includes('\t') || (/^\|.*\|$/.test(l.trim()) && l.trim().length > 2)
const isSeparator = (l: string) => /^\|?[\s:\-|]+\|?$/.test(l.trim()) && l.includes('-')

export function parse(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''))
  const hasBlank = lines.some(l => l.trim() === '')
  const explicit = lines.some(l => /^#{1,4}\s+\S/.test(l))

  // niveaux automatiques : seules les familles présentes comptent
  const present = new Set<Kind>()
  if (!explicit) for (const l of lines) { const k = kindOf(l.trim()); if (k && k !== 'special' && k !== 'caps') present.add(k) }
  const rank = ORDER.filter(k => present.has(k))
  const levelFor = (k: Kind): 1 | 2 | 3 | 4 =>
    k === 'special' || k === 'caps' ? 1 : (Math.min(rank.indexOf(k) + 1, 4) as 1 | 2 | 3 | 4)

  const out: Block[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = [] } }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) { flush(); continue }

    if (isRowLine(raw)) {
      const rows: string[][] = []
      let j = i
      while (j < lines.length && isRowLine(lines[j])) { if (!isSeparator(lines[j])) rows.push(splitRow(lines[j])); j++ }
      if (rows.length >= 2 && Math.max(...rows.map(r => r.length)) >= 2) {
        flush()
        const n = Math.max(...rows.map(r => r.length))
        const norm = rows.map(r => Array.from({ length: n }, (_, c) => r[c] ?? ''))
        let caption: string | undefined
        const prev = out[out.length - 1]
        if (prev?.t === 'p' && CAPTION.test(prev.text) && prev.text.length < 160) { caption = prev.text.match(CAPTION)![1]; out.pop() }
        else {
          let k = j
          while (k < lines.length && !lines[k].trim()) k++
          if (k < lines.length && CAPTION.test(lines[k].trim()) && lines[k].length < 160 && !isRowLine(lines[k])) { caption = lines[k].trim().match(CAPTION)![1]; j = k + 1 }
        }
        out.push({ t: 'table', rows: norm, caption })
        i = j - 1
        continue
      }
    }

    const md = line.match(/^(#{1,4})\s+(.*)$/)
    if (md) { flush(); out.push({ t: 'h', level: md[1].length as 1 | 2 | 3 | 4, text: md[2] }); continue }

    if (/^([-•*–])\s+\S/.test(line)) { flush(); out.push({ t: 'li', text: line.replace(/^([-•*–])\s+/, '') }); continue }

    if (!explicit) {
      const k = kindOf(line)
      if (k) { flush(); out.push({ t: 'h', level: levelFor(k), text: line }); continue }
    }

    if (hasBlank) para.push(line)
    else out.push({ t: 'p', text: line })
  }
  flush()
  return out
}
