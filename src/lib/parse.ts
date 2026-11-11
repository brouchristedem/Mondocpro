import { CELL_BR, type Block } from './types'

const SPECIAL = /^(introduction|conclusion|remerciements?|d[ée]dicaces?|r[ée]sum[ée]|abstract|sommaire|bibliographie|webographie|r[ée]f[ée]rences( bibliographiques)?|sources?( (utilis[ée]es?|consult[ée]es?|principales))?|annexes?|glossaire|avant-propos|pr[ée]face|postface|liste des .+|table des (mati[èe]res|illustrations|figures|tableaux)|sigles et abr[ée]viations|abr[ée]viations)( g[ée]n[ée]rale)?$/i
/** « Introduction et diagnostic du cas », « Conclusion du chapitre » : titres de début et de fin, même avec un complément. */
const INTRO_X = /^(introduction|conclusion)( g[ée]n[ée]rale)? (et|du|de|des|au|aux|à|sur)\b[^.:;!?]{3,60}$/i
/** « Recommandation 1 : … », « Objectif 2 : … » : sous-titres numérotés, un cran sous le titre en cours. */
const ITEM = /^(recommandations?|propositions?|pistes?|solutions?|objectifs?|constats?|hypoth[èe]ses?|enjeux?|avantages?|inconv[ée]nients?|limites?)\s+(\d{1,2}|[IVX]{1,4})\s*[:.\-–—)]\s*\S/i
const PART = /^(partie|titre|livre|exercice|annexe|probl[eè]me|cas pratique)\s+(\d{1,2}|[IVXLC]{1,5}|[A-Z])\b/i
const CHAP = /^(chapitre|chap\.|section|question|[ée]tape|fiche|s[ée]quence|activit[ée]|travail|axe|unit[ée]|le[çc]on|article)\s+(\d{1,3}|[IVXLC]{1,5}|[A-Z])\b/i
const NUMH = /^(\d{1,2}(?:\.\d{1,2}){0,3})(?:(\s*(?:\.-|[.)\-–—/°]))|(\s))\s*(\S.*)$/
const ROMANH = /^([IVX]{1,5})\s*(?:\.-|[.)\-–—/])\s*(\S.*)$/
const LETTERH = /^([A-Z])\s*(?:[.)\-–—/])\s+(\S.*)$/
const CAPTION = /^tableau\s*\d*\s*[:.\-–—]?\s*(.*)$/i
const HR = /^([-*_])(\s*\1){2,}$/
/** Numéro d'une ligne « 3. texte » ou « 3) texte » (sinon null). */
const listNo = (l: string): number | null => { const m = l.match(/^(\d{1,2})[.)]\s+\S/); return m ? Number(m[1]) : null }
const UPPER_START = /^[A-ZÀ-ÝŒ«“"‘(*\d]/
const ROMAN_VAL: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20 }
const words = (t: string) => t.trim().split(/\s+/).length

type Kind = 'part' | 'chap' | 'roman' | 'letter' | 'dec' | 'special' | 'caps' | 'plain' | 'item'
export interface Head { kind: Kind; depth: number; rank: number; text: string }
/** Rang : plus il est petit, plus le titre est haut (PARTIE > CHAPITRE > I. > A. > 1. > 1.1 > 1.1.1 > titre sans numéro). */
const RANK = { part: 0, chap: 1, roman: 2, letter: 3, dec: 4, item: 6, special: 0, caps: 0, plain: 9 } as const

/** Ce que le document contient déjà : sert à trancher les cas ambigus (« 1 Titre » sans point, « I. » romain ou lettre, « C. » initiale…). */
export interface Ctx { letters: Set<string>; romans: Set<number>; plain: Set<number>; parents: Set<number>; delim: Set<number> }
export function scan(lines: string[]): Ctx {
  const c: Ctx = { letters: new Set(), romans: new Set(), plain: new Set(), parents: new Set(), delim: new Set() }
  for (const raw of lines) {
    const t = raw.replace(/^(\*\*|__)(.+)\1$/, '$2').trim()
    if (!t || t.length > 120 || raw.includes('\t') || t.includes('|')) continue
    let m = t.match(NUMH)
    if (m && UPPER_START.test(m[4])) {
      const parts = m[1].split('.')
      if (parts.length > 1) c.parents.add(Number(parts[0]))
      else if (m[2]) c.delim.add(Number(parts[0]))
      else if (!m[2] && !/[.;,:]$/.test(t)) c.plain.add(Number(parts[0]))
      continue
    }
    if ((m = t.match(ROMANH)) && UPPER_START.test(m[2]) && ROMAN_VAL[m[1]]) c.romans.add(ROMAN_VAL[m[1]])
    if ((m = t.match(LETTERH)) && UPPER_START.test(m[2])) c.letters.add(m[1])
  }
  return c
}
const prevL = (l: string) => String.fromCharCode(l.charCodeAt(0) - 1)
const nextL = (l: string) => String.fromCharCode(l.charCodeAt(0) + 1)

/**
 * Reconnaît un titre ET son niveau logique à partir de la seule ligne (+ contexte du document).
 * `iso` = ligne seule entre deux lignes vides ; `loose` = autoriser les titres sans numérotation (MAJUSCULES, gras, ligne courte isolée).
 */
export function headOf(raw: string, ctx?: Ctx, iso = false, loose = true, nextLong = false, edge = iso): Head | null {
  let line = raw.trim()
  const bold = line.match(/^(\*\*|__)(.+?)\1$/)
  if (bold) line = bold[2].trim().replace(/\*\*/g, '')
  if (!line || line.length > 120 || HR.test(line)) return null
  const core = line.replace(/[\s:.\-–—]+$/, '')
  if (SPECIAL.test(core) || INTRO_X.test(core)) return { kind: 'special', depth: 1, rank: 0, text: line.replace(/[\s:]+$/, '') }
  if (/[;,:]$/.test(line)) return null
  const period = /[.…]$/.test(line)
  if (period) {
    // « 2. Citez les étapes… humanitaire. » : une question numérotée qui finit par un point reste un titre si ses voisines « 1. » / « 3. » existent
    const nm = line.match(/^(\d{1,2})[.)]\s/)
    const sib = !!(nm && ctx && (ctx.delim.has(Number(nm[1]) - 1) || ctx.delim.has(Number(nm[1]) + 1)))
    if (!(edge && (words(line) <= 10 || (sib && words(line) <= 16)))) return null
  }

  let m: RegExpMatchArray | null
  if ((m = line.match(PART)) && !/[a-z]/.test(m[2])) return { kind: 'part', depth: 1, rank: RANK.part, text: line }
  if ((m = line.match(CHAP)) && !/[a-z]/.test(m[2])) return { kind: 'chap', depth: 1, rank: RANK.chap, text: line }
  if (ITEM.test(line) && words(line) <= 16 && !/[a-z]/.test(line.match(ITEM)![2])) return { kind: 'item', depth: 1, rank: RANK.item, text: line }

  if ((m = line.match(NUMH))) {
    const depth = m[1].split('.').length
    const n = Number(m[1].split('.')[0])
    const hasDelim = !!m[2]
    if (UPPER_START.test(m[4]) && words(m[4]) <= 20) {
      if (depth > 1 || hasDelim) return { kind: 'dec', depth, rank: RANK.dec + depth - 1, text: line }
      // « 1 Titre » sans ponctuation : titre seulement si le document a aussi « 2 … » / « 1.1 … »
      if (ctx && (ctx.plain.has(n - 1) || ctx.plain.has(n + 1) || ctx.parents.has(n))) return { kind: 'dec', depth: 1, rank: RANK.dec, text: line }
    }
    return null
  }

  const rm = line.match(ROMANH), lm = line.match(LETTERH)
  if (rm && UPPER_START.test(rm[2]) && ROMAN_VAL[rm[1]] && words(rm[2]) <= 20) {
    const v = ROMAN_VAL[rm[1]], L = rm[1]
    const asLetter = L.length === 1 && ctx && (ctx.letters.has(prevL(L)) || ctx.letters.has(nextL(L))) && !(ctx.romans.has(v - 1) || ctx.romans.has(v + 1))
    if (!asLetter && (!ctx || ctx.romans.has(v - 1) || ctx.romans.has(v + 1))) return { kind: 'roman', depth: 1, rank: RANK.roman, text: line }
    if (asLetter) return { kind: 'letter', depth: 1, rank: RANK.letter, text: line }
  } else if (lm && UPPER_START.test(lm[2]) && !/^[A-Z]\./.test(lm[2]) && words(lm[2]) <= 20) {
    const L = lm[1]
    if (!ctx || (L === 'A' ? ctx.letters.has('B') : ctx.letters.has(prevL(L)) || ctx.letters.has(nextL(L)))) return { kind: 'letter', depth: 1, rank: RANK.letter, text: line }
  }

  if (!loose) return null
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (letters.length >= 4 && line.length <= 80 && letters === letters.toUpperCase() && !period) return { kind: 'caps', depth: 1, rank: RANK.caps, text: line }
  // titre sans numérotation : ligne courte, seule entre deux lignes vides, suivie d'un vrai texte (ou en gras)
  const okShape = UPPER_START.test(line) && words(line) <= 12 && line.length <= 95 && !period && !/^[-•*–]/.test(line) && !CAPTION.test(line) && !/:\s*\S/.test(line) && !/^\d/.test(line)
  if (ctx && okShape && (bold || (iso && nextLong))) return { kind: 'plain', depth: 1, rank: RANK.plain, text: line }
  return null
}
/** Compatibilité (sommaire collé, page de garde) : le genre de titre d'une ligne, sans contexte. */
export const kindOf = (line: string): Kind | null => headOf(line, undefined, false, true)?.kind ?? null

/** « Réponse : … », « Finalité : … » : une ligne qui commence par une courte étiquette devient son propre paragraphe, étiquette en gras. */
const LABEL = /^([A-ZÀ-Ý][^:.;!?«»"()\d]{0,34}?)\s*:\s+(\S.*)$/
const labelOf = (l: string): RegExpMatchArray | null => {
  const m = l.match(LABEL)
  return m && m[1].trim().split(/\s+/).length <= 5 && !CAPTION.test(l) && !m[1].includes('*') ? m : null
}
const ANSWER = /^(r[ée]ponses?|justification|solution|corrig[ée]|explication)\s*:/i
/** Item de liste collé sans espace après le numéro (« 1.la fourniture… »). */
const NOSPACE_ITEM = /^(\d{1,2})[.)]([A-Za-zÀ-ÿ«"'’])/

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

/* ---------- tableaux copiés depuis Word : cellules à puces, organigramme, titre du document ---------- */
const BULLET = /^[•·▪●■◦○▫]\s*\S/
const isBullet = (l: string) => BULLET.test(l.trim())
/** Repère de cellule fusionnée (invisible) : ajouté aux lignes d'organigramme, retiré à la création du tableau. */
const MERGED = '\u200b'

/**
 * Word copie une cellule à plusieurs paragraphes sur plusieurs lignes, la cellule suivante commençant sur la
 * dernière ligne après une tabulation (« • Inventaires ⇥ • Affectations »). Sous une ligne d'en-tête à n cellules,
 * on recolle ces lignes en UNE ligne de n cellules, les puces d'une même cellule séparées par un saut de ligne.
 */
export function joinCellLines(lines: string[]): string[] {
  const out: string[] = []
  const skip = (j: number) => { while (j < lines.length && !lines[j].trim()) j++; return j }
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i]
    const cols = head.includes('\t') && !head.includes('|') && !isBullet(head) ? head.split('\t').length : 0
    let j = skip(i + 1)
    if (cols >= 2 && j < lines.length && isBullet(lines[j])) {
      const cells: string[][] = Array.from({ length: cols }, () => [])
      let k = 0, ok = true, last = j
      while (j < lines.length && isBullet(lines[j])) {
        const parts = lines[j].split('\t')
        if (k + parts.length - 1 > cols - 1) { ok = false; break }
        cells[k].push(parts[0].trim().replace(/^[•·▪●■◦○▫]\s*/, '• '))
        for (let p = 1; p < parts.length; p++) { k++; cells[k].push(parts[p].trim().replace(/^[•·▪●■◦○▫]\s*/, '• ')) }
        last = j
        j = skip(j + 1)
      }
      if (ok && k === cols - 1 && cells.every(c => c.length)) {
        out.push(head, cells.map(c => c.join(CELL_BR)).join('\t'))
        i = last
        continue
      }
    }
    out.push(head)
  }
  return out
}

/** Ligne courte en MAJUSCULES sans ponctuation finale : « DIRECTION GÉNÉRALE ». */
const capsLine = (l: string) => {
  const t = l.trim()
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, '')
  return t.length >= 4 && t.length <= 90 && letters.length >= 4 && letters === letters.toUpperCase() && !/[.:;!?,]$/.test(t) && !t.includes('\t') && !t.includes('|') && !/^#{1,4}\s/.test(t) && !/^[-•*–]\s/.test(t)
}
const plainCaps = (l: string) => capsLine(l) && headOf(l, undefined, false, false) === null

/**
 * Titre du document : au moins deux lignes en MAJUSCULES tout au début (+ un sous-titre court).
 * Ce n'est pas un chapitre : centré, hors sommaire, et les titres numérotés qui suivent restent au 1er niveau.
 */
export function leadingTitle(lines: string[]): { end: number; items: { text: string; sub?: boolean }[] } | null {
  let j = 0
  while (j < lines.length && !lines[j].trim()) j++
  const caps: string[] = []
  while (j < lines.length) {
    const t = lines[j].trim()
    if (!t) { j++; continue }
    if (plainCaps(t) && !SPECIAL.test(t.replace(/[\s:.\-–—]+$/, ''))) { caps.push(t); j++ } else break
  }
  if (caps.length < 2 || caps.length > 4) return null
  const items: { text: string; sub?: boolean }[] = caps.map(text => ({ text }))
  while (j < lines.length && !lines[j].trim()) j++
  if (j < lines.length) {
    const t = lines[j].trim()
    if (!isRowLine(lines[j]) && words(t) <= 14 && t.length <= 110 && !/[.:;!?,]$/.test(t) && !/^[-•*–\d#]/.test(t) && headOf(t, undefined, false, false) === null && !labelOf(t)) { items.push({ text: t, sub: true }); j++ }
  }
  return { end: j, items }
}

/**
 * Organigramme copié depuis Word : les cases du haut (« DIRECTION GÉNÉRALE »…) arrivent sur des lignes seules, juste
 * avant la 1re ligne à plusieurs colonnes. Au moins deux lignes en MAJUSCULES collées à un tableau = lignes fusionnées de ce tableau.
 */
export function markTitleRows(lines: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (plainCaps(lines[i])) {
      const run: string[] = []
      let j = i
      while (j < lines.length) {
        if (!lines[j].trim()) { j++; continue }
        if (plainCaps(lines[j]) && !SPECIAL.test(lines[j].trim())) { run.push(lines[j].trim()); j++ } else break
      }
      if (run.length >= 2 && j < lines.length && lines[j].includes('\t') && lines[j].split('\t').filter(c => c.trim()).length >= 2) {
        for (const r of run) out.push(`${r}\t${MERGED}`)
        i = j - 1
        continue
      }
    }
    out.push(lines[i])
  }
  return out
}

export function parse(src: string): Block[] {
  let lines = unflattenTables(alignColumns(joinCellLines(stripToc(src.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''))))))
  const out: Block[] = []
  const lead = leadingTitle(lines)
  if (lead) { for (const x of lead.items) out.push({ t: 'title', text: x.text, sub: x.sub }); lines = lines.slice(lead.end) }
  lines = markTitleRows(lines)
  const hasBlank = lines.some(l => l.trim() === '')
  const explicit = lines.some(l => /^#{1,4}\s+\S/.test(l))
  const ctx = scan(lines)

  // niveaux : hiérarchie construite au fil du texte (PARTIE > CHAPITRE > I. > A. > 1. > 1.1 …), sans jamais sauter de niveau
  const stack: number[] = []
  const levelFor = (h: Head): 1 | 2 | 3 | 4 => {
    if (h.kind === 'special') { stack.length = 0; return 1 } // Introduction, Conclusion… : toujours au 1er niveau, et repartent de zéro
    while (stack.length && stack[stack.length - 1] >= h.rank) stack.pop()
    const level = stack.length + 1 // toujours un cran sous le titre parent encore ouvert
    stack.push(h.rank)
    return Math.min(level, 4) as 1 | 2 | 3 | 4
  }
  // un texte avec lignes vides ET lignes courtes vient d'un copier-coller à retours de ligne automatiques : on recolle les lignes d'un même paragraphe
  const maxLen = lines.reduce((m, l) => (l.includes('\t') || l.includes('|') ? m : Math.max(m, l.trim().length)), 0)
  const soft = hasBlank && maxLen <= 140
  const nextIdx = (i: number) => { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; return j }
  const nextLine = (i: number) => { const j = nextIdx(i); return j < lines.length ? lines[j].trim() : '' }
  const isoAt = (i: number) => hasBlank && (i === 0 || !lines[i - 1].trim()) && (i === lines.length - 1 || !lines[i + 1].trim())
  const longAfter = (i: number) => {
    const j = nextIdx(i)
    if (j >= lines.length) return false
    const t = lines[j].trim()
    return t.length >= 40 || (t.length >= 20 && /[.!?»)]$/.test(t)) || isRowLine(lines[j]) || CAPTION.test(t) || /^([-•*–])\s+\S/.test(t) || headOf(t, ctx, isoAt(j), true, false) !== null
  }

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
        const merged = tbl.map((r, i) => (r.length >= 2 && r.slice(1).every(c => c === MERGED) ? i : -1)).filter(i => i >= 0)
        const norm = tbl.map(r => Array.from({ length: n }, (_, c) => (r[c] === MERGED ? '' : r[c] ?? '')))
        // ligne de titres (toutes les cellules remplies, sans puces) juste au-dessus d'une ligne à puces : titres de colonnes d'un organigramme
        const heads = norm.map((r, i) => (i > 0 && !merged.includes(i) && i + 1 < norm.length && r.every(c => c.trim() && !c.includes(CELL_BR)) && norm[i + 1].some(c => c.startsWith('• ')) ? i : -1)).filter(i => i >= 0)
        let caption: string | undefined
        const prev = out[out.length - 1]
        if (prev?.t === 'p' && CAPTION.test(prev.text) && prev.text.length < 160) { caption = prev.text.match(CAPTION)![1]; out.pop() }
        else {
          let k = j
          while (k < lines.length && !lines[k].trim()) k++
          if (k < lines.length && CAPTION.test(lines[k].trim()) && lines[k].length < 160 && !isRowLine(lines[k])) { caption = lines[k].trim().match(CAPTION)![1]; j = k + 1 }
        }
        out.push({ t: 'table', rows: norm, caption, ...(merged.length ? { merged } : {}), ...(heads.length ? { heads } : {}) })
        i = j - 1
        continue
      }
    }

    const md = line.match(/^(#{1,4})\s+(.*)$/)
    if (md) {
      flush()
      const L = md[1].length as 1 | 2 | 3 | 4
      stack.length = 0; for (let k = 0; k < L; k++) stack.push(-1) // les titres numérotés qui suivent se placent sous ce titre
      out.push({ t: 'h', level: L, text: md[2] }); continue
    }

    if (/^([-•*–])\s+\S/.test(line)) { flush(); out.push({ t: 'li', text: line.replace(/^([-•*–])\s+/, '') }); continue }

    const ns = line.match(NOSPACE_ITEM)
    if (ns) { flush(); out.push({ t: 'p', text: `${ns[1]}. ${line.slice(ns[0].length - 1)}` }); continue }

    // liste numérotée (1. … 2. … sur des lignes qui se suivent) : un paragraphe par ligne, jamais un titre
    const n = listNo(line)
    if (n !== null && (listNo((lines[i - 1] ?? '').trim()) === n - 1 || listNo((lines[i + 1] ?? '').trim()) === n + 1) && !isoAt(i)) {
      flush(); out.push({ t: 'p', text: line }); continue
    }
    // question numérotée suivie de « Réponse : … » : énoncé en gras, pas un titre (sinon le sommaire se remplit de questions)
    if (n !== null && ANSWER.test(nextLine(i))) { flush(); out.push({ t: 'p', text: `**${line}**` }); continue }

    const prevShort = (() => { let k = i - 1; while (k >= 0 && !lines[k].trim()) k--; const t = k >= 0 ? lines[k].trim() : ''; return t.length > 0 && t.length < 40 && !/[.!?:;»)]$/.test(t) && !isRowLine(lines[k]) && headOf(t, ctx, isoAt(k), true, false) === null })()
    const h = headOf(line, ctx, isoAt(i), !explicit, longAfter(i) && !prevShort, hasBlank && (i === 0 || !lines[i - 1].trim()))
    if (h) { flush(); out.push({ t: 'h', level: levelFor(h), text: h.text }); continue }

    const lb = labelOf(line)
    const text = lb ? `**${lb[1].trim()} :** ${lb[2]}` : line
    if (soft) {
      if (lb && para.length && /[.!?»:;)]$/.test(para[para.length - 1])) flush()
      para.push(text); if (line.endsWith(';')) flush() // « ; » en fin de ligne = élément d'une énumération
    } else out.push({ t: 'p', text })
  }
  flush()
  return out
}
