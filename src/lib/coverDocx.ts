import {
  AlignmentType, BorderStyle, HeightRule, ImageRun, LineRuleType, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx'
import type { Cover } from './types'
import { coverTable, type Edge, type Node, type CoverTable } from './coverTemplates'

const tw = (pt: number) => Math.round(pt * 20)
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const edge = (e?: Edge) => e ? { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(e.w * 8)), color: e.c } : none
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const
const VALIGN = { top: VerticalAlign.TOP, middle: VerticalAlign.CENTER, bottom: VerticalAlign.BOTTOM } as const

function dataToBytes(url: string): { data: Uint8Array; type: 'png' | 'jpg' } {
  const m = url.match(/^data:image\/(png|jpe?g);base64,(.*)$/)
  if (!m) throw new Error('Logo non supporté (PNG ou JPG)')
  const bin = atob(m[2])
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
  return { data, type: m[1] === 'png' ? 'png' : 'jpg' }
}

function para(n: Node): Paragraph {
  switch (n.t) {
    case 'text':
      return new Paragraph({
        alignment: ALIGN[n.align],
        spacing: { before: tw(n.before), after: tw(n.after), line: tw(n.size * n.lh), lineRule: LineRuleType.EXACT },
        children: [new TextRun({
          text: n.text, font: n.font, size: Math.round(n.size * 2), bold: n.bold, italics: n.italic, color: n.color,
          characterSpacing: n.track ? tw(n.track) : undefined,
        })],
      })
    case 'rule':
      return new Paragraph({
        spacing: { before: tw(n.before), after: tw(n.after), line: 20, lineRule: LineRuleType.EXACT },
        indent: { left: tw(n.indL), right: tw(n.indR) },
        border: { bottom: { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(n.w * 8)), color: n.c, space: 0 } },
        children: [new TextRun({ text: '', size: 2 })],
      })
    case 'space':
      return new Paragraph({ spacing: { before: 0, after: 0, line: Math.max(20, tw(n.h)), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] })
    case 'img': {
      const { data, type } = dataToBytes(n.url)
      return new Paragraph({
        alignment: ALIGN[n.align],
        spacing: { before: tw(n.before), after: tw(n.after) },
        children: [new ImageRun({ type, data, transformation: { width: Math.round(n.w * 96 / 72), height: Math.round(n.h * 96 / 72) }, altText: { title: 'Logo', description: 'Logo', name: 'logo' } })],
      })
    }
  }
}

/** La page de garde en objet Word : un seul tableau sans bordures dont chaque rangée a une hauteur exacte. */
export function coverDocx(c: Cover, W: number, H: number): Table {
  const t: CoverTable = coverTable(c, W, H)
  const grid = t.grid.map(tw)
  const total = grid.reduce((a, x) => a + x, 0)
  const rows = t.rows.map(r => {
    let col = 0
    return new TableRow({
      cantSplit: true,
      height: { value: tw(r.h), rule: HeightRule.EXACT },
      children: r.cells.map(cl => {
        const width = grid.slice(col, col + cl.span).reduce((a, x) => a + x, 0)
        col += cl.span
        return new TableCell({
          width: { size: width, type: WidthType.DXA },
          columnSpan: cl.span > 1 ? cl.span : undefined,
          verticalAlign: VALIGN[cl.valign],
          shading: cl.fill ? { type: ShadingType.CLEAR, fill: cl.fill, color: 'auto' } : undefined,
          margins: { top: tw(cl.pad[0]), right: tw(cl.pad[1]), bottom: tw(cl.pad[2]), left: tw(cl.pad[3]) },
          borders: { top: edge(cl.edge.t), right: edge(cl.edge.r), bottom: edge(cl.edge.b), left: edge(cl.edge.l) },
          children: cl.nodes.length ? cl.nodes.map(para) : [new Paragraph({ spacing: { line: 20, lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] })],
        })
      }),
    })
  })
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: grid, layout: TableLayoutType.FIXED, rows,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
  })
}
