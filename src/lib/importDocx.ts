import JSZip from 'jszip'
import { CELL_BR } from './types'
import { attr, isEl, kid, kids, parseXml, textOf, type XEl } from './xml'

/**
 * Import d'un fichier Word (.docx) : le fichier est lu dans le navigateur (rien n'est envoyé nulle part) et converti
 * en texte que le site sait déjà mettre en page : titres (# …), listes (• …), tableaux (| a | b |), gras et italique (** et *).
 * On lit la vraie structure du Word (styles de titre, numérotation automatique, fusions de cellules, notes de bas de page,
 * champs, zones de texte, modifications suivies) : rien n'est deviné quand Word le dit déjà.
 */

export class ImportError extends Error {}

export interface ImportResult {
  text: string
  stats: { words: number; headings: number; tables: number; lists: number; notes: number }
  /** Ce que le site ne sait pas reprendre (images, graphiques…), par nombre. */
  skipped: { images: number; charts: number; diagrams: number; other: number }
  warnings: string[]
}

const MERGED = '​' // repère de cellule fusionnée du parseur (voir parse.ts)

/* ------------------------------------------------------------------ styles et numérotation */

interface Style { id: string; name: string; basedOn?: string; outline?: number; numId?: string; ilvl?: number; b?: boolean; i?: boolean }
interface Lvl { fmt: string; text: string; start: number; pStyle?: string }
interface Abs { lvls: Map<number, Lvl> }
interface Num { abs: string; over: Map<number, number> }
interface Field { instr: string; phase: 'instr' | 'result'; skip: boolean }

interface Ctx {
  styles: Map<string, Style>
  abs: Map<string, Abs>
  nums: Map<string, Num>
  counters: Map<string, (number | undefined)[]>
  foot: Map<string, string>
  notes: string[]
  fields: Field[]
  suppressed: boolean
  images: number; charts: number; diagrams: number; other: number
  headingStyles: boolean
}

const on = (e?: XEl): boolean => !!e && !['0', 'false', 'off'].includes((e.a['w:val'] ?? '').toLowerCase())
const tog = (e?: XEl): boolean | undefined => (e ? on(e) : undefined)
const num = (s?: string): number | undefined => { const n = s === undefined ? NaN : parseInt(s, 10); return Number.isFinite(n) ? n : undefined }

function readStyles(root: XEl | null): Map<string, Style> {
  const m = new Map<string, Style>()
  if (!root) return m
  for (const s of kids(root, 'w:style')) {
    const id = attr(s, 'w:styleId')
    if (!id) continue
    const pPr = kid(s, 'w:pPr'), rPr = kid(s, 'w:rPr'), numPr = kid(pPr, 'w:numPr')
    m.set(id, {
      id, name: attr(kid(s, 'w:name'), 'w:val') ?? id, basedOn: attr(kid(s, 'w:basedOn'), 'w:val'),
      outline: num(attr(kid(pPr, 'w:outlineLvl'), 'w:val')),
      numId: attr(kid(numPr, 'w:numId'), 'w:val'), ilvl: num(attr(kid(numPr, 'w:ilvl'), 'w:val')),
      b: tog(kid(rPr, 'w:b')), i: tog(kid(rPr, 'w:i')),
    })
  }
  return m
}

function readNumbering(root: XEl | null, ctx: Ctx) {
  if (!root) return
  for (const a of kids(root, 'w:abstractNum')) {
    const id = attr(a, 'w:abstractNumId')
    if (id === undefined) continue
    const lvls = new Map<number, Lvl>()
    for (const l of kids(a, 'w:lvl')) {
      const il = num(attr(l, 'w:ilvl'))
      if (il === undefined) continue
      lvls.set(il, { fmt: attr(kid(l, 'w:numFmt'), 'w:val') ?? 'decimal', text: attr(kid(l, 'w:lvlText'), 'w:val') ?? '', start: num(attr(kid(l, 'w:start'), 'w:val')) ?? 1, pStyle: attr(kid(l, 'w:pStyle'), 'w:val') })
    }
    ctx.abs.set(id, { lvls })
  }
  for (const n of kids(root, 'w:num')) {
    const id = attr(n, 'w:numId'), abs = attr(kid(n, 'w:abstractNumId'), 'w:val')
    if (id === undefined || abs === undefined) continue
    const over = new Map<number, number>()
    for (const o of kids(n, 'w:lvlOverride')) {
      const il = num(attr(o, 'w:ilvl')), st = num(attr(kid(o, 'w:startOverride'), 'w:val'))
      if (il !== undefined && st !== undefined) over.set(il, st)
    }
    ctx.nums.set(id, { abs, over })
  }
}

function chain(ctx: Ctx, id?: string): Style[] {
  const out: Style[] = []
  // style absent de styles.xml (certains logiciels écrivent le NOM du style, « Heading 1 », à la place de son identifiant) : on le lit tel quel
  let cur = id ? ctx.styles.get(id) ?? { id, name: id } : undefined
  for (let n = 0; cur && n < 20; n++) { out.push(cur); cur = cur.basedOn ? ctx.styles.get(cur.basedOn) : undefined }
  return out
}

const HEADING_NAME = /^(?:heading|titre)\s*([1-9])$/i
const HEADING_ID = /^(?:heading|titre)([1-9])$/i
function styleLevel(ch: Style[]): number {
  for (const s of ch) {
    if (s.outline !== undefined) return s.outline < 9 ? s.outline + 1 : 0
    const m = s.name.match(HEADING_NAME) ?? s.id.match(HEADING_ID)
    if (m) return Number(m[1])
  }
  return 0
}
const TOC_NAME = /^(toc\s*\d|toc heading|table of contents|table des mati|sommaire|table of figures|table des illustrations|index\s*\d|index heading)/i
const isTocStyle = (ch: Style[]) => ch.some(s => TOC_NAME.test(s.name) || /^TOC\d*$/i.test(s.id))
const TOC_TITLE = /^(table des mati[èe]res|sommaire|table of contents|contents|liste des (tableaux|figures|illustrations)|table des (tableaux|figures|illustrations))\s*:?$/i
const SKIP_FIELD = /^\s*(TOC|PAGEREF|PAGE|NUMPAGES|SECTIONPAGES|INDEX|TOA|XE|TC|NOTEREF)\b/i

const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
function fmtNum(n: number, fmt: string): string {
  const letters = (k: number) => { let s = ''; for (let x = k; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(97 + ((x - 1) % 26)) + s; return s }
  const roman = (k: number) => { let s = ''; for (const [v, r] of ROMAN) while (k >= v) { s += r; k -= v } return s }
  switch (fmt) {
    case 'decimalZero': return String(n).padStart(2, '0')
    case 'lowerLetter': return letters(n)
    case 'upperLetter': return letters(n).toUpperCase()
    case 'lowerRoman': return roman(n)
    case 'upperRoman': return roman(n).toUpperCase()
    default: return String(n)
  }
}

type Label = { bullet: true } | { bullet: false; text: string }
/** Le numéro (ou la puce) d'un paragraphe numéroté ; chaque appel fait avancer le compteur, comme Word. */
function label(ctx: Ctx, numId: string, ilvl: number): Label | null {
  const n = ctx.nums.get(numId)
  const abs = n && ctx.abs.get(n.abs)
  if (!n || !abs) return null
  const lv = abs.lvls.get(ilvl)
  if (!lv) return null
  const startOf = (l: number) => n.over.get(l) ?? abs.lvls.get(l)?.start ?? 1
  const key = n.over.size ? `${n.abs}|${numId}` : n.abs
  const cs = ctx.counters.get(key) ?? []
  cs[ilvl] = cs[ilvl] === undefined ? startOf(ilvl) : cs[ilvl]! + 1
  for (let l = ilvl + 1; l < cs.length; l++) cs[l] = undefined
  ctx.counters.set(key, cs)
  if (lv.fmt === 'bullet') return { bullet: true }
  if (lv.fmt === 'none') return { bullet: false, text: '' }
  const text = lv.text.replace(/%(\d)/g, (_, d: string) => {
    const l = Number(d) - 1
    return fmtNum(cs[l] ?? startOf(l), abs.lvls.get(l)?.fmt ?? 'decimal')
  }).trim()
  return { bullet: false, text }
}

/** Numérotation d'un paragraphe : la sienne, sinon celle de son style (titres numérotés « 1.1 »). */
function numFor(ctx: Ctx, pPr: XEl | undefined, sid: string | undefined): { numId: string; ilvl: number } | null {
  const direct = kid(pPr, 'w:numPr')
  const dId = attr(kid(direct, 'w:numId'), 'w:val'), dLv = num(attr(kid(direct, 'w:ilvl'), 'w:val'))
  if (dId === '0') return null
  const ch = chain(ctx, sid)
  const st = ch.find(s => s.numId !== undefined)
  const numId = dId ?? st?.numId
  if (!numId || numId === '0') return null
  let ilvl = dLv ?? (dId === undefined ? st?.ilvl : undefined)
  if (ilvl === undefined) {
    // niveau lié au style côté définition de la liste (pStyle)
    const abs = ctx.abs.get(ctx.nums.get(numId)?.abs ?? '')
    if (abs) for (const [l, lv] of abs.lvls) if (lv.pStyle && ch.some(s => s.id === lv.pStyle)) { ilvl = l; break }
  }
  return { numId, ilvl: ilvl ?? 0 }
}

/* ------------------------------------------------------------------ texte en ligne */

interface Seg { t: string; b: boolean; i: boolean }
type Item =
  | { k: 'h'; level: number; text: string }
  | { k: 'p'; text: string }
  | { k: 'li'; text: string }
  | { k: 'n'; text: string; digit: boolean }
  | { k: 'table'; lines: string[]; flat: string[] }
  | { k: 'toc' }

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' }
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' }
const mapAll = (s: string, m: Record<string, string>) => (s.length > 0 && [...s].every(c => m[c]) ? [...s].map(c => m[c]).join('') : s)

function math(e: XEl): string {
  const sub = (n: string) => { const k = kid(e, n); return k ? math(k) : '' }
  switch (e.n) {
    case 'm:t': return textOf(e)
    case 'm:f': return `(${sub('m:num')})/(${sub('m:den')})`
    case 'm:sSup': return `${sub('m:e')}^${sub('m:sup')}`
    case 'm:sSub': return `${sub('m:e')}_${sub('m:sub')}`
    case 'm:rad': return `√(${sub('m:e')})`
    case 'm:fPr': case 'm:rPr': case 'm:ctrlPr': case 'm:dPr': case 'm:radPr': return ''
    default: return e.c.map(x => (isEl(x) ? math(x) : '')).join('')
  }
}

/** Zone de texte, image, graphique : le texte des zones de texte est repris (après le paragraphe), le reste est compté. */
function scanObject(ctx: Ctx, el: XEl, extra: Item[]) {
  for (const c of el.c) {
    if (!isEl(c)) continue
    if (c.n === 'w:txbxContent') { extra.push(...blocks(ctx, c.c)); continue }
    if (c.n === 'mc:AlternateContent') {
      const mark = () => `${extra.length}|${ctx.images}|${ctx.charts}|${ctx.diagrams}`
      const before = mark()
      const choice = kid(c, 'mc:Choice'), fb = kid(c, 'mc:Fallback')
      if (choice) scanObject(ctx, choice, extra)
      if (fb && mark() === before) scanObject(ctx, fb, extra)
      continue
    }
    if (c.n === 'a:blip' || c.n === 'v:imagedata') ctx.images++
    else if (c.n === 'c:chart') ctx.charts++
    else if (c.n === 'dgm:relIds') ctx.diagrams++
    else if (c.n === 'w:object' || c.n === 'o:OLEObject') ctx.other++
    scanObject(ctx, c, extra)
  }
}

interface Base { b?: boolean; i?: boolean }
function run(ctx: Ctx, r: XEl, base: Base, out: Seg[], extra: Item[]) {
  const rPr = kid(r, 'w:rPr')
  if (on(kid(rPr, 'w:vanish'))) return
  const cs = chain(ctx, attr(kid(rPr, 'w:rStyle'), 'w:val'))
  const b = tog(kid(rPr, 'w:b')) ?? cs.find(s => s.b !== undefined)?.b ?? base.b ?? false
  const i = tog(kid(rPr, 'w:i')) ?? cs.find(s => s.i !== undefined)?.i ?? base.i ?? false
  const caps = on(kid(rPr, 'w:caps'))
  const va = attr(kid(rPr, 'w:vertAlign'), 'w:val')
  let buf = ''
  const flush = () => {
    if (!buf) return
    let t = buf
    buf = ''
    if (caps) t = t.toUpperCase()
    if (va === 'superscript') t = mapAll(t, SUP)
    else if (va === 'subscript') t = mapAll(t, SUB)
    out.push({ t, b, i })
  }
  const hidden = () => ctx.fields.some(f => f.phase === 'instr' || f.skip)
  for (const c of r.c) {
    if (!isEl(c)) continue
    switch (c.n) {
      case 'w:t': if (hidden()) { if (ctx.fields.some(f => f.skip)) ctx.suppressed = true } else buf += textOf(c); break
      case 'w:tab': case 'w:ptab': if (!hidden()) buf += ' '; break
      case 'w:br': if (!hidden() && !['page', 'column'].includes(attr(c, 'w:type') ?? '')) { flush(); out.push({ t: '\n', b: false, i: false }) } break
      case 'w:cr': if (!hidden()) { flush(); out.push({ t: '\n', b: false, i: false }) } break
      case 'w:noBreakHyphen': if (!hidden()) buf += '-'; break
      case 'w:instrText': { const f = ctx.fields[ctx.fields.length - 1]; if (f && f.phase === 'instr') f.instr += textOf(c); break }
      case 'w:fldChar': {
        const t = attr(c, 'w:fldCharType')
        if (t === 'begin') ctx.fields.push({ instr: '', phase: 'instr', skip: false })
        else if (t === 'separate') { const f = ctx.fields[ctx.fields.length - 1]; if (f) { f.phase = 'result'; f.skip = SKIP_FIELD.test(f.instr) } }
        else if (t === 'end') ctx.fields.pop()
        break
      }
      case 'w:footnoteReference': case 'w:endnoteReference': {
        if (hidden()) break
        const key = (c.n === 'w:footnoteReference' ? 'f' : 'e') + (attr(c, 'w:id') ?? '')
        const note = ctx.foot.get(key)
        if (note) { ctx.notes.push(note); buf += `[${ctx.notes.length}]` }
        break
      }
      case 'w:drawing': case 'w:pict': case 'w:object': case 'mc:AlternateContent':
        flush(); scanObject(ctx, { n: 'x', a: {}, c: [c] }, extra); break
      default: break
    }
  }
  flush()
}

function walk(ctx: Ctx, el: XEl, base: Base, out: Seg[], extra: Item[]) {
  for (const c of el.c) {
    if (!isEl(c)) continue
    switch (c.n) {
      case 'w:r': run(ctx, c, base, out, extra); break
      case 'w:pPr': case 'w:del': case 'w:moveFrom': case 'w:rPr': case 'w:proofErr': case 'w:bookmarkStart': case 'w:bookmarkEnd': break
      case 'w:fldSimple': {
        const skip = SKIP_FIELD.test(c.a['w:instr'] ?? '')
        ctx.fields.push({ instr: c.a['w:instr'] ?? '', phase: 'result', skip })
        walk(ctx, c, base, out, extra)
        ctx.fields.pop()
        break
      }
      case 'w:sdt': { const content = kid(c, 'w:sdtContent'); if (content) walk(ctx, content, base, out, extra); break }
      case 'm:oMathPara': case 'm:oMath': { const t = math(c).trim(); if (t) out.push({ t: ` ${t} `, b: false, i: false }); break }
      case 'mc:AlternateContent': scanObject(ctx, { n: 'x', a: {}, c: [c] }, extra); break
      default: walk(ctx, c, base, out, extra)
    }
  }
}

const clean = (t: string) => t.replace(/[​⁠‎‏﻿]/g, '')
/** Segments → texte avec ** (gras) et * (italique), les espaces restant hors des marques. */
function render(segs: Seg[], plain = false): string {
  const merged: Seg[] = []
  for (const s of segs) {
    const t = clean(s.t)
    if (!t) continue
    const last = merged[merged.length - 1]
    if (last && last.b === s.b && last.i === s.i) last.t += t
    else merged.push({ t, b: s.b, i: s.i })
  }
  let out = ''
  for (const s of merged) {
    const t = s.t.replace(/\*/g, '∗').replace(/[ \t]{2,}/g, ' ')
    if (plain || (!s.b && !s.i) || !t.trim()) { out += t; continue }
    const lead = t.match(/^\s*/)![0], trail = t.match(/\s*$/)![0], core = t.trim()
    const mark = s.b ? '**' : '*'
    out += lead + mark + core + mark + trail
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/^[\s ]+|[\s ]+$/g, '')
}
const splitLines = (segs: Seg[]): Seg[][] => {
  const lines: Seg[][] = [[]]
  for (const s of segs) { if (s.t === '\n') lines.push([]); else lines[lines.length - 1].push(s) }
  return lines
}

/* ------------------------------------------------------------------ paragraphes, tableaux */

function paragraph(ctx: Ctx, p: XEl): Item[] {
  const pPr = kid(p, 'w:pPr')
  const sid = attr(kid(pPr, 'w:pStyle'), 'w:val')
  const ch = chain(ctx, sid)
  const segs: Seg[] = []
  const extra: Item[] = []
  const base: Base = { b: ch.find(s => s.b !== undefined)?.b, i: ch.find(s => s.i !== undefined)?.i }
  ctx.suppressed = false
  walk(ctx, p, base, segs, extra)
  const toc = ctx.suppressed || isTocStyle(ch)
  ctx.suppressed = false
  // le compteur de numérotation avance même si le paragraphe est vide, comme dans Word
  const nf = toc ? null : numFor(ctx, pPr, sid)
  const lab = nf ? label(ctx, nf.numId, nf.ilvl) : null
  if (toc) return [{ k: 'toc' }, ...extra]

  const lines = splitLines(segs)
  const oneLine = (plain: boolean) => render(lines.flatMap((l, i) => (i ? [{ t: ' ', b: false, i: false }, ...l] : l)), plain)

  let level = styleLevel(ch)
  const direct = num(attr(kid(pPr, 'w:outlineLvl'), 'w:val'))
  if (!level && direct !== undefined && direct < 9) level = direct + 1
  const plainText = oneLine(true)
  if (plainText === '@@TOC@@') return [{ k: 'toc' }]
  if (level && plainText && plainText.length <= 200) {
    const prefix = lab && !lab.bullet && lab.text ? lab.text + ' ' : ''
    return [{ k: 'h', level: Math.min(level, 4), text: prefix + plainText }, ...extra]
  }
  if (lab) {
    const text = oneLine(false)
    if (!text) return extra
    if (lab.bullet) return [{ k: 'li', text }, ...extra]
    let l = lab.text
    if (/^\d{1,3}$/.test(l)) l += '.'
    return [{ k: 'n', text: l ? `${l} ${text}` : text, digit: /^\d{1,2}[.)]$/.test(l) }, ...extra]
  }
  const out: Item[] = []
  for (const l of lines) {
    let t = render(l)
    if (/^\*+\s*tableau\s*\d*\s*[:.\-–—]/i.test(t)) t = render(l, true) // légende « Tableau n : … » : le site la reconnaît en texte simple
    if (t && t !== '@@TOC@@') out.push({ k: 'p', text: t })
  }
  return [...out, ...extra]
}

interface Cell { text: string; span: number; flat: string }
function cellText(items: Item[]): { text: string; flat: string } {
  const parts: string[] = []
  for (const it of items) {
    if (it.k === 'li') parts.push('• ' + it.text)
    else if (it.k === 'table') parts.push(...it.flat)
    else if (it.k !== 'toc') parts.push(it.text)
  }
  const text = parts.join(CELL_BR).replace(/\t/g, ' ').replace(/\|/g, '∣')
  return { text, flat: parts.join(' ').replace(/\*+/g, '') }
}

function tableItems(ctx: Ctx, tbl: XEl): Item[] {
  const rows: Cell[][] = []
  for (const tr of kids(tbl, 'w:tr')) {
    const row: Cell[] = []
    const cells: XEl[] = []
    for (const c of tr.c) {
      if (!isEl(c)) continue
      if (c.n === 'w:tc') cells.push(c)
      else if (c.n === 'w:sdt') cells.push(...kids(kid(c, 'w:sdtContent'), 'w:tc'))
    }
    for (const tc of cells) {
      const pr = kid(tc, 'w:tcPr')
      const span = Math.max(1, num(attr(kid(pr, 'w:gridSpan'), 'w:val')) ?? 1)
      const vm = kid(pr, 'w:vMerge')
      const cont = !!vm && (attr(vm, 'w:val') ?? 'continue') !== 'restart'
      const items = blocks(ctx, tc.c)
      const t = cont ? { text: '', flat: '' } : cellText(items)
      row.push({ text: t.text, span, flat: t.flat })
    }
    if (row.length) rows.push(row)
  }
  const width = Math.max(1, ...rows.map(r => r.reduce((a, c) => a + c.span, 0)))
  const grid = rows.map(r => {
    const cells: string[] = []
    let full = false
    for (const c of r) { cells.push(c.text); for (let k = 1; k < c.span; k++) cells.push('') }
    if (r.length === 1 && r[0].span === width && width > 1 && r[0].text) full = true
    while (cells.length < width) cells.push('')
    return { cells, full }
  })
  const flat = rows.map(r => r.map(c => c.flat).filter(Boolean).join(' | ')).filter(Boolean)

  // colonnes entièrement vides (mises en page, espaceurs) : retirées
  const used = Array.from({ length: width }, (_, c) => grid.some(g => !g.full && g.cells[c].trim() !== '') || grid.some(g => g.full && c === 0))
  const keep = used.map((u, c) => (u ? c : -1)).filter(c => c >= 0)
  const lines = grid.map(g => ({ full: g.full, cells: keep.map(c => g.cells[c]) })).filter(g => g.full || g.cells.some(x => x.trim()))
  if (keep.length < 2 || lines.length < 2) {
    // un « tableau » d'une colonne ou d'une ligne (cadre, bloc de signatures…) : chaque cellule devient un paragraphe
    const out: Item[] = []
    for (const g of lines) for (const x of g.cells) for (const part of x.split(CELL_BR)) {
      const t = part.replace(/∣/g, '|').trim()
      if (t.startsWith('• ')) out.push({ k: 'li', text: t.slice(2) })
      else if (t) out.push({ k: 'p', text: t })
    }
    return out
  }
  const out = lines.map(g => {
    const cells = g.full ? [g.cells[0], ...g.cells.slice(1).map(() => MERGED)] : g.cells.map(x => x.trim())
    const line = `| ${cells.join(' | ')} |`
    // une ligne de tirets « | - | - | » serait prise pour le filet d'un tableau Markdown : tiret demi-cadratin à la place
    return /^\|?[ :\-|]+\|?$/.test(line) && line.includes('-') ? line.replace(/-/g, '–') : line
  })
  return [{ k: 'table', lines: out, flat }]
}

function blocks(ctx: Ctx, nodes: (XEl | string)[]): Item[] {
  const out: Item[] = []
  const dropTitle = () => {
    const last = out[out.length - 1]
    if (last && (last.k === 'h' || last.k === 'p') && TOC_TITLE.test(last.text.replace(/\*/g, '').trim())) out.pop()
  }
  for (const el of nodes) {
    if (!isEl(el)) continue
    switch (el.n) {
      case 'w:p': for (const it of paragraph(ctx, el)) { if (it.k === 'toc') dropTitle(); else out.push(it) } break
      case 'w:tbl': out.push(...tableItems(ctx, el)); break
      case 'w:sdt': {
        const gal = attr(kid(kid(kid(el, 'w:sdtPr'), 'w:docPartObj'), 'w:docPartGallery'), 'w:val') ?? ''
        if (/table of contents|table des mati/i.test(gal)) { dropTitle(); break }
        out.push(...blocks(ctx, kid(el, 'w:sdtContent')?.c ?? []))
        break
      }
      case 'w:del': case 'w:moveFrom': case 'w:sectPr': break
      case 'w:altChunk': ctx.other++; break
      case 'mc:AlternateContent': out.push(...blocks(ctx, kid(el, 'mc:Choice')?.c ?? [])); break
      default: if (el.c.length) out.push(...blocks(ctx, el.c))
    }
  }
  return out
}

/* ------------------------------------------------------------------ assemblage */

function emit(items: Item[]): string {
  const lines: string[] = []
  let prev: Item | undefined
  let hl = 0
  for (const it of items) {
    if (prev) {
      const tight = (prev.k === 'n' && it.k === 'n' && prev.digit && it.digit) || (prev.k === 'li' && it.k === 'li')
      if (!tight) lines.push('')
      if (prev.k === 'table' && it.k === 'table') lines.push('⁠', '') // deux tableaux collés ne doivent pas n'en faire qu'un
    }
    switch (it.k) {
      case 'h': { const l = Math.min(it.level, hl + 1); hl = l; lines.push('#'.repeat(l) + ' ' + it.text); break }
      case 'li': lines.push('• ' + it.text); break
      case 'table': lines.push(...it.lines); break
      case 'p': case 'n': lines.push(it.text); break
      default: break
    }
    prev = it
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const pathOf = (base: string, target: string) => {
  if (target.startsWith('/')) return target.slice(1)
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : ''
  const parts = (dir + target).split('/')
  const out: string[] = []
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p) }
  return out.join('/')
}

const MAX_BYTES = 40 * 1024 * 1024
const MAX_XML = 150 * 1024 * 1024

export async function importDocx(data: ArrayBuffer | Uint8Array): Promise<ImportResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.length > MAX_BYTES) throw new ImportError('Ce fichier est trop lourd (40 Mo maximum).')
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ImportError('C’est un ancien fichier Word (.doc). Ouvre-le dans Word, fais « Enregistrer sous » et choisis « Document Word (.docx) ».')
  }
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes) } catch { throw new ImportError('Ce fichier n’est pas un document Word (.docx) valide.') }
  const read = async (p: string): Promise<string | null> => {
    const f = zip.file(p)
    if (!f) return null
    const s = await f.async('string')
    if (s.length > MAX_XML) throw new ImportError('Ce document est trop volumineux pour être lu ici.')
    return s.replace(/^﻿/, '')
  }
  const rels = async (p: string): Promise<Map<string, string>> => {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : ''
    const x = await read(`${dir}_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`)
    const m = new Map<string, string>()
    if (!x) return m
    for (const r of kids(parseXml(x), 'Relationship')) {
      if (r.a.TargetMode === 'External') continue
      m.set((r.a.Type ?? '').split('/').pop() ?? '', pathOf(p, r.a.Target ?? ''))
    }
    return m
  }

  let mainPath = 'word/document.xml'
  const top = await rels('_rels/.rels').catch(() => new Map<string, string>())
  const rootRel = top.get('officeDocument')
  if (rootRel && zip.file(rootRel)) mainPath = rootRel
  if (!zip.file(mainPath)) {
    if (zip.file('content.xml')) throw new ImportError('C’est un document OpenDocument (.odt). Ouvre-le et enregistre-le en .docx.')
    throw new ImportError('Ce fichier n’est pas un document Word (.docx).')
  }
  const mainRels = await rels(mainPath).catch(() => new Map<string, string>())
  const rel = (type: string, fallback: string) => mainRels.get(type) ?? fallback

  let doc: XEl
  try { doc = parseXml((await read(mainPath)) ?? '') } catch (e) {
    if (e instanceof ImportError) throw e
    throw new ImportError('Le contenu de ce document Word est illisible.')
  }
  const opt = async (p: string): Promise<XEl | null> => { try { const x = await read(p); return x ? parseXml(x) : null } catch { return null } }

  const ctx: Ctx = {
    styles: readStyles(await opt(rel('styles', 'word/styles.xml'))),
    abs: new Map(), nums: new Map(), counters: new Map(), foot: new Map(), notes: [], fields: [],
    suppressed: false, images: 0, charts: 0, diagrams: 0, other: 0, headingStyles: false,
  }
  readNumbering(await opt(rel('numbering', 'word/numbering.xml')), ctx)
  for (const [kind, type, fb, tag] of [['f', 'footnotes', 'word/footnotes.xml', 'w:footnote'], ['e', 'endnotes', 'word/endnotes.xml', 'w:endnote']] as const) {
    const root = await opt(rel(type, fb))
    for (const n of kids(root ?? undefined, tag)) {
      const id = attr(n, 'w:id'), t = attr(n, 'w:type')
      if (id === undefined || (t && t !== 'normal')) continue
      const paras: string[] = []
      const collect = (e: XEl) => {
        for (const c of e.c) {
          if (!isEl(c)) continue
          if (c.n === 'w:p') {
            const segs: Seg[] = []
            const sub: Ctx = { ...ctx, fields: [], foot: new Map(), notes: [], suppressed: false }
            walk(sub, c, {}, segs, [])
            const s = render(segs.map(x => (x.t === '\n' ? { ...x, t: ' ' } : x)), true)
            if (s) paras.push(s)
          } else if (c.n !== 'w:del') collect(c)
        }
      }
      collect(n)
      if (paras.length) ctx.foot.set(kind + id, paras.join(' '))
    }
  }

  const body = kid(doc, 'w:body') ?? doc
  const items = blocks(ctx, body.c)
  if (ctx.notes.length) {
    items.push({ k: 'p', text: '**Notes de bas de page**' })
    ctx.notes.forEach((t, i) => items.push({ k: 'p', text: `[${i + 1}] ${t}` }))
  }
  const text = emit(items)
  if (!text) throw new ImportError('Ce document Word ne contient pas de texte à reprendre.')

  const stats = {
    words: (text.match(/\S+/g) ?? []).length,
    headings: items.filter(i => i.k === 'h').length,
    tables: items.filter(i => i.k === 'table').length,
    lists: items.filter(i => i.k === 'li' || i.k === 'n').length,
    notes: ctx.notes.length,
  }
  const skipped = { images: ctx.images, charts: ctx.charts, diagrams: ctx.diagrams, other: ctx.other }
  const warnings: string[] = []
  const parts: string[] = []
  const pl = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
  if (skipped.images) parts.push(pl(skipped.images, 'image', 'images'))
  if (skipped.charts) parts.push(pl(skipped.charts, 'graphique', 'graphiques'))
  if (skipped.diagrams) parts.push(pl(skipped.diagrams, 'schéma', 'schémas'))
  if (skipped.other) parts.push(pl(skipped.other, 'objet incorporé', 'objets incorporés'))
  if (parts.length) warnings.push(`Non repris : ${parts.join(', ')}. Tout le texte, les titres, les listes et les tableaux sont bien repris.`)
  return { text, stats, skipped, warnings }
}
