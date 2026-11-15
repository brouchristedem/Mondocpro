import {
  AlignmentType, Bookmark, BorderStyle, Document, Footer, Header, LeaderType, LevelFormat, LineRuleType, NumberFormat, Packer,
  Paragraph, PageNumber, PageOrientation, SectionType, SimpleField, Table, TableCell, TableLayoutType,
  ShadingType, TableRow, TabStopType, TextRun, VerticalAlign, WidthType,
  type ISectionOptions,
} from 'docx'
import JSZip from 'jszip'
import { CELL_BR, type Block, type Settings } from './types'
import { A4, plan, widthOf, type Item } from './plan'
import { coverDocx } from './coverDocx'

type Child = Paragraph | Table
/** Numéros de page déjà calculés (voir layout.ts) : écrits dans le sommaire pour qu'il soit rempli dès l'ouverture. */
export interface PageNumbers { headings: string[]; captions: string[] }

const half = (pt: number) => Math.round(pt * 2)
const TOC_MARK = '@@TOC@@'
const tocId = (i: number) => `_Toc${100000 + i}`

function runs(text: string, base: { size?: number; bold?: boolean } = {}): TextRun[] {
  // CELL_BR = saut de ligne dans une cellule (puces d'un organigramme) : chaque ligne repart sous la précédente
  return text.split(CELL_BR).flatMap((line, li) => {
    const out = line.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).filter(Boolean).map(s =>
      s.startsWith('**') ? new TextRun({ ...base, text: s.slice(2, -2), bold: true })
        : s.startsWith('*') && s.length > 2 ? new TextRun({ ...base, text: s.slice(1, -1), italics: true })
        : new TextRun({ ...base, text: s }))
    if (li > 0) return [new TextRun({ ...base, text: '', break: 1 }), ...out]
    return out
  })
}

export function buildDocument(blocks: Block[], s: Settings, nums?: PageNumbers): Document {
  const P = plan(blocks, s)
  const margins = P.margins
  const width = (landscape: boolean) => widthOf(s, landscape)

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

  // ---- corps : un élément du plan = un objet Word ----
  const tableChildren = (it: Extract<Item, { k: 'table' }>): Table => {
    const cols = it.colW.length
    const GREY = { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } as const
    const isHead = (ri: number) => ri === 0 || it.heads.includes(ri) || it.merged.includes(ri)
    const cell = (text: string, ci: number, head: boolean, span = 1) => new TableCell({
      width: { size: span === 1 ? it.colW[ci] : it.W, type: WidthType.DXA },
      columnSpan: span > 1 ? span : undefined,
      verticalAlign: VerticalAlign.CENTER,
      shading: head && (cols >= 3 || it.merged.length) ? GREY : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ style: 'TableText', alignment: head ? AlignmentType.CENTER : AlignmentType.LEFT, children: runs(text, { size: half(it.size), bold: head }) })],
    })
    const rows = it.rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0 && !it.merged.includes(0), cantSplit: true,
      children: it.merged.includes(ri) ? [cell(r[0], 0, true, cols)] : r.map((t, ci) => cell(t, ci, isHead(ri))),
    }))
    // bordures simples explicites : on ne dépend pas des valeurs par défaut de la bibliothèque ni de Word
    const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const // 4 = 0,5 pt, comme l'aperçu
    return new Table({
      width: { size: it.W, type: WidthType.DXA }, columnWidths: it.colW, layout: TableLayoutType.FIXED, rows,
      borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    })
  }
  const toChild = (it: Item): Child => {
    switch (it.k) {
      case 'title':
        return new Paragraph({
          style: it.sub ? 'DocSubtitle' : 'DocTitle',
          keepNext: true,
          children: [new TextRun(it.text)],
        })
      case 'h':
        return new Paragraph({
          heading: (['Heading 1', 'Heading 2', 'Heading 3', 'Heading 4'][it.level - 1]) as never,
          pageBreakBefore: it.pageBreakBefore,
          children: [new Bookmark({ id: tocId(it.idx), children: runs(it.text) })],
        })
      case 'li': return new Paragraph({ style: 'Body', numbering: { reference: 'bullets', level: 0 }, children: runs(it.text) })
      case 'p': return new Paragraph({ style: 'Body', children: runs(it.text) })
      case 'cap': return new Paragraph({ style: 'Caption', keepNext: true, children: [new Bookmark({ id: `tbl${it.no}`, children: [
        new TextRun('Tableau '), new SimpleField('SEQ Tableau \\* ARABIC', String(it.no)), new TextRun(it.caption ? ` : ${it.caption}` : ''),
      ] })] })
      case 'table': return tableChildren(it)
      case 'gap': return new Paragraph({ spacing: { after: 160 }, children: [] })
    }
  }
  const segs = P.segs.map(g => ({ landscape: g.landscape, children: g.items.map(toChild) }))

  // ---- page de garde : gabarit choisi (voir coverTemplates.ts), même dessin que l'aperçu ----
  const c = s.cover
  const cover: Child[] = c.enabled ? coverDocx(c, width(false) / 20, (A4.h - margins.top - margins.bottom) / 20) : []

  // ---- pages préliminaires : sommaire (rempli au moment de l'envoi, voir injectToc) + liste des tableaux ----
  const frontTitle = (t: string) => new Paragraph({ style: 'FrontTitle', children: [new TextRun(t)] })
  const prelim: Paragraph[] = []
  const hasToc = s.toc && P.headings.some(h => h.level <= 4)
  if (s.toc && P.headings.length) {
    prelim.push(frontTitle('SOMMAIRE'))
    if (hasToc) prelim.push(new Paragraph({ children: [new TextRun(TOC_MARK)] }))
    if (s.tablesList && P.captions.length) {
      prelim.push(new Paragraph({ pageBreakBefore: true, style: 'FrontTitle', children: [new TextRun('LISTE DES TABLEAUX')] }))
      P.captions.forEach((t, i) => prelim.push(new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, leader: 'dot', position: width(false) }], spacing: { after: 80 },
        children: [new TextRun(`Tableau ${i + 1}${t ? ` : ${t}` : ''}`), new TextRun('\t'), new SimpleField(`PAGEREF tbl${i + 1} \\h`, nums?.captions[i] ?? '')],
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
      headers: hdr ? { default: hdr } : undefined, footers: { default: footer(false) }, children: prelim,
    })
  }
  body.forEach((g, i) => {
    const restart = i === 0 && (!prelim.length || s.romanPrelim)
    sections.push({
      properties: { type: SectionType.NEXT_PAGE, page: page(g.landscape, restart ? { start: 1, formatType: NumberFormat.DECIMAL } : { formatType: NumberFormat.DECIMAL }) },
      headers: hdr ? { default: hdr } : undefined, footers: { default: footer(g.landscape) }, children: g.children,
    })
  })

  const line = Math.round(s.spacing * 240)
  const f = s.font
  const W0 = width(false)
  const tocStyle = (n: number) => ({
    id: `TOC${n}`, name: `toc ${n}`, basedOn: 'Normal', next: 'Normal', uiPriority: 39,
    run: { font: f, bold: n === 1 },
    paragraph: { tabStops: [{ type: TabStopType.RIGHT, leader: LeaderType.DOT, position: W0 }], spacing: { after: 80 }, indent: { left: (n - 1) * 360 } },
  })
  return new Document({
    creator: 'mondocpro', title: c.title || 'Document',
    // sans numéros calculés (tests), Word les remplit lui-même à l'ouverture ; avec, plus aucune question posée
    features: { updateFields: !nums },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    styles: {
      default: { document: { run: { font: f, size: half(s.size), language: { value: 'fr-FR' } } } },
      paragraphStyles: [
        { id: 'Body', name: 'Body', basedOn: 'Normal', quickFormat: true, run: { font: f, size: half(s.size) },
          paragraph: { alignment: s.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT, spacing: { line, lineRule: LineRuleType.AUTO, after: 120 }, indent: s.indent ? { firstLine: 709 } : undefined } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size + 4), bold: true, allCaps: true }, paragraph: { keepNext: true, spacing: { before: 240, after: 240, line: 276, lineRule: LineRuleType.AUTO }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size + 2), bold: true }, paragraph: { keepNext: true, spacing: { before: 280, after: 120, line: 276, lineRule: LineRuleType.AUTO }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size + 1), bold: true, italics: true }, paragraph: { keepNext: true, spacing: { before: 240, after: 100, line: 276, lineRule: LineRuleType.AUTO }, outlineLevel: 2 } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size), italics: true }, paragraph: { keepNext: true, spacing: { before: 200, after: 80, line: 276, lineRule: LineRuleType.AUTO }, outlineLevel: 3 } },
        { id: 'DocTitle', name: 'Document Title', basedOn: 'Normal', next: 'Body', run: { font: f, size: half(s.size + 6), bold: true }, paragraph: { alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 0, after: 120, line: 276, lineRule: LineRuleType.AUTO } } },
        { id: 'DocSubtitle', name: 'Document Subtitle', basedOn: 'Normal', next: 'Body', run: { font: f, size: half(s.size + 2), italics: true }, paragraph: { alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 60, after: 360, line: 276, lineRule: LineRuleType.AUTO } } },
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Body', quickFormat: true, run: { font: f, size: half(s.size - 1), bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 } } },
        { id: 'TableText', name: 'Table Text', basedOn: 'Normal', run: { font: f }, paragraph: { spacing: { line: 252, lineRule: LineRuleType.AUTO } } },
        { id: 'FrontTitle', name: 'Front Title', basedOn: 'Normal', next: 'Body', run: { font: f, size: half(s.size + 4), bold: true }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 360 } } },
        tocStyle(1), tocStyle(2), tocStyle(3), tocStyle(4),
      ],
    },
    sections,
  })
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Remplace le repère du sommaire par un vrai champ « Table des matières » déjà rempli (titres + numéros de page). */
async function injectToc(zip: JSZip, blocks: Block[], s: Settings, nums?: PageNumbers) {
  // veuves et orphelines : jamais une seule ligne seule en haut ou en bas de page (comme le calcul de l'aperçu)
  const st = zip.file('word/styles.xml')
  if (st) zip.file('word/styles.xml', (await st.async('string')).replace('<w:pPrDefault/>', '<w:pPrDefault><w:pPr><w:widowControl/></w:pPr></w:pPrDefault>'))
  const P = plan(blocks, s)
  const items = P.headings.map((h, i) => ({ ...h, i })).filter(h => h.level <= 4)
  const file = zip.file('word/document.xml')
  if (!file || !items.length) return
  let doc = await file.async('string')
  const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-4" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
  // la bibliothèque range la rupture de section (saut de page vers le texte) DANS le dernier paragraphe des pages préliminaires :
  // si ce paragraphe est le repère du sommaire, on la remet sur la dernière ligne du sommaire (sinon sommaire et texte se retrouvent sur la même page)
  const sect = (new RegExp(`<w:p>(?:(?!</w:p>)[\\s\\S])*?${TOC_MARK}[\\s\\S]*?</w:p>`).exec(doc)?.[0] ?? '').match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] ?? ''
  const paras = items.map((h, n) => {
    const id = tocId(h.i)
    return `<w:p><w:pPr><w:pStyle w:val="TOC${h.level}"/>${n === items.length - 1 ? sect : ''}</w:pPr>${n === 0 ? begin : ''}` +
      `<w:hyperlink w:anchor="${id}" w:history="1"><w:r><w:t xml:space="preserve">${xml(h.text)}</w:t></w:r><w:r><w:tab/></w:r>` +
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF ${id} \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
      `<w:r><w:t>${xml(nums?.headings[h.i] ?? '')}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>${n === items.length - 1 ? end : ''}</w:p>`
  }).join('')
  const re = new RegExp(`<w:p>(?:(?!</w:p>)[\\s\\S])*?${TOC_MARK}[\\s\\S]*?</w:p>`)
  if (!re.test(doc)) return
  doc = doc.replace(re, () => paras)
  zip.file('word/document.xml', doc)
}

export async function toBlob(blocks: Block[], s: Settings, nums?: PageNumbers): Promise<Blob> {
  const zip = await JSZip.loadAsync(await Packer.toArrayBuffer(buildDocument(blocks, s, nums)))
  await injectToc(zip, blocks, s, nums)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
}

/** Même chose en octets (tests, scripts). */
export async function toBytes(blocks: Block[], s: Settings, nums?: PageNumbers): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(await Packer.toArrayBuffer(buildDocument(blocks, s, nums)))
  await injectToc(zip, blocks, s, nums)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
