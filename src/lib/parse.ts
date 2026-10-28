import type { Block } from './types'

const SPECIAL = /^(introduction|conclusion|remerciements?|d[ée]dicace|r[ée]sum[ée]|abstract|sommaire|bibliographie|webographie|annexes?|avant-propos|liste des .+|table des mati[èe]res)( g[ée]n[ée]rale)?$/i
const CHAP = /^(chapitre|partie|section)\s+[\dIVXLC]+\b/i
const ROMAN = /^(I{1,3}|IV|VI{0,3}|IX|X)\s*[.)\-–]\s+\S/
const LETTER = /^[A-Z]\s*[.)]\s+\S/
const DEC1 = /^\d{1,2}\s*[.)]\s+\S/
const DEC2 = /^\d{1,2}\.\d{1,2}\.?\s+\S/
const DEC3 = /^\d{1,2}\.\d{1,2}\.\d{1,2}\.?\s+\S/
const CAPTION = /^tableau\s*\d*\s*[:.\-–—]?\s*(.*)$/i
const HR = /^([-*_])(\s*\1){2,}$/
/** Numéro d'une ligne « 3. texte » ou « 3) texte » (sinon null). */
const listNo = (l: string): number | null => { const m = l.match(/^(\d{1,2})[.)]\s+\S/); return m ? Number(m[1]) : null }

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

/**
 * Tableau collé dont le saut de ligne entre l'en-tête et la 1re ligne a disparu : la dernière cellule de l'en-tête
 * contient alors aussi la 1re cellule de la ligne suivante (« Tarif unitaireConteneur 20' »), et l'en-tête compte
 * 2m−1 cellules quand les autres lignes en ont m. On recoupe à la jonction minuscule→Majuscule. Sinon : inchangé.
 */
function fixFusedHeader(rows: string[][]): string[][] {
  if (rows.length < 2) return rows
  const lens = rows.slice(1).map(r => r.length)
  const m = [...new Set(lens)].sort((a, b) => lens.filter(x => x === b).length - lens.filter(x => x === a).length)[0]
  if (m < 2 || rows[0].length !== 2 * m - 1) return rows
  const merged = rows[0][m - 1]
  const k = merged.search(/[a-zà-ÿ0-9)'’.%€][A-ZÀ-Ý]/)
  if (k < 0) return rows
  let head = merged.slice(0, k + 1).trim()
  const first = merged.slice(k + 1).replace(/\*\*/g, '').trim() // la 1re ligne n'est pas un en-tête : pas de gras
  if (!head || !first) return rows
  if ((head.match(/\*\*/g) ?? []).length % 2) head += '**'
  return [[...rows[0].slice(0, m - 1), head], [first, ...rows[0].slice(m)], ...rows.slice(1)]
}

const FLAT_CAPTION = /^tableau\s+\d+\b/i
const NUM = /^[-+]?\d[\d\s.,']*\s*(%|€|\$|f|fcfa|xof|h|j|kg|t|m)?$/i
/** Nombre de colonnes d'un tableau « aplati » (une cellule par ligne), ou 0 si rien de cohérent : en-tête sans nombre, colonnes homogènes, au moins une colonne numérique. */
function guessColumns(cells: string[]): number {
  const T = cells.length
  for (let n = 2; n <= Math.min(12, T / 3); n++) {
    if (T % n) continue
    if (cells.slice(0, n).some(c => NUM.test(c))) continue
    let ok = true, numeric = false
    for (let c = 0; c < n && ok; c++) {
      const kinds = new Set<boolean>()
      for (let r = 1; r < T / n; r++) kinds.add(NUM.test(cells[r * n + c]))
      if (kinds.size > 1) ok = false
      if (kinds.has(true)) numeric = true
    }
    if (ok && numeric) return n
  }
  return 0
}
/**
 * Un tableau copié depuis une application ou un site arrive parfois « aplati » : une cellule par ligne, sous sa légende
 * « Tableau n : … ». On le reconnaît à la légende, puis on devine le nombre de colonnes (voir guessColumns) et on le
 * remet en lignes séparées par des tabulations, que le reste du parseur sait lire.
 */
function unflattenTables(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i])
    const cap = lines[i].trim()
    if (!FLAT_CAPTION.test(cap) || cap.length >= 160 || isRowLine(lines[i])) continue
    const cells: string[] = [], at: number[] = []
    let j = i + 1
    for (; j < lines.length; j++) {
      const t = lines[j].trim()
      if (!t) continue
      const k = kindOf(t)
      if (isRowLine(lines[j]) || /^#{1,4}\s/.test(t) || FLAT_CAPTION.test(t) || t.length > 80 || /[.!?]$/.test(t) || (k !== null && k !== 'caps')) break
      cells.push(t); at.push(j)
    }
    // si un petit texte sans ponctuation suit le tableau, il a pu être pris pour une cellule : on essaie sans lui
    for (let drop = 0; drop <= 2 && cells.length - drop >= 6; drop++) {
      const use = cells.slice(0, cells.length - drop)
      const n = guessColumns(use)
      if (!n) continue
      for (let r = 0; r < use.length / n; r++) out.push(use.slice(r * n, (r + 1) * n).join('\t'))
      i = at[use.length - 1] // les lignes écartées (drop) sont relues comme du texte normal
      break
    }
  }
  return out
}


/**
 * Tableaux « à plat » sans tabulation : colonnes alignées avec plusieurs espaces (texte copié d'un PDF, d'un mail, d'un tableur
 * exporté en texte) ou séparées par des points-virgules (CSV). On les remet en lignes à tabulations, que le reste du parseur lit.
 * Règles prudentes pour ne jamais transformer un paragraphe en tableau : au moins 3 lignes de suite avec le même nombre de
 * cellules (2 à 8), cellules courtes et sans ponctuation de phrase ; avec des espaces, au moins une colonne chiffrée.
 */
function splitAligned(raw: string): { cells: string[]; sep: 'space' | 'semi' } | null {
  const t = raw.replace(/ /g, ' ').trim()
  if (!t || t.length > 160 || t.includes('\t') || t.includes('|') || /^#{1,4}\s/.test(t)) return null
  if (t.includes(';')) {
    const c = t.split(';').map(x => x.trim())
    return c.length >= 2 && c.length <= 10 && c.every(x => x && x.length <= 50) ? { cells: c, sep: 'semi' } : null
  }
  const c = t.split(/ {2,}/).map(x => x.trim())
  return c.length >= 2 && c.length <= 8 && c.every(x => x.length <= 38 && !/[.!?;:]$/.test(x)) ? { cells: c, sep: 'space' } : null
}
export function alignColumns(lines: string[]): string[] {
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const first = splitAligned(lines[i])
    if (!first) { out.push(lines[i]); i++; continue }
    const run: string[][] = [first.cells]
    let j = i + 1
    while (j < lines.length) {
      const nx = splitAligned(lines[j])
      if (!nx || nx.sep !== first.sep || nx.cells.length !== first.cells.length) break
      run.push(nx.cells); j++
    }
    const body = run.slice(1)
    const ok = run.length >= 3 && (first.sep === 'semi' || first.cells.every(c => !NUM.test(c)) && first.cells.some((_, c) => body.every(r => NUM.test(r[c]))))
    if (ok) { for (const r of run) out.push(r.join('\t')); i = j } else { out.push(lines[i]); i++ }
  }
  return out
}

export function parse(src: string): Block[] {
  const lines = unflattenTables(alignColumns(stripToc(src.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')))))
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
    // filet Markdown (---, ***, ___, - - -) : séparateur, jamais du texte à imprimer
    if (HR.test(line) && !raw.includes('\t')) { flush(); continue }

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
      const tbl = fixFusedHeader(rows)
      if (tbl.length >= 2 && Math.max(...tbl.map(r => r.length)) >= 2) {
        flush()
        const n = Math.max(...tbl.map(r => r.length))
        const norm = tbl.map(r => Array.from({ length: n }, (_, c) => r[c] ?? ''))
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

    // liste numérotée (1. … 2. … sur des lignes qui se suivent) : un paragraphe par ligne, jamais un titre
    const n = listNo(line)
    if (n !== null && (listNo((lines[i - 1] ?? '').trim()) === n - 1 || listNo((lines[i + 1] ?? '').trim()) === n + 1)) {
      flush(); out.push({ t: 'p', text: line }); continue
    }

    if (!explicit) {
      const k = kindOf(line)
      if (k) { flush(); out.push({ t: 'h', level: levelFor(k), text: line }); continue }
    }

    if (hasBlank) { para.push(line); if (line.endsWith(';')) flush() } // « ; » en fin de ligne = élément d'une énumération
    else out.push({ t: 'p', text: line })
  }
  flush()
  return out
}
