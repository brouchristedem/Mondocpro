import {
  AlignmentType, Bookmark, BorderStyle, Document, Footer, Header, ImageRun, LevelFormat, NumberFormat, Packer,
  Paragraph, PageNumber, PageReference, PageOrientation, SectionType, SimpleField, Table, TableCell, TableLayoutType,
  TableOfContents, TableRow, TabStopType, TextRun, VerticalAlign, WidthType, HeadingLevel,
  type ISectionOptions,
} from 'docx'
import type { Block, Settings } from './types'

const A4 = { w: 11906, h: 16838 }
type Child = Paragraph | Table | TableOfContents
interface Seg { landscape: boolean; children: Child[] }

const half = (pt: number) => Math.round(pt * 2)

function runs(text: string, base: { size?: number; bold?: boolean } = {}): TextRun[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).filter(Boolean).map(s =>
    s.startsWith('**') ? new TextRun({ ...base, text: s.slice(2, -2), bold: true })
      : s.startsWith('*') && s.length > 2 ? new TextRun({ ...base, text: s.slice(1, -1), italics: true })
      : new TextRun({ ...base, text: s }))
}

function dataToBytes(url: string): { data: Uint8Array; type: 'png' | 'jpg' } {
  const m = url.match(/^data:image\/(png|jpe?g);base64,(.*)$/)
  if (!m) throw new Error('Logo non supporté (PNG ou JPG)')
  const bin = atob(m[2])
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  return { data, type: m[1] === 'png' ? 'png' : 'jpg' }
}

export function buildDocument(blocks: Block[], s: Settings, preview = false): Document {
  const margins = { top: 1417, bottom: 1417, left: s.reliure ? 1701 : 1417, right: 1417 }
  const width = (landscape: boolean) => (landscape ? A4.h : A4.w) - margins.left - margins.right

  const footer = (landscape: boolean) => {
    const num = new TextRun({ children: s.footer === 'page' ? ['Page ', PageNumber.CURRENT] : [PageNumber.CURRENT], size: half(s.size - 2) })
    if (s.footer === 'text' && s.footerText.trim()) {
      return new Footer({ children: [new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: width(landscape) }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 4 } },
        children: [new TextRun({ text: s.footerText, size: half(s.size - 2) }), new TextRun({ text: '\t', size: half(s.size - 2) }), num],
      })] })
    }
    return new Footer({ children: [new Paragraph({ alignment: s.numAlign === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER, children: [num] })] })
  }
  const header = () => s.headerText.trim()
    ? new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 4 } },
        children: [new TextRun({ text: s.headerText, size: half(s.size - 2), color: '555555' })],
      })] })
    : undefined

  // ---- tableaux ----
  let tableNo = 0
  const captions: string[] = []
  const tableChildren = (b: Extract<Block, { t: 'table' }>, landscape: boolean): Child[] => {
    const cols = b.rows[0].length
    const size = cols >= 7 ? 9 : cols >= 5 ? Math.max(9, s.size - 2) : Math.max(9, s.size - 1)
    const weights = b.rows[0].map((_, c) => Math.min(40, Math.max(5, ...b.rows.map(r => r[c].length))))
    const total = weights.reduce((a, x) => a + x, 0)
    const W = width(landscape)
    const colW = weights.map(w => Math.floor((w / total) * W))
    const cell = (text: string, ci: number, head: boolean) => new TableCell({
      width: { size: colW[ci], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      shading: head ? { fill: 'E6ECFA', type: 'clear', color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ style: 'TableText', alignment: head ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(text, { size: half(size), bold: head }) })],
    })
    const rows = b.rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, cantSplit: true, children: r.map((t, ci) => cell(t, ci, ri === 0)) }))
    const out: Child[] = []
    if (b.caption !== undefined) {
      tableNo++
      captions.push(b.caption)
      out.push(new Paragraph({ style: 'Caption', keepNext: true, children: [new Bookmark({ id: `tbl${tableNo}`, children: [
        new TextRun('Tableau '), new SimpleField('SEQ Tableau \\* ARABIC', String(tableNo)), new TextRun(b.caption ? ` : ${b.caption}` : ''),
      ] })] }))
    }
    out.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: colW, layout: TableLayoutType.FIXED, rows }))
    out.push(new Paragraph({ spacing: { after: 160 }, children: [] }))
    return out
  }

  // ---- corps : segments portrait / paysage ----
  const segs: Seg[] = [{ landscape: false, children: [] }]
  const cur = () => segs[segs.length - 1]
  const headings: { level: number; text: string }[] = []
  for (const b of blocks) {
    if (b.t === 'table') {
      const wide = s.landscape && b.rows[0].length >= 6
      if (wide) {
        if (!cur().children.length) segs.pop()
        segs.push({ landscape: true, children: tableChildren(b, true) })
        segs.push({ landscape: false, children: [] })
      } else cur().children.push(...tableChildren(b, false))
    } else if (b.t === 'h') {
      headings.push({ level: b.level, text: b.text })
      const first = cur().children.length === 0
      cur().children.push(new Paragraph({
        heading: (['Heading1', 'Heading2', 'Heading3', 'Heading4'] as const).map((_, i) => [
          'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4'][i])[b.level - 1] as never,
        pageBreakBefore: b.level === 1 && s.chapterBreak && !first,
        children: runs(b.text),
      }))
    } else if (b.t === 'li') {
      cur().children.push(new Paragraph({ style: 'Body', numbering: { reference: 'bullets', level: 0 }, children: runs(b.text) }))
    } else {
      cur().children.push(new Paragraph({ style: 'Body', children: runs(b.text) }))
    }
  }
  if (!cur().children.length) segs.pop()

  // ---- page de garde ----
  const c = s.cover
  const cover: Paragraph[] = []
  if (c.enabled) {
    const centered = (text: string, size: number, o: { bold?: boolean; before?: number; after?: number } = {}) =>
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: o.before ?? 0, after: o.after ?? 120, line: 276 }, children: [new TextRun({ text, size: half(size), bold: o.bold })] })
    cover.push(centered(c.school.toUpperCase(), s.size + 2, { bold: true, before: 1200, after: 240 }))
    if (c.logo) {
      const { data, type } = dataToBytes(c.logo.url)
      const h = 90, w = Math.round((c.logo.w / c.logo.h) * h)
      cover.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new ImageRun({ type, data, transformation: { width: w, height: h }, altText: { title: 'Logo', description: 'Logo', name: 'logo' } })] }))
    }
    if (c.kind.trim()) cover.push(centered(c.kind.toUpperCase(), s.size + 2, { before: 480, after: 240 }))
    if (c.title.trim()) cover.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 600, line: 300 },
      border: { top: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 12 }, bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 12 } },
      children: [new TextRun({ text: c.title, size: half(s.size + 8), bold: true })],
    }))
    if (c.author.trim()) cover.push(centered(`Présenté par : ${c.author}`, s.size, { before: 240 }))
    if (c.supervisor.trim()) cover.push(centered(`Encadreur : ${c.supervisor}`, s.size))
    if (c.year.trim()) cover.push(centered(`Année académique : ${c.year}`, s.size, { before: 480 }))
  }

  // ---- pages préliminaires : sommaire (+ liste des tableaux) ----
  const frontTitle = (t: string) => new Paragraph({ style: 'FrontTitle', children: [new TextRun(t)] })
  const staticToc = (items: { level: number; text: string }[]) => items.filter(h => h.level <= 3).map(h =>
    new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, leader: 'dot', position: width(false) }], indent: { left: (h.level - 1) * 360 }, spacing: { after: 80 }, children: [new TextRun({ text: h.text, bold: h.level === 1 }), new TextRun({ text: '\t…' })] }))
  const prelim: Child[] = []
  if (s.toc && headings.length) {
    prelim.push(frontTitle('SOMMAIRE'))
    if (preview) prelim.push(...staticToc(headings))
    else prelim.push(new TableOfContents('Sommaire', { hyperlink: true, headingStyleRange: '1-3' }))
    if (s.tablesList && tableNo > 0) {
      prelim.push(new Paragraph({ pageBreakBefore: true, style: 'FrontTitle', children: [new TextRun('LISTE DES TABLEAUX')] }))
      captions.forEach((t, i) => prelim.push(new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, leader: 'dot', position: width(false) }], spacing: { after: 80 },
        children: [new TextRun(`Tableau ${i + 1}${t ? ` : ${t}` : ''}`), new TextRun('\t'), preview ? new TextRun('…') : new PageReference(`tbl${i + 1}`)],
      })))
    }
  }

  // ---- assemblage des sections ----
  const hdr = header()
  const sections: ISectionOptions[] = []
  const page = (landscape: boolean, pageNumbers?: { start?: number; formatType?: (typeof NumberFormat)[keyof typeof NumberFormat] }) => ({
    size: { width: A4.w, height: A4.h, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
    margin: margins,
    pageNumbers,
  })
  if (cover.length) sections.push({ properties: { page: page(false) }, children: cover })
  const body = segs.length ? segs : [{ landscape: false, children: [new Paragraph({ children: [] })] }]
  if (prelim.length) {
    sections.push({
      properties: { type: SectionType.NEXT_PAGE, page: page(false, { start: 1, formatType: s.romanPrelim ? NumberFormat.LOWER_ROMAN : NumberFormat.DECIMAL }) },
      headers: hdr ? { default: hdr } : undefined, footers: { default: footer(false) }, children: prelim as Paragraph[],
    })
  }
  body.forEach((g, i) => {
    const restart = i === 0 && (!prelim.length || s.romanPrelim)
    sections.push({
      properties: { type: SectionType.NEXT_PAGE, page: page(g.landscape, restart ? { start: 1, formatType: NumberFormat.DECIMAL } : { formatType: NumberFormat.DECIMAL }) },
      headers: hdr ? { default: hdr } : undefined, footers: { default: footer(g.landscape) }, children: g.children as Paragraph[],
    })
  })

  const line = Math.round(s.spacing * 240)
  const f = s.font
  return new Document({
    creator: 'mondocpro', title: c.title || 'Document',
    features: { updateFields: !preview },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    styles: {
      default: { document: { run: { font: f, size: half(s.size) } } },
      paragraphStyles: [
        { id: 'Body', name: 'Body', basedOn: 'Normal', quickFormat: true, run: { font: f, size: half(s.size) },
          paragraph: { alignment: s.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT, spacing: { line, after: 120 }, indent: s.indent ? { firstLine: 709 } : undefined } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size + 4), bold: true, allCaps: true }, paragraph: { keepNext: true, spacing: { before: 240, after: 240, line: 276 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size + 2), bold: true }, paragraph: { keepNext: true, spacing: { before: 280, after: 120, line: 276 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size + 1), bold: true, italics: true }, paragraph: { keepNext: true, spacing: { before: 240, after: 100, line: 276 }, outlineLevel: 2 } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size), italics: true }, paragraph: { keepNext: true, spacing: { before: 200, after: 80, line: 276 }, outlineLevel: 3 } },
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size - 1), bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 } } },
        { id: 'TableText', name: 'Table Text', basedOn: 'Normal', run: { font: f }, paragraph: { spacing: { line: 252 } } },
        { id: 'FrontTitle', name: 'Front Title', basedOn: 'Normal', next: 'Body', run: { font: f, size: half(s.size + 4), bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 360 } } },
      ],
    },
    sections,
  })
}

export async function toBlob(blocks: Block[], s: Settings, preview = false): Promise<Blob> {
  return Packer.toBlob(buildDocument(blocks, s, preview))
}
