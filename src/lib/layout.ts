import type { Block, Settings } from './types'
import { A4, plan, type Item, type Plan } from './plan'
import { fontInfo, loadFont } from './fonts'

/**
 * Moteur de pagination : calcule, avec les vraies polices, où tombent les pages d'un document Word.
 * Il sert à deux choses : l'aperçu (vraies pages, vrais numéros) et les numéros déjà écrits dans
 * le sommaire du fichier Word (il n'a donc plus besoin d'être « mis à jour »).
 */

const PX = 96 / 72
const EPS = 0.6
const pt = (tw: number) => tw / 20

export interface Page { kind: 'cover' | 'front' | 'body'; landscape: boolean; label: string; html: string }
export interface Layout {
  pages: Page[]
  /** numéro de page imprimé de chaque titre (même ordre que les titres du document) */
  headingLabels: string[]
  /** numéro de page imprimé de chaque légende de tableau */
  captionLabels: string[]
}

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function inline(text: string): string {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).filter(Boolean).map(s =>
    s.startsWith('**') ? `<b>${esc(s.slice(2, -2))}</b>`
      : s.startsWith('*') && s.length > 2 ? `<i>${esc(s.slice(1, -1))}</i>` : esc(s)).join('')
}

const roman = (n: number) => {
  const m: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let o = ''
  for (const [v, r] of m) while (n >= v) { o += r; n -= v }
  return o
}

/* ---------- boîtes mesurables ---------- */
interface Para {
  kind: 'para'
  before: number; after: number; keepNext: boolean; pageBreakBefore: boolean
  lines: number; lh: number
  html: string // paragraphe complet
  src?: Item
  late?: (labels: Labels) => string // contenu dépendant des numéros de page (sommaire)
}
interface Tbl {
  kind: 'table'
  before: 0; after: 0; keepNext: false; pageBreakBefore: false
  rowH: number[]
  open: string; rows: string[]; // balises de table + html de chaque ligne
}
type Box = Para | Tbl
interface Labels { headings: string[]; captions: string[] }
interface Part { box: Box; from: number; to: number; before: number; repeatHeader: boolean }
interface Acc { landscape: boolean; parts: Part[]; used: number; soft: boolean }

export async function layoutDocument(blocks: Block[], s: Settings): Promise<Layout> {
  await loadFont(s.font)
  const P = plan(blocks, s)
  const F = fontInfo(s.font)
  const natural = (size: number) => F.lh * size
  const m = P.margins
  const textW = (land: boolean) => pt((land ? A4.h : A4.w) - m.left - m.right)
  const bodyH = (land: boolean) => pt((land ? A4.w : A4.h) - m.top - m.bottom)
  const mult = Math.round(s.spacing * 240) / 240

  const base = (size: number, lh: number, extra = '') =>
    `font-family:${F.css};font-size:${size}pt;line-height:${lh}pt;margin:0;padding:0;font-kerning:none;font-variant-ligatures:none;` +
    `overflow-wrap:break-word;word-break:normal;hyphens:manual;${extra}`

  /* ----- mesure ----- */
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;pointer-events:none;'
  host.setAttribute('data-layout-host', '')
  document.querySelectorAll('[data-layout-host]').forEach(e => e.remove())
  document.body.appendChild(host)
  const measureBlock = (widthPt: number, html: string): HTMLElement => {
    const d = document.createElement('div')
    d.style.cssText = `width:${widthPt}pt;`
    d.innerHTML = html
    host.appendChild(d)
    return d
  }
  const lineCount = (widthPt: number, html: string, lh: number): number => {
    const d = measureBlock(widthPt, html)
    const h = (d.firstElementChild as HTMLElement).getBoundingClientRect().height
    host.removeChild(d)
    return Math.max(1, Math.round(h / (lh * PX)))
  }

  const boxes: Box[] = []
  const para = (o: Omit<Para, 'kind' | 'lines' | 'lh' | 'html'> & { html: string; size: number; lh: number; width: number }): Para => {
    const { html, size: _s, lh, width, ...rest } = o
    return { kind: 'para', lines: lineCount(width, html, lh), lh, html, ...rest }
  }

  /* ----- styles de paragraphe (miroir exact des styles du Word) ----- */
  const bodyStyle = (w: number, text: string, extra = '') => {
    const lh = natural(s.size) * mult
    const html = `<div style="${base(s.size, lh, `text-align:${s.justify ? 'justify' : 'left'};${s.indent ? 'text-indent:35.45pt;' : ''}${extra}`)}">${inline(text)}</div>`
    return { html, lh, size: s.size, width: w }
  }
  const HSTY = [
    { d: 4, b: true, i: false, caps: true, bef: 12, aft: 12 },
    { d: 2, b: true, i: false, caps: false, bef: 14, aft: 6 },
    { d: 1, b: true, i: true, caps: false, bef: 12, aft: 5 },
    { d: 0, b: false, i: true, caps: false, bef: 10, aft: 4 },
  ]

  const segBoxes = (segIndex: number): Box[] => {
    const seg = P.segs[segIndex]
    const w = textW(seg.landscape)
    const out: Box[] = []
    for (const it of seg.items) {
      if (it.k === 'h') {
        const st = HSTY[it.level - 1]
        const size = s.size + st.d
        const lh = natural(size) * 1.15
        const html = `<div style="${base(size, lh, `font-weight:${st.b ? 700 : 400};font-style:${st.i ? 'italic' : 'normal'};${st.caps ? 'text-transform:uppercase;' : ''}text-align:left;`)}">${inline(it.text)}</div>`
        out.push(para({ before: st.bef, after: st.aft, keepNext: true, pageBreakBefore: it.pageBreakBefore, html, size, lh, width: w, src: it }))
      } else if (it.k === 'p') {
        const b = bodyStyle(w, it.text)
        out.push(para({ before: 0, after: 6, keepNext: false, pageBreakBefore: false, ...b }))
      } else if (it.k === 'li') {
        const lh = natural(s.size) * mult
        const html = `<div style="${base(s.size, lh, `text-align:${s.justify ? 'justify' : 'left'};padding-left:36pt;text-indent:-18pt;`)}"><span style="display:inline-block;width:18pt;text-indent:0">•</span>${inline(it.text)}</div>`
        out.push(para({ before: 0, after: 6, keepNext: false, pageBreakBefore: false, html, size: s.size, lh, width: w }))
      } else if (it.k === 'cap') {
        const size = s.size - 1, lh = natural(size)
        const html = `<div style="${base(size, lh, 'font-weight:700;text-align:center;')}">Tableau ${it.no}${it.caption ? ` : ${esc(it.caption)}` : ''}</div>`
        out.push(para({ before: 10, after: 5, keepNext: true, pageBreakBefore: false, html, size, lh, width: w, src: it }))
      } else if (it.k === 'gap') {
        const lh = natural(s.size)
        out.push(para({ before: 0, after: 8, keepNext: false, pageBreakBefore: false, html: `<div style="${base(s.size, lh)}">&nbsp;</div>`, size: s.size, lh, width: w }))
      } else if (it.k === 'table') {
        out.push(tableBox(it))
      }
    }
    return out
  }

  const tableBox = (it: Extract<Item, { k: 'table' }>): Tbl => {
    const lh = natural(it.size) * 1.05
    const colgroup = `<colgroup>${it.colW.map(c => `<col style="width:${pt(c)}pt">`).join('')}</colgroup>`
    const W = it.colW.reduce((a, x) => a + x, 0)
    const open = `<table style="border-collapse:collapse;table-layout:fixed;width:${pt(W)}pt;">${colgroup}<tbody>`
    const rows = it.rows.map((r, ri) => `<tr>${r.map(t =>
      `<td style="border:0.5pt solid #000;padding:3pt 4.5pt;vertical-align:middle;${ri === 0 ? 'background:#E6ECFA;' : ''}">` +
      `<div style="${base(it.size, lh, `text-align:${ri === 0 ? 'center' : 'left'};font-weight:${ri === 0 ? 700 : 400};overflow-wrap:anywhere;`)}">${inline(t)}</div></td>`).join('')}</tr>`)
    const d = measureBlock(pt(W), `${open}${rows.join('')}</tbody></table>`)
    const rowH = Array.from(d.querySelectorAll('tr')).map(tr => tr.getBoundingClientRect().height / PX - 0.25) // Chrome arrondit la bordure à 1px, Word/LO gardent 0,5 pt
    host.removeChild(d)
    return { kind: 'table', before: 0, after: 0, keepNext: false, pageBreakBefore: false, rowH, open, rows }
  }

  /* ----- pagination ----- */
  const pages: (Acc & { kind: 'front' | 'body' })[] = []
  const headingPage: number[] = []
  const captionPage: number[] = []
  const boxHeight = (b: Box, from = 0, to?: number) => b.kind === 'para' ? ((to ?? b.lines) - from) * b.lh : b.rowH.slice(from, to).reduce((a, x) => a + x, 0)
  /** Word/LibreOffice : entre deux paragraphes, l'espace est le plus grand de « après » et « avant » (pas leur somme). */
  const gap = (b: Box, prevAfter: number) => Math.max(0, b.before - prevAfter)
  const chainNeed = (list: Box[], i: number, prevAfter: number): number => {
    const b = list[i]
    const own = gap(b, prevAfter) + boxHeight(b) + b.after
    const nxt = list[i + 1]
    if (!nxt) return own
    return own + (nxt.keepNext ? chainNeed(list, i + 1, b.after) : gap(nxt, b.after) + (nxt.kind === 'para' ? Math.min(nxt.lines, 2) * nxt.lh : nxt.rowH[0] + (nxt.rowH[1] ?? 0)))
  }

  const paginate = (list: Box[], landscape: boolean, kind: 'front' | 'body') => {
    const H = bodyH(landscape)
    let cur!: Acc & { kind: 'front' | 'body' }
    const start = (soft: boolean) => { cur = { kind, landscape, parts: [], used: 0, soft }; pages.push(cur) }
    start(false)
    const gi = () => pages.length - 1
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      if (b.pageBreakBefore && cur.parts.length) start(false)
      const lastPart = () => cur.parts[cur.parts.length - 1]
      const prevAfter = () => { const l = lastPart(); return l && l.box.kind === 'para' && l.to === l.box.lines ? l.box.after : 0 }
      const eff = () => (cur.parts.length === 0 ? 0 : gap(b, prevAfter()))
      if (b.keepNext && cur.parts.length && cur.used + chainNeed(list, i, prevAfter()) > H + EPS && chainNeed(list, i, 0) <= H) start(true)
      if (b.kind === 'para') {
        if (b.src?.k === 'h') headingPage[b.src.idx] = gi()
        if (b.src?.k === 'cap') captionPage[b.src.no - 1] = gi()
        let from = 0
        for (let guard = 0; guard < 5000; guard++) {
          const rem = b.lines - from
          const before = from === 0 ? eff() : 0
          const avail = H - cur.used - before
          if (rem * b.lh <= avail + EPS) {
            cur.parts.push({ box: b, from, to: b.lines, before, repeatHeader: false })
            cur.used += before + rem * b.lh + b.after
            break
          }
          let k = Math.floor((avail + EPS) / b.lh)
          if (rem - k < 2) k = rem - 2
          if (k < 2 || rem < 4) {
            if (cur.parts.length) { start(true); continue }
            k = Math.max(1, Math.min(rem, Math.floor((H + EPS) / b.lh))) // page vide : on force
            if (k >= rem) {
              cur.parts.push({ box: b, from, to: b.lines, before, repeatHeader: false })
              cur.used += before + rem * b.lh + b.after
              break
            }
          }
          cur.parts.push({ box: b, from, to: from + k, before, repeatHeader: false })
          from += k
          start(true)
        }
      } else {
        let r = 0
        if (cur.parts.length && cur.used + b.rowH[0] + (b.rowH[1] ?? 0) > H + EPS) start(true)
        let first = true
        while (r < b.rowH.length) {
          const head = !first && r > 0 ? b.rowH[0] : 0
          let used = cur.used + head
          let to = r
          while (to < b.rowH.length && used + b.rowH[to] <= H + EPS) { used += b.rowH[to]; to++ }
          if (to === r) {
            if (cur.parts.length) { start(true); first = false; continue }
            to = r + 1; used += b.rowH[r] // ligne plus haute qu'une page : on force
          }
          cur.parts.push({ box: b, from: r, to, before: 0, repeatHeader: head > 0 })
          cur.used = used
          r = to
          first = false
          if (r < b.rowH.length) start(true)
        }
      }
    }
  }

  /* ----- pages préliminaires : sommaire (+ liste des tableaux) ----- */
  const frontBoxes: Box[] = []
  const w0 = textW(false)
  const titleBox = (t: string, brk: boolean): Para => {
    const size = s.size + 4, lh = natural(size)
    return para({ before: 0, after: 18, keepNext: false, pageBreakBefore: brk, html: `<div style="${base(size, lh, 'font-weight:700;text-align:center;')}">${esc(t)}</div>`, size, lh, width: w0 })
  }
  const entryBox = (text: string, level: number, getNum: (l: Labels) => string, bold: boolean): Para => {
    const lh = natural(s.size)
    const ind = level === 0 ? 0 : (level - 1) * 18
    const room = w0 - ind - 24
    const probe = `<div style="${base(s.size, lh, `width:${room}pt;font-weight:${bold ? 700 : 400};`)}">${esc(text)}</div>`
    const lines = lineCount(w0, probe, lh)
    const mk = (n: string) =>
      `<div style="${base(s.size, lh, `margin-left:${ind}pt;display:flex;align-items:flex-end;`)}">` +
      `<span style="flex:0 1 auto;min-width:0;max-width:${room}pt;font-weight:${bold ? 700 : 400};">${esc(text)}</span>` +
      `<span style="flex:1 1 12pt;border-bottom:1.2pt dotted #000;margin:0 2pt 3.5pt;min-width:12pt;"></span><span style="flex:none;">${n}</span></div>`
    return { kind: 'para', before: 0, after: 4, keepNext: false, pageBreakBefore: false, lines, lh, html: mk(''), late: l => mk(getNum(l)) }
  }
  const tocItems = P.headings.map((h, i) => ({ ...h, i })).filter(h => h.level <= 3)
  if (s.toc && P.headings.length) {
    frontBoxes.push(titleBox('SOMMAIRE', false))
    for (const h of tocItems) frontBoxes.push(entryBox(h.text, h.level, l => l.headings[h.i] ?? '', h.level === 1))
    if (s.tablesList && P.captions.length) {
      frontBoxes.push(titleBox('LISTE DES TABLEAUX', true))
      P.captions.forEach((c, i) => frontBoxes.push(entryBox(`Tableau ${i + 1}${c ? ` : ${c}` : ''}`, 0, l => l.captions[i] ?? '', false)))
    }
  }
  if (frontBoxes.length) paginate(frontBoxes, false, 'front')
  const frontCount = pages.length

  /* ----- corps ----- */
  const segStart: number[] = []
  if (!P.segs.length) {
    const lh = natural(s.size)
    paginate([para({ before: 0, after: 0, keepNext: false, pageBreakBefore: false, html: `<div style="${base(s.size, lh)}">&nbsp;</div>`, size: s.size, lh, width: textW(false) })], false, 'body')
  } else {
    for (let i = 0; i < P.segs.length; i++) { segStart.push(pages.length); paginate(segBoxes(i), P.segs[i].landscape, 'body') }
  }
  host.remove()

  /* ----- numéros de page imprimés ----- */
  const labels: string[] = []
  const hasCover = s.cover.enabled
  const decimalFront = !s.romanPrelim
  pages.forEach((p, i) => {
    if (p.kind === 'front') labels.push(s.romanPrelim ? roman(i + 1) : String(i + 1))
    else labels.push(String(frontCount && decimalFront ? i + 1 : i - frontCount + 1))
  })
  const lab: Labels = {
    headings: headingPage.map(p => labels[p] ?? ''),
    captions: captionPage.map(p => labels[p] ?? ''),
  }

  /* ----- rendu HTML de chaque page ----- */
  const render = (p: Acc & { kind: 'front' | 'body' }, idx: number): Page => {
    const body = p.parts.map(pt_ => {
      const b = pt_.box
      if (b.kind === 'para') {
        const inner = b.late ? b.late(lab) : b.html
        const frag = pt_.from === 0 && pt_.to === b.lines ? inner
          : `<div style="height:${(pt_.to - pt_.from) * b.lh}pt;overflow:hidden;"><div style="margin-top:${-pt_.from * b.lh}pt;">${inner}</div></div>`
        return `<div style="padding-top:${pt_.before}pt;padding-bottom:${pt_.to === b.lines ? b.after : 0}pt;">${frag}</div>`
      }
      const rows = (pt_.repeatHeader ? [b.rows[0]] : []).concat(b.rows.slice(pt_.from, pt_.to)).join('')
      return `<div>${b.open}${rows}</tbody></table></div>`
    }).join('')
    return { kind: p.kind, landscape: p.landscape, label: labels[idx], html: pageShell(p.landscape, body, labels[idx]) }
  }

  const sz = s.size - 2
  const footerHtml = (label: string, land: boolean) => {
    const num = s.footer === 'page' ? `Page ${label}` : label
    const style = `font-family:${F.css};font-size:${sz}pt;line-height:${natural(sz)}pt;`
    if (s.footer === 'text' && s.footerText.trim())
      return `<div style="${style}display:flex;justify-content:space-between;border-top:0.5pt solid #999;padding-top:4pt;"><span>${esc(s.footerText)}</span><span>${num}</span></div>`
    return `<div style="${style}text-align:${s.numAlign === 'right' ? 'right' : 'center'};">${num}</div>`
  }
  const headerHtml = () => s.headerText.trim()
    ? `<div style="font-family:${F.css};font-size:${sz}pt;line-height:${natural(sz)}pt;color:#555;text-align:right;border-bottom:0.5pt solid #999;padding-bottom:4pt;">${esc(s.headerText)}</div>` : ''

  const pageShell = (land: boolean, body: string, label: string) => {
    const W = pt(land ? A4.h : A4.w), Hh = pt(land ? A4.w : A4.h)
    return `<div class="sheet" style="width:${W}pt;height:${Hh}pt;">` +
      `<div class="hd" style="left:${pt(m.left)}pt;right:${pt(m.right)}pt;top:35.4pt;">${headerHtml()}</div>` +
      `<div class="bd" style="left:${pt(m.left)}pt;right:${pt(m.right)}pt;top:${pt(m.top)}pt;height:${bodyH(land)}pt;"><div style="display:flex;flex-direction:column;">${body}</div></div>` +
      `<div class="ft" style="left:${pt(m.left)}pt;right:${pt(m.right)}pt;bottom:35.4pt;">${footerHtml(label, land)}</div></div>`
  }

  /* ----- page de garde ----- */
  const coverPage = (): Page => {
    const c = s.cover
    const ctr = (text: string, size: number, o: { bold?: boolean; before?: number; after?: number } = {}) =>
      `<div style="${base(size, natural(size) * 1.15, `text-align:center;font-weight:${o.bold ? 700 : 400};padding-top:${o.before ?? 0}pt;padding-bottom:${(o.after ?? 120) / 20}pt;`)}">${esc(text)}</div>`
    const parts: string[] = []
    parts.push(ctr(c.school.toUpperCase(), s.size + 2, { bold: true, before: 60, after: 240 }))
    if (c.logo) {
      const h = 90 / PX
      parts.push(`<div style="text-align:center;padding-bottom:24pt;"><img alt="" src="${c.logo.url}" style="height:${h}pt;width:${(c.logo.w / c.logo.h) * h}pt;"></div>`)
    }
    if (c.kind.trim()) parts.push(ctr(c.kind.toUpperCase(), s.size + 2, { bold: true, before: 24, after: 240 }))
    if (c.title.trim()) parts.push(`<div style="${base(s.size + 8, natural(s.size + 8) * 1.25, 'text-align:center;font-weight:700;border-top:1pt solid #000;border-bottom:1pt solid #000;padding:12pt 0;margin:6pt 0 30pt;')}">${esc(c.title)}</div>`)
    if (c.author.trim()) parts.push(ctr(`Présenté par : ${c.author}`, s.size, { before: 12 }))
    if (c.supervisor.trim()) parts.push(ctr(`Encadreur : ${c.supervisor}`, s.size))
    if (c.year.trim()) parts.push(ctr(`Année académique : ${c.year}`, s.size, { before: 24 }))
    const html = `<div class="sheet" style="width:${pt(A4.w)}pt;height:${pt(A4.h)}pt;"><div class="bd" style="left:${pt(m.left)}pt;right:${pt(m.right)}pt;top:${pt(m.top)}pt;height:${bodyH(false)}pt;">${parts.join('')}</div></div>`
    return { kind: 'cover', landscape: false, label: '', html }
  }

  const out: Page[] = []
  if (hasCover) out.push(coverPage())
  pages.forEach((p, i) => out.push(render(p, i)))
  return { pages: out, headingLabels: lab.headings, captionLabels: lab.captions }
}

export type { Plan }
