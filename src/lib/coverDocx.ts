import {
  AlignmentType, BorderStyle, HeightRule, HorizontalPositionRelativeFrom, ImageRun, LineRuleType, Paragraph, ShadingType, Table, TableCell,
  TableLayoutType, TableRow, TextRun, TextWrappingType, VerticalAlign, VerticalPositionRelativeFrom, WidthType,
} from 'docx'
import type { Cover } from './types'
import { coverTable, type Deco, type Edge, type Node, type CoverTable } from './coverTemplates'

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

/* ---- PNG d'une seule couleur (1 pixel, sans compression) : étiré à la taille voulue, il sert de rectangle plein collé au bord de la page ---- */
const CRC = (() => { const t: number[] = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0) } return t })()
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
function chunk(type: string, data: number[]): number[] {
  const body = new Uint8Array([...type].map(ch => ch.charCodeAt(0)).concat(data))
  return [...be32(data.length), ...body, ...be32(crc32(body))]
}
export function solidPng(hex: string): Uint8Array {
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
  const raw = [0, r, g, b] // filtre 0 + un pixel RVB
  let s1 = 1, s2 = 0
  for (const x of raw) { s1 = (s1 + x) % 65521; s2 = (s2 + s1) % 65521 }
  const z = [0x78, 0x01, 0x01, raw.length, 0, 255 - raw.length, 255, ...raw, ...be32(((s2 << 16) | s1) >>> 0)]
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [...be32(1), ...be32(1), 8, 2, 0, 0, 0]), ...chunk('IDAT', z), ...chunk('IEND', [])])
}

/** Un rectangle plein posé sur la feuille (position absolue, derrière le texte), accroché à un paragraphe de 1 pt. */
function decoPara(d: Deco): Paragraph {
  const emu = (pt: number) => Math.round(pt * 12700)
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: [new ImageRun({
      type: 'png', data: solidPng(d.fill),
      transformation: { width: Math.round(d.w * 96 / 72), height: Math.round(d.h * 96 / 72) },
      altText: { title: 'Fond', description: 'Fond de page de garde', name: 'fond' },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(d.x) },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(d.y) },
        behindDocument: true, allowOverlap: true, lockAnchor: true, layoutInCell: false,
        wrap: { type: TextWrappingType.NONE },
      },
    })],
  })
}

/** La page de garde en objets Word : un seul tableau sans bordures dont chaque rangée a une hauteur exacte (précédé, si le modèle le demande, des rectangles collés au bord de la page). */
export function coverDocx(c: Cover, W: number, H: number): (Paragraph | Table)[] {
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
  const table = new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: grid, layout: TableLayoutType.FIXED, rows,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
  })
  return [...(t.deco ?? []).map(decoPara), table]
}
