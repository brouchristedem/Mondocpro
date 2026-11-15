import type { Cover } from './types'

/**
 * Pages de garde : 10 gabarits décrits UNE seule fois, dans un mini-langage (texte, filet, espace, image, cellules de tableau).
 * Deux rendus lisent cette description : le Word (coverDocx.ts) et l'aperçu / PDF (coverHtml.ts).
 * Toutes les hauteurs de ligne sont exactes et toutes les rangées ont une hauteur fixe : Word et l'aperçu placent donc les éléments au même endroit.
 * Tout reste dans les marges (rien ne déborde du bord de la feuille : l'impression est propre sur toutes les imprimantes).
 */

export type CoverFont = 'Times New Roman' | 'Arial' | 'Calibri' | 'Georgia'
export type Align = 'left' | 'center' | 'right'
export interface Edge { w: number; c: string } // épaisseur en pt, couleur hexadécimale sans #

export interface TextN { t: 'text'; text: string; size: number; font: CoverFont; bold?: boolean; italic?: boolean; color: string; track: number; align: Align; before: number; after: number; lh: number }
export interface RuleN { t: 'rule'; w: number; c: string; before: number; after: number; indL: number; indR: number }
export interface SpaceN { t: 'space'; h: number }
export interface ImgN { t: 'img'; url: string; w: number; h: number; align: Align; before: number; after: number }
export type Node = TextN | RuleN | SpaceN | ImgN

export interface Cell {
  span: number
  nodes: Node[]
  fill?: string
  pad: [number, number, number, number] // haut, droite, bas, gauche (pt)
  valign: 'top' | 'middle' | 'bottom'
  edge: { t?: Edge; r?: Edge; b?: Edge; l?: Edge }
}
export interface Row { h: number; cells: Cell[] }
/** Rectangle de couleur posé directement sur la FEUILLE (x, y, largeur, hauteur en pt depuis le coin haut gauche de la page) : il peut aller jusqu'au bord, derrière le texte. */
export interface Deco { x: number; y: number; w: number; h: number; fill: string }
export interface CoverTable { grid: number[]; rows: Row[]; deco?: Deco[] }

/** Feuille A4 et marges de la page de garde (pt). La marge gauche se déduit de la largeur de texte W : PAGE.w - PAGE.mr - W. */
export const PAGE = { w: 595.3, h: 841.9, mt: 70.85, mr: 70.85 }

export interface TemplateInfo { id: string; name: string; tagline: string; build: (c: Cover, W: number, H: number) => CoverTable }

/* ---------------------------------------------------------------- outils */

const has = (s?: string) => !!s && s.trim().length > 0
const U = (s: string) => s.trim().toUpperCase()

const T = (text: string, size: number, font: CoverFont, o: Partial<Omit<TextN, 't' | 'text' | 'size' | 'font'>> = {}): TextN =>
  ({ t: 'text', text, size, font, color: '000000', track: 0, align: 'left', before: 0, after: 0, lh: 1.2, ...o })
const rule = (w: number, c: string, o: Partial<Omit<RuleN, 't' | 'w' | 'c'>> = {}): RuleN => ({ t: 'rule', w, c, before: 0, after: 0, indL: 0, indR: 0, ...o })
const gap = (h: number): SpaceN => ({ t: 'space', h })
const cell = (nodes: (Node | null | false | undefined)[], o: Partial<Omit<Cell, 'nodes'>> = {}): Cell =>
  ({ span: 1, pad: [0, 0, 0, 0], valign: 'top', edge: {}, ...o, nodes: nodes.filter((n): n is Node => !!n) })
const row = (h: number, cells: Cell[]): Row => ({ h, cells })

const logoN = (c: Cover, maxH: number, align: Align, after = 0, maxW = 150): ImgN | null => {
  if (!c.logo) return null
  const r = c.logo.w / c.logo.h
  let h = maxH, w = h * r
  if (w > maxW) { w = maxW; h = w / r }
  return { t: 'img', url: c.logo.url, w, h, align, before: 0, after }
}

interface Item { label: string; value: string }
/** Les lignes d'information de la page de garde, dans l'ordre : auteur, filière, encadrement, lignes libres, année. */
export function infoItems(c: Cover, withYear: boolean): Item[] {
  const o: Item[] = []
  if (has(c.author)) o.push({ label: 'Présenté par', value: c.author.trim() })
  if (has(c.group)) o.push({ label: 'Filière', value: (c.group ?? '').trim() })
  if (has(c.supervisor)) o.push({ label: 'Sous la direction de', value: c.supervisor.trim() })
  for (const x of c.extras ?? []) {
    if (!x.trim()) continue
    const m = x.match(/^(.{1,32}?)\s*[:：]\s*(.+)$/)
    o.push(m ? { label: m[1].trim(), value: m[2].trim() } : { label: '', value: x.trim() })
  }
  if (withYear && has(c.year)) o.push({ label: 'Année académique', value: c.year.trim() })
  return o.slice(0, 8)
}

/** « 2025-2026 » → ['2025', '2026'] ; sinon le texte tel quel. */
const yearParts = (y: string): string[] => {
  const m = y.trim().match(/^((?:19|20)\d{2})\s*[-–/]\s*((?:19|20)?\d{2})$/)
  if (!m) return [y.trim()]
  return [m[1], m[2].length === 2 ? m[1].slice(0, 2) + m[2] : m[2]]
}

/** Première lettre « significative » du titre (sans « L’ », « Le », « De »…). */
const initialOf = (t: string, fallback: string): string => {
  const skip = /^(le|la|les|un|une|de|du|des|et|en|au|aux|l|d)$/i
  for (const raw of t.replace(/^[«"“'‘\s]+/, '').split(/\s+/)) {
    const w = raw.replace(/^[ld]['’]/i, '').replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')
    if (!w || skip.test(w)) continue
    return w[0].toUpperCase()
  }
  return (t.trim()[0] ?? fallback.trim()[0] ?? '·').toUpperCase()
}

/* -------------------------------------------------- estimation des hauteurs */

/** Largeur moyenne d'un caractère (multiple de la taille) : normal, gras, MAJUSCULES. Volontairement un peu large (prudence). */
const CW: Record<CoverFont, [number, number, number]> = {
  'Times New Roman': [0.47, 0.51, 0.69],
  Arial: [0.53, 0.58, 0.72],
  Calibri: [0.48, 0.51, 0.65],
  Georgia: [0.54, 0.58, 0.73],
}
const charW = (n: Pick<TextN, 'text' | 'size' | 'font' | 'bold' | 'track'>) => {
  const f = CW[n.font]
  const caps = n.text === n.text.toUpperCase() && /[A-ZÀ-Ý]/.test(n.text)
  const w = caps ? f[2] * (n.bold ? 1.06 : 1) : n.bold ? f[1] : f[0]
  return (w * n.size + n.track) * 1.04
}
export function wrapCount(n: Pick<TextN, 'text' | 'size' | 'font' | 'bold' | 'track'>, width: number): number {
  const cw = charW(n)
  const space = cw * 0.7
  let lines = 1, line = 0
  for (const word of n.text.split(/\s+/).filter(Boolean)) {
    const ww = word.length * cw
    if (ww > width) { // mot plus long que la ligne : il sera coupé
      if (line > 0) lines++
      lines += Math.ceil(ww / width) - 1
      line = ww % width
    } else if (line === 0) line = ww
    else if (line + space + ww <= width) line += space + ww
    else { lines++; line = ww }
  }
  return lines
}
/** Plus grande taille (entre min et max) pour que le texte tienne en hauteur dans la largeur donnée, sans couper de mot en deux. */
export function fit(text: string, o: { font: CoverFont; bold?: boolean; width: number; maxH: number; max: number; min: number; lh?: number; track?: number }): number {
  const lh = o.lh ?? 1.2
  const longest = Math.max(1, ...text.split(/\s+/).map(w => w.length))
  for (let s = o.max; s >= o.min; s -= 0.5) {
    const n = { text, size: s, font: o.font, bold: o.bold, track: o.track ?? 0 }
    if (longest * charW(n) > o.width) continue
    if (wrapCount(n, o.width) * s * lh <= o.maxH) return s
  }
  return o.min
}
const nodeH = (n: Node, width: number): number => {
  switch (n.t) {
    case 'text': return wrapCount(n, width) * n.size * n.lh + n.before + n.after
    case 'rule': return n.before + n.after + 1 + n.w
    case 'space': return n.h
    case 'img': return n.h + n.before + n.after + 1
  }
}
export const cellNeed = (c: Cell, width: number): number =>
  c.pad[0] + c.pad[2] + c.nodes.reduce((a, n) => a + nodeH(n, width - c.pad[1] - c.pad[3]), 0)

const scaleNode = (n: Node, f: number): Node => {
  switch (n.t) {
    case 'text': return { ...n, size: Math.max(6, Math.round(n.size * f * 2) / 2), track: n.track * f, before: n.before * f, after: n.after * f }
    case 'space': return { ...n, h: n.h * f }
    case 'img': return { ...n, w: n.w * f, h: n.h * f, before: n.before * f, after: n.after * f }
    case 'rule': return { ...n, before: n.before * f, after: n.after * f }
  }
}
/** Filet de sécurité : si le texte saisi est plus long que prévu, la cellule est réduite jusqu'à tenir (rien n'est coupé par Word). */
export function harden(t: CoverTable): CoverTable {
  return {
    grid: t.grid,
    deco: t.deco,
    rows: t.rows.map(r => {
      let col = 0
      const cells = r.cells.map(c => {
        const width = t.grid.slice(col, col + c.span).reduce((a, x) => a + x, 0)
        col += c.span
        let cur = c
        for (let i = 0; i < 5; i++) {
          const need = cellNeed(cur, width)
          if (need <= r.h - 0.5) break
          const f = Math.max(0.45, ((r.h - cur.pad[0] - cur.pad[2]) / (need - cur.pad[0] - cur.pad[2])) * 0.97)
          cur = { ...cur, nodes: cur.nodes.map(n => scaleNode(n, f)) }
        }
        return cur
      })
      return { ...r, cells }
    }),
  }
}

/* ------------------------------------------------------- les 10 gabarits */

const lab = (it: Item, o: { font: CoverFont; size: number; color: string; italic?: boolean; track?: number; caps?: boolean; align?: Align; after?: number; bold?: boolean }): TextN | null =>
  it.label ? T(o.caps ? U(it.label) : it.label, o.size, o.font, { color: o.color, italic: o.italic, track: o.track ?? 0, align: o.align ?? 'left', after: o.after ?? 0, bold: o.bold }) : null

/** 1. Académique : classique, centré, filets doubles, Times. */
function academique(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Times New Roman', ink = '111111', grey = '555555'
  const h1 = H * 0.28, h2 = H * 0.38, h3 = H - h1 - h2
  const top: (Node | null)[] = [
    has(c.school) ? T(U(c.school), 13, F, { bold: true, track: 1.2, align: 'center', after: 10, lh: 1.25 }) : null,
    rule(2.5, ink, { after: 2 }), rule(0.5, ink, { after: 14 }),
    logoN(c, 58, 'center'),
  ]
  const wT = W - 40
  const title = c.title.trim()
  const mid: (Node | null)[] = [
    has(c.kind) ? T(U(c.kind), 11.5, F, { italic: true, track: 4, align: 'center', color: grey, after: 16 }) : null,
    title ? T(title, fit(title, { font: F, bold: true, width: wT, maxH: h2 * 0.62, max: 28, min: 15, lh: 1.22 }), F, { bold: true, align: 'center', lh: 1.22 }) : null,
    title ? rule(1, ink, { before: 18, indL: W * 0.4, indR: W * 0.4 }) : null,
  ]
  const its = infoItems(c, false)
  const bot: (Node | null)[] = []
  const compact = its.length > 4
  its.forEach(it => {
    if (!compact) bot.push(lab(it, { font: F, size: 10, color: grey, italic: true, align: 'center' }))
    bot.push(T(compact && it.label ? `${it.label} : ${it.value}` : it.value, compact ? 12 : 13.5, F, { bold: !compact, align: 'center', after: compact ? 4 : 9 }))
  })
  if (has(c.year)) { bot.push(rule(0.5, ink, { before: 8, after: 8, indL: W * 0.3, indR: W * 0.3 })); bot.push(T(`Année académique ${c.year.trim()}`, 11, F, { align: 'center', track: 1.2 })) }
  return {
    grid: [W],
    rows: [
      row(h1, [cell(top, { valign: 'top' })]),
      row(h2, [cell(mid, { valign: 'middle', pad: [0, 20, 0, 20] })]),
      row(h3, [cell(bot, { valign: 'bottom' })]),
    ],
  }
}

/** 2. Colonne : bandeau vert collé au bord gauche de la feuille et sur toute sa hauteur, texte à droite, Arial. */
function colonne(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Arial', green = '1F4D3A', soft = 'CFE3D8', ink = '14181A', grey = '5B6460'
  const ml = PAGE.w - PAGE.mr - W // marge gauche de la feuille
  const colX = Math.round(PAGE.w * 0.34) // la colonne va du bord gauche jusqu'ici
  const lw = colX - ml, rw = W - lw
  const h1 = H * 0.64, h2 = H - h1
  const yp = has(c.year) ? yearParts(c.year) : []
  const tw = lw - 20 // largeur du texte dans la colonne
  const leftTop = cell([
    has(c.school) ? T(U(c.school), fit(U(c.school), { font: F, bold: true, width: tw, maxH: h1 * 0.4, max: 11, min: 6.5, lh: 1.3, track: 1 }), F, { bold: true, color: 'FFFFFF', track: 1, lh: 1.3, after: 12 }) : null,
    has(c.school) && has(c.group) ? rule(0.75, soft, { after: 10, indR: tw * 0.5 }) : null,
    has(c.group) ? T(c.group!.trim(), 10, F, { color: soft, lh: 1.3 }) : null,
  ], { valign: 'top', pad: [14, 20, 0, 0] })
  const leftBot = cell(yp.map(y => T(y, yp.length > 1 ? 36 : 28, F, { bold: true, color: 'FFFFFF', lh: 1.05 })), { valign: 'bottom', pad: [0, 20, 0, 0] })
  const title = c.title.trim()
  const rightTop = cell([
    logoN(c, 50, 'left', 18),
    has(c.kind) ? T(U(c.kind), 10, F, { bold: true, color: green, track: 3, after: 10 }) : null,
    rule(4, green, { after: 16, indR: rw - 30 - 54 }),
    title ? T(title, fit(title, { font: F, bold: true, width: rw - 30, maxH: h1 * 0.55, max: 30, min: 16, lh: 1.14 }), F, { bold: true, color: ink, lh: 1.14 }) : null,
  ], { valign: 'middle', pad: [0, 0, 0, 30] })
  const rightBot = cell(infoItems(c, false).flatMap(it => [
    lab(it, { font: F, size: 8, color: grey, caps: true, track: 1.5, bold: true, after: 2 }),
    T(it.value, 12, F, { bold: true, color: ink, after: 9 }),
  ]), { valign: 'bottom', pad: [0, 0, 0, 30] })
  return {
    grid: [lw, rw],
    rows: [row(h1, [leftTop, rightTop]), row(h2, [leftBot, rightBot])],
    deco: [{ x: 0, y: 0, w: colX, h: PAGE.h, fill: green }],
  }
}

/** 3. Éditorial : titre géant en bas à gauche, barre d'accent vermillon, informations sobres, Calibri. */
function editorial(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Calibri', ink = '0F0F0F', red = 'D9480F', grey = '6B6B6B'
  const h1 = H * 0.09, h2 = H * 0.5, h3 = H - h1 - h2
  const title = c.title.trim()
  const its = infoItems(c, false)
  const l = Math.round(W * 0.62)
  return {
    grid: [l, W - l],
    rows: [
      row(h1, [
        cell([has(c.school) ? T(U(c.school), 10, F, { bold: true, color: grey, track: 2.5 }) : null]),
        cell([logoN(c, 40, 'right')]),
      ]),
      row(h2, [cell([
        rule(7, red, { after: 18, indR: W - 56 }),
        has(c.kind) ? T(U(c.kind), 10, F, { bold: true, color: red, track: 3.5, after: 12 }) : null,
        title ? T(title, fit(title, { font: F, bold: true, width: W, maxH: h2 - 90, max: 42, min: 20, lh: 1.06 }), F, { bold: true, color: ink, lh: 1.06 }) : null,
      ], { span: 2, valign: 'bottom', pad: [0, 0, 24, 0] })]),
      row(h3, [cell([
        its[0] ? T(its[0].value, 15, F, { bold: true, color: ink, after: 4 }) : null,
        ...its.slice(1).map(it => T(it.label ? `${it.label} ${it.value}` : it.value, 11.5, F, { color: grey, after: 3 })),
        has(c.year) ? T(U(`Année ${c.year.trim()}`), 11, F, { bold: true, color: red, track: 2, before: 12 }) : null,
      ], { span: 2, valign: 'top', pad: [16, 0, 0, 0], edge: { t: { w: 0.75, c: ink } } })]),
    ],
  }
}

/** 4. Millésime : l'année en très grand format à droite ; les informations en tableau structuré (étiquette | valeur) à gauche, Georgia + chiffres Arial. */
function millesime(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Georgia', N: CoverFont = 'Arial', ink = '1B1B1B', grey = '77726A', numeral = 'E3DDD0', hair = 'CFC8B8'
  const yp = has(c.year) ? yearParts(c.year) : []
  const ySize = yp.length > 1 ? 96 : yp[0] ? Math.min(118, Math.floor(W / (yp[0].length * 0.74))) : 0
  const its = infoItems(c, false)
  const rowH = its.length > 5 ? 26 : 30
  const itemsH = its.length * rowH
  const h1 = H * 0.1, h2 = yp.length ? yp.length * ySize + 10 : H * 0.04
  const h3 = Math.max(H * 0.24, H - h1 - h2 - itemsH)
  const title = c.title.trim()
  const lw = Math.round(W * 0.3), vw = W - lw
  const rows: Row[] = [
    row(h1, [cell([logoN(c, 36, 'right', 6), has(c.school) ? T(U(c.school), 9.5, F, { color: grey, track: 2, align: 'right' }) : null], { span: 2 })]),
    row(h2, [cell(yp.map(y => T(y, ySize, N, { bold: true, color: numeral, align: 'right', lh: 1 })), { span: 2, valign: 'middle' })]),
    row(h3, [cell([
      has(c.kind) ? T(U(c.kind), 10.5, F, { italic: true, color: grey, track: 3, align: 'right', after: 12 }) : null,
      title ? T(title, fit(title, { font: F, bold: true, width: W, maxH: h3 * 0.55, max: 32, min: 16, lh: 1.15 }), F, { bold: true, color: ink, align: 'right', lh: 1.15 }) : null,
      title ? rule(2, ink, { before: 16, indL: W - 64 }) : null,
    ], { span: 2, valign: 'middle', pad: [0, 0, 18, 0] })]),
  ]
  its.forEach((it, i) => {
    const last = i === its.length - 1
    const e: Edge = { w: 0.5, c: hair }
    rows.push(row(rowH, [
      cell([it.label ? T(U(it.label), 7.5, N, { bold: true, color: grey, track: 1.4 }) : null], { valign: 'middle', edge: { t: e, ...(last ? { b: e } : {}) } }),
      cell([T(it.value, 12, F, { bold: true, color: ink })], { valign: 'middle', edge: { t: e, ...(last ? { b: e } : {}) } }),
    ]))
  })
  return { grid: [lw, vw], rows }
}

/** 5. Cartouche : vraie bande bleue sur toute la largeur (nom de l'établissement écrit dessus), grand titre, bloc technique encadré en bas, Arial + Calibri. */
function cartouche(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Arial', M: CoverFont = 'Calibri', blue = '1E3A8A', navy = '0B1F4B', soft = 'BFD0F5'
  const q = W / 4
  const its = infoItems(c, true).slice(0, 7)
  const nRows = Math.ceil(its.length / 2)
  const cartH = nRows * 46
  const band = has(c.school) || has(c.kind)
  const h1 = band ? 36 : 0, h3 = cartH, h2 = H - h1 - h3 - 16
  const title = c.title.trim()
  const rows: Row[] = []
  if (band) {
    const sw = has(c.kind) ? q * 3 : W
    const schoolSize = has(c.school) ? fit(U(c.school), { font: M, bold: true, width: sw - 28, maxH: 12, max: 10, min: 6.5, lh: 1.1, track: 1.6 }) : 10
    rows.push(row(h1, [
      cell([has(c.school) ? T(U(c.school), schoolSize, M, { bold: true, color: 'FFFFFF', track: 1.6, lh: 1.1 }) : null], { span: has(c.kind) ? 3 : 4, fill: blue, valign: 'middle', pad: [0, 8, 0, 14] }),
      ...(has(c.kind) ? [cell([T(U(c.kind), 8.5, M, { bold: true, color: soft, track: 2, align: 'right' })], { span: 1, fill: blue, valign: 'middle', pad: [0, 14, 0, 4] })] : []),
    ]))
  }
  rows.push(
    row(h2, [cell([
      logoN(c, 52, 'left', 20),
      title ? T(title, fit(title, { font: F, bold: true, width: W, maxH: h2 * 0.6, max: 31, min: 16, lh: 1.15 }), F, { bold: true, color: navy, lh: 1.15 }) : null,
      title ? rule(2.5, blue, { before: 16, indR: W - 70 }) : null,
    ], { span: 4, valign: 'middle' })]),
    row(16, [cell([], { span: 4 })]),
  )
  const e: Edge = { w: 0.75, c: blue }
  for (let i = 0; i < its.length; i += 2) {
    const pair = its.slice(i, i + 2)
    rows.push(row(46, pair.map(it => cell([
      lab(it, { font: M, size: 7.5, color: blue, caps: true, bold: true, track: 1.2, after: 4 }),
      T(it.value, 12, M, { bold: true, color: '111827' }),
    ], { span: pair.length === 1 ? 4 : 2, valign: 'middle', pad: [0, 10, 0, 10], edge: { t: e, r: e, b: e, l: e } }))))
  }
  return { grid: [q, q, q, q], rows }
}

/** 6. Monolithe : titre blanc dans un grand bloc anthracite, informations en bandeau, Georgia + Arial. */
function monolithe(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Georgia', M: CoverFont = 'Arial', dark = '20242A', sand = 'E6D9BC', muted = '7A6F58'
  const t3 = W / 3
  const its = infoItems(c, true).slice(0, 6)
  const stripRows = Math.ceil(its.length / 3)
  const stripH = stripRows * 62
  const h1 = H * 0.13, h2 = H * 0.46, h4 = stripH, h3 = H - h1 - h2 - h4
  const title = c.title.trim()
  const rows: Row[] = [
    row(h1, [
      cell([has(c.school) ? T(U(c.school), 9.5, M, { bold: true, color: dark, track: 2.5 }) : null], { span: 2 }),
      cell([logoN(c, 44, 'right')]),
    ]),
    row(h2, [cell([
      has(c.kind) ? T(U(c.kind), 9.5, M, { bold: true, color: sand, track: 3.5, after: 14 }) : null,
      rule(3, sand, { after: 20, indR: W - 40 - 56 }),
      title ? T(title, fit(title, { font: F, bold: true, width: W - 64, maxH: h2 - 120, max: 30, min: 16, lh: 1.15 }), F, { bold: true, color: 'FFFFFF', lh: 1.15 }) : null,
    ], { span: 3, fill: dark, valign: 'middle', pad: [30, 32, 30, 32] })]),
    row(h3, [cell([], { span: 3 })]),
  ]
  const line: Edge = { w: 0.75, c: muted }
  for (let i = 0; i < its.length; i += 3) {
    const part = its.slice(i, i + 3)
    const cells = part.map((it, k) => cell([
      lab(it, { font: F, size: 9.5, color: muted, italic: true, after: 3 }),
      T(it.value, 11.5, M, { bold: true, color: dark }),
    ], { valign: 'top', pad: [10, 8, 0, k === 0 ? 0 : 14], edge: k === 0 ? {} : { l: line } }))
    while (cells.length < 3) cells.push(cell([], {}))
    rows.push(row(62, cells))
  }
  return { grid: [t3, t3, t3], rows }
}

/** 7. Monogramme : initiale dans un carré, filet vertical bordeaux qui descend, Times. */
function monogramme(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Times New Roman', M: CoverFont = 'Calibri', wine = '6B1E2E', ink = '1A1A1A', grey = '555555'
  const bw = 92, rw = W - bw
  const h1 = 104, h2 = H * 0.4, h3 = H - h1 - h2
  const title = c.title.trim()
  const b: Edge = { w: 3, c: wine }
  const its = infoItems(c, true)
  return {
    grid: [bw, rw],
    rows: [
      row(h1, [
        cell([T(initialOf(title, c.school), 62, F, { bold: true, color: wine, align: 'center', lh: 1 })], { valign: 'middle', edge: { t: b, r: b, b: b, l: b } }),
        cell([
          has(c.school) ? T(U(c.school), 12, F, { bold: true, color: wine, track: 1.5, after: 6, lh: 1.25 }) : null,
          has(c.kind) ? T(c.kind.trim().charAt(0).toUpperCase() + c.kind.trim().slice(1).toLowerCase(), 13, F, { italic: true, color: grey, after: 8 }) : null,
          logoN(c, 34, 'left'),
        ], { valign: 'top', pad: [0, 0, 0, 20] }),
      ]),
      row(h2, [cell([
        title ? T(title, fit(title, { font: F, width: W - 24, maxH: h2 * 0.7, max: 32, min: 16, lh: 1.18 }), F, { color: ink, lh: 1.18 }) : null,
      ], { span: 2, valign: 'middle', pad: [0, 0, 0, 24], edge: { l: b } })]),
      row(h3, [cell(its.flatMap(it => [
        lab(it, { font: F, size: 10.5, color: wine, italic: true, after: 1 }),
        T(it.value, 13, M, { color: ink, after: 9 }),
      ]), { span: 2, valign: 'bottom', pad: [0, 0, 6, 24], edge: { l: b } })]),
    ],
  }
}

/** 8. Horizons : trois bandes horizontales séparées par de gros filets pétrole, Georgia + Arial. */
function horizons(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Georgia', M: CoverFont = 'Arial', teal = '155E75', ink = '12212A', grey = '64748B'
  const t3 = W / 3
  const its = infoItems(c, false).slice(0, 6)
  const nr = Math.max(1, Math.ceil(its.length / 3))
  const h1 = 46, h3 = nr * 64, h2 = H - h1 - h3
  const title = c.title.trim()
  const top: Edge = { w: 5, c: teal }, hair: Edge = { w: 0.5, c: teal }
  const rows: Row[] = [
    row(h1, [
      cell([has(c.school) ? T(U(c.school), 9.5, M, { bold: true, color: teal, track: 2 }) : null], { span: 2, valign: 'middle', edge: { t: top, b: hair } }),
      cell([has(c.year) ? T(c.year.trim(), 9.5, M, { bold: true, color: teal, track: 1, align: 'right' }) : null], { valign: 'middle', edge: { t: top, b: hair } }),
    ]),
    row(h2, [cell([
      logoN(c, 54, 'left', 22),
      has(c.kind) ? T(U(c.kind), 9.5, M, { color: grey, track: 4, after: 12 }) : null,
      title ? T(title, fit(title, { font: F, width: W, maxH: h2 * 0.62, max: 34, min: 16, lh: 1.15 }), F, { color: ink, lh: 1.15 }) : null,
    ], { span: 3, valign: 'middle' })]),
  ]
  for (let i = 0; i < Math.max(its.length, 1); i += 3) {
    const part = its.slice(i, i + 3)
    const last = i + 3 >= its.length
    const cells = part.map(it => cell([
      lab(it, { font: M, size: 7.5, color: teal, caps: true, bold: true, track: 1.5, after: 4 }),
      T(it.value, 12, F, { color: ink }),
    ], { valign: 'middle', pad: [0, 8, 0, 0], edge: { t: hair, ...(last ? { b: top } : {}) } }))
    while (cells.length < 3) cells.push(cell([], { edge: { t: hair, ...(last ? { b: top } : {}) } }))
    rows.push(row(64, cells))
  }
  return { grid: [t3, t3, t3], rows }
}

/** 9. Repères : informations numérotées 01, 02, 03 sur filets fins, Calibri + Georgia. */
function reperes(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Calibri', N: CoverFont = 'Georgia', amber = 'B45309', ink = '1C1917', grey = '78716C', hair = 'D6D3D1'
  const nw = 62, rw = W - nw
  const its = infoItems(c, true).slice(0, 6)
  const itH = its.length > 4 ? 44 : 52
  const h1 = 34, h3 = 14, h4 = its.length * itH
  const h2 = H - h1 - h3 - h4
  const title = c.title.trim()
  const rows: Row[] = [
    row(h1, [cell([has(c.school) ? T(U(c.school), 10, F, { bold: true, color: amber, track: 3 }) : null], { span: 2 })]),
    row(h2, [cell([
      logoN(c, 50, 'left', 16),
      has(c.kind) ? T(U(c.kind), 10.5, F, { color: grey, track: 3, after: 10 }) : null,
      title ? T(title, fit(title, { font: F, bold: true, width: W, maxH: h2 * 0.6, max: 34, min: 16, lh: 1.1 }), F, { bold: true, color: ink, lh: 1.1 }) : null,
      title ? rule(3, amber, { before: 18, indR: W - 48 }) : null,
    ], { span: 2, valign: 'middle' })]),
    row(h3, [cell([], { span: 2 })]),
  ]
  its.forEach((it, i) => rows.push(row(itH, [
    cell([T(String(i + 1).padStart(2, '0'), 24, N, { color: amber, lh: 1.1 })], { valign: 'middle', edge: { t: { w: 0.75, c: hair } } }),
    cell([
      lab(it, { font: F, size: 8, color: grey, caps: true, bold: true, track: 1.5, after: 2 }),
      T(it.value, 13, F, { bold: true, color: ink }),
    ], { valign: 'middle', edge: { t: { w: 0.75, c: hair } } }),
  ])))
  return { grid: [nw, rw], rows }
}

/** 10. Classique : le modèle d'origine du site : tout centré, établissement, logo, type de document, titre entre deux filets, puis les lignes « Présenté par : … ». */
function classique(c: Cover, W: number, H: number): CoverTable {
  const F: CoverFont = 'Times New Roman'
  const title = c.title.trim()
  const lines: string[] = []
  if (has(c.author)) lines.push(`Présenté par : ${c.author.trim()}`)
  if (has(c.group)) lines.push(`Filière : ${(c.group ?? '').trim()}`)
  if (has(c.supervisor)) lines.push(`Encadreur : ${c.supervisor.trim()}`)
  for (const x of c.extras ?? []) if (x.trim()) lines.push(x.trim())
  const nodes: (Node | null)[] = [
    has(c.school) ? T(U(c.school), 14, F, { bold: true, align: 'center', after: 12, lh: 1.25 }) : null,
    logoN(c, 90, 'center', 24),
    has(c.kind) ? T(U(c.kind), 14, F, { bold: true, align: 'center', before: 24, after: 12 }) : null,
    title ? rule(1, '000000', { before: 8, after: 14 }) : null,
    title ? T(title, fit(title, { font: F, bold: true, width: W, maxH: H * 0.3, max: 22, min: 15, lh: 1.25 }), F, { bold: true, align: 'center', lh: 1.25 }) : null,
    title ? rule(1, '000000', { before: 14, after: 28 }) : null,
    ...lines.map(l => T(l, 13, F, { align: 'center', after: 6 })),
    has(c.year) ? T(`Année académique : ${c.year.trim()}`, 13, F, { align: 'center', before: 24 }) : null,
  ]
  return { grid: [W], rows: [row(H, [cell(nodes, { valign: 'top', pad: [40, 0, 0, 0] })])] }
}

export const COVER_TEMPLATES: TemplateInfo[] = [
  { id: 'academique', name: 'Académique', tagline: 'Classique, centré, filets doubles', build: academique },
  { id: 'colonne', name: 'Colonne', tagline: 'Bandeau vert plein hauteur', build: colonne },
  { id: 'editorial', name: 'Éditorial', tagline: 'Titre géant, barre d’accent', build: editorial },
  { id: 'millesime', name: 'Millésime', tagline: 'L’année en grand format', build: millesime },
  { id: 'cartouche', name: 'Cartouche', tagline: 'Bloc technique encadré', build: cartouche },
  { id: 'monolithe', name: 'Monolithe', tagline: 'Titre dans un bloc sombre', build: monolithe },
  { id: 'monogramme', name: 'Monogramme', tagline: 'Initiale encadrée, filet vertical', build: monogramme },
  { id: 'horizons', name: 'Horizons', tagline: 'Trois bandes horizontales', build: horizons },
  { id: 'reperes', name: 'Repères', tagline: 'Informations numérotées', build: reperes },
  { id: 'classique', name: 'Classique', tagline: 'Le modèle d’origine, simple et centré', build: classique },
]
export const DEFAULT_COVER_TEMPLATE = 'academique'
/** « cascade » (ancien gabarit retiré) renvoie vers « classique » pour les documents déjà enregistrés. */
export const templateOf = (id?: string): TemplateInfo => COVER_TEMPLATES.find(t => t.id === (id === 'cascade' ? 'classique' : id)) ?? COVER_TEMPLATES[0]

/** Hauteur réservée en bas de la page de garde pour le paragraphe qui termine la section dans Word. */
export const COVER_RESERVE = 30

/** La page de garde complète pour un gabarit : W et H = zone de texte de la page (pt). */
export function coverTable(c: Cover, W: number, H: number): CoverTable {
  return harden(templateOf(c.template).build(c, W, H - COVER_RESERVE))
}

/** Polices utilisées par un gabarit (pour les charger avant l'aperçu). */
export function coverFonts(t: CoverTable): CoverFont[] {
  const s = new Set<CoverFont>()
  t.rows.forEach(r => r.cells.forEach(c => c.nodes.forEach(n => { if (n.t === 'text') s.add(n.font) })))
  return [...s]
}

/** Textes d'exemple pour les vignettes quand les champs sont encore vides. */
export const SAMPLE_COVER: Omit<Cover, 'enabled' | 'template'> = {
  school: 'Institut Universitaire d’Abidjan',
  kind: 'Mémoire',
  title: 'Optimisation de la chaîne logistique d’une PME agroalimentaire',
  author: 'Dominique Koffi',
  group: 'Licence 3 Logistique',
  supervisor: 'Dr Claude N’Guessan',
  year: '2025-2026',
  extras: [],
}
