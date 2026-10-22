import type { Block, Settings } from './types'

/** Mise en page commune au Word et à l'aperçu : un seul endroit décide ce qui va où. */
export const A4 = { w: 11906, h: 16838 } // twips

export type Item =
  | { k: 'h'; level: 1 | 2 | 3 | 4; text: string; idx: number; pageBreakBefore: boolean }
  | { k: 'p'; text: string }
  | { k: 'li'; text: string }
  | { k: 'cap'; no: number; caption: string }
  | { k: 'table'; no: number; rows: string[][]; colW: number[]; size: number; W: number }
  | { k: 'gap' }

export interface Segment { landscape: boolean; items: Item[] }
export interface Plan {
  segs: Segment[]
  headings: { level: number; text: string }[]
  captions: string[]
  margins: { top: number; bottom: number; left: number; right: number }
}

export const marginsOf = (s: Settings) => ({ top: 1417, bottom: 1417, left: s.reliure ? 1701 : 1417, right: 1417 })
export const widthOf = (s: Settings, landscape: boolean) => {
  const m = marginsOf(s)
  return (landscape ? A4.h : A4.w) - m.left - m.right
}

export function plan(blocks: Block[], s: Settings): Plan {
  const segs: Segment[] = [{ landscape: false, items: [] }]
  const cur = () => segs[segs.length - 1]
  const headings: Plan['headings'] = []
  const captions: string[] = []
  let tableNo = 0

  const tableItems = (b: Extract<Block, { t: 'table' }>, landscape: boolean): Item[] => {
    const cols = b.rows[0].length
    const size = cols >= 7 ? 9 : cols >= 5 ? Math.max(9, s.size - 2) : Math.max(9, s.size - 1)
    const weights = b.rows[0].map((_, c) => Math.min(40, Math.max(5, ...b.rows.map(r => r[c].length))))
    const total = weights.reduce((a, x) => a + x, 0)
    const W = widthOf(s, landscape)
    const colW = weights.map(w => Math.floor((w / total) * W))
    const out: Item[] = []
    tableNo++
    if (b.caption !== undefined) { captions.push(b.caption); out.push({ k: 'cap', no: captions.length, caption: b.caption }) }
    out.push({ k: 'table', no: tableNo, rows: b.rows, colW, size, W })
    out.push({ k: 'gap' })
    return out
  }

  for (const b of blocks) {
    if (b.t === 'table') {
      const wide = s.landscape && b.rows[0].length >= 6
      if (wide) {
        if (!cur().items.length) segs.pop()
        segs.push({ landscape: true, items: tableItems(b, true) })
        segs.push({ landscape: false, items: [] })
      } else cur().items.push(...tableItems(b, false))
    } else if (b.t === 'h') {
      const first = cur().items.length === 0
      cur().items.push({ k: 'h', level: b.level, text: b.text, idx: headings.length, pageBreakBefore: b.level === 1 && s.chapterBreak && !first })
      headings.push({ level: b.level, text: b.text })
    } else if (b.t === 'li') cur().items.push({ k: 'li', text: b.text })
    else cur().items.push({ k: 'p', text: b.text })
  }
  if (!cur().items.length) segs.pop()
  return { segs, headings, captions, margins: marginsOf(s) }
}
