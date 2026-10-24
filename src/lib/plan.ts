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

/**
 * Largeurs de colonnes en twips (leur somme vaut exactement W).
 * Une colonne n'est jamais plus étroite que son mot le plus long (sinon les mots sont coupés au milieu) ;
 * l'espace restant est réparti selon la longueur du contenu.
 */
export function columnWidths(rows: string[][], size: number, W: number): number[] {
  const char = size * 20 * 0.55 // largeur moyenne d'un caractère (gras compris), en twips
  const pad = 180 + 40 // marges gauche/droite de la cellule + bordures
  const n = rows[0].length
  const min: number[] = [], want: number[] = []
  for (let c = 0; c < n; c++) {
    let word = 1, line = 1
    for (const r of rows) {
      const t = (r[c] ?? '').replace(/\*+/g, '')
      line = Math.max(line, t.length)
      for (const w of t.split(/\s+/)) word = Math.max(word, w.length)
    }
    min.push(Math.min(word, 30) * char + pad)
    want.push(Math.max(Math.min(line, 40) * char + pad, min[c]))
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  let w: number[]
  if (sum(want) <= W) w = want.map(x => (x * W) / sum(want))
  else if (sum(min) <= W) {
    const extra = W - sum(min), room = sum(want) - sum(min)
    w = min.map((m, c) => m + ((want[c] - m) * extra) / room)
  } else w = min.map(x => (x * W) / sum(min))
  const out = w.map(Math.floor)
  out[n - 1] += W - sum(out)
  return out
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
    const W = widthOf(s, landscape)
    const colW = columnWidths(b.rows, size, W)
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
