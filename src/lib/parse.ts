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
const isPipeRow = (l: string) => /^\|.*\|$/.test(l.trim()) && l.trim().length > 2
/** Une tabulation en tout début de ligne est un retrait (paragraphe), pas une colonne. */
const isRowLine = (l: string) => l.replace(/^\t+/, '').includes('\t') || isPipeRow(l)
/** Ligne « | --- | :---: | » d'un tableau Markdown. Une ligne de tirets en tabulations (« - ⇥ - ») est une vraie ligne de données. */
const isSeparator = (l: string) => /^\|?[ :\-|]+\|?$/.test(l.trim()) && l.includes('-') && l.includes('|')
/** Tableau Markdown sans barre en début/fin de ligne : reconnu seulement si la ligne suivante est un séparateur. */
const isLooseHeader = (lines: string[], i: number) =>
  lines[i].includes('|') && !lines[i].includes('\t') && i + 1 < lines.length && isSeparator(lines[i + 1])
const LIST_MARK = /^(\d{1,2}[.)]|[a-z][.)]|[•·▪●■◦○\-*–—])$/i

/**
 * Retire un sommaire collé avec le texte : il est regénéré automatiquement.
 * - points de suite (« Titre ........ 12 ») : toujours retiré ;
 * - tabulation ou grands espaces (« Titre ⇥ 12 ») : retiré seulement si le début de ligne est un vrai titre
 *   (INTRODUCTION, CHAPITRE 1, I., 1.1…) ou une légende « Tableau n ». Sinon c'est une ligne de tableau.
 */
const TOC_DOTS = /(\.{3,}|…{2,}|(\. ){3,})\s*(\d{1,3}|[ivxlc]{1,6})\s*$/i
const TOC_SEP = /^([^\t]*\S)(?:\t+| {3,})(\d{1,3}|[ivxlc]{1,6})$/i
const TOC_TITLE = /^(sommaire|table des mati[èe]res|liste des tableaux)\s*:?$/i
function isTocLine(l: string): boolean {
  const t = l.trim()
  if (!t || t.length >= 140 || t.includes('|')) return false
  if (TOC_DOTS.test(t)) return true
  const m = t.match(TOC_SEP)
  if (!m) return false
  const head = m[1].trim()
  const k = kindOf(head)
  return (k !== null && k !== 'caps') || CAPTION.test(head)
}
export function stripToc(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (isTocLine(lines[i])) continue
    if (TOC_TITLE.test(lines[i].trim())) {
      let k = i + 1
      while (k < lines.length && !lines[k].trim()) k++
      if (k < lines.length && isTocLine(lines[k])) continue
    }
    out.push(lines[i])
  }
  return out
}

export function parse(src: string): Block[] {
  const lines = stripToc(src.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')))
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

    const loose = isLooseHeader(lines, i)
    if (isRowLine(raw) || loose) {
      const rows: string[][] = []
      let j = i
      const isRow = (l: string) => isRowLine(l) || (loose && l.includes('|') && l.trim() !== '')
      const collect = (gaps: boolean) => {
        rows.length = 0
        j = i
        while (j < lines.length) {
          if (isRow(lines[j])) { if (!isSeparator(lines[j])) rows.push(splitRow(lines[j])); j++ }
          else if (gaps && !lines[j].trim()) {
            // Word/PDF collent parfois une ligne vide entre deux lignes d'un même tableau
            let k = j
            while (k < lines.length && !lines[k].trim()) k++
            if (k < lines.length && isRow(lines[k])) j = k
            else break
          } else break
        }
      }
      collect(false)
      if (rows.length < 2) collect(true)
      // liste numérotée / à puces copiée depuis Word (« 1. ⇥ texte ») : ce n'est pas un tableau
      const trimmed = rows.map(r => (r[0] === '' ? r.slice(1) : r))
      if (rows.length >= 2 && trimmed.every(r => r.length === 2 && LIST_MARK.test(r[0]))) {
        flush()
        for (const r of trimmed) out.push(/^[\d a-z]*[.)]$/i.test(r[0]) ? { t: 'p', text: `${r[0]} ${r[1]}` } : { t: 'li', text: r[1] })
        i = j - 1
        continue
      }
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
