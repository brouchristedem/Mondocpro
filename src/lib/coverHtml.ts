import type { Cover } from './types'
import { coverTable, type Edge, type Node, type CoverTable } from './coverTemplates'
import { fontInfo } from './fonts'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const bd = (side: string, e?: Edge) => e ? `border-${side}:${e.w}pt solid #${e.c};` : ''
const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
const AL = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

function node(n: Node): string {
  switch (n.t) {
    case 'text':
      return `<div style="font-family:${fontInfo(n.font).css};font-size:${n.size}pt;line-height:${n.size * n.lh}pt;` +
        `font-weight:${n.bold ? 700 : 400};font-style:${n.italic ? 'italic' : 'normal'};color:#${n.color};` +
        `${n.track ? `letter-spacing:${n.track}pt;` : ''}text-align:${n.align};margin:0;padding:${n.before}pt 0 ${n.after}pt;` +
        `font-kerning:none;font-variant-ligatures:none;overflow-wrap:break-word;flex:none;">${esc(n.text)}</div>`
    case 'rule':
      return `<div style="flex:none;height:1pt;border-bottom:${n.w}pt solid #${n.c};margin:${n.before}pt ${n.indR}pt ${n.after}pt ${n.indL}pt;"></div>`
    case 'space':
      return `<div style="flex:none;height:${Math.max(1, n.h)}pt;"></div>`
    case 'img':
      return `<div style="flex:none;display:flex;justify-content:${AL[n.align]};padding:${n.before}pt 0 ${n.after}pt;">` +
        `<img alt="" src="${esc(n.url)}" style="display:block;height:${n.h}pt;width:${n.w}pt;"></div>`
  }
}

/** La page de garde en HTML (aperçu, PDF, vignettes) : mêmes tailles, mêmes positions que le Word. */
export function coverHtml(c: Cover, W: number, H: number): string {
  const t: CoverTable = coverTable(c, W, H)
  const rows = t.rows.map(r => {
    let col = 0
    const cells = r.cells.map(cl => {
      const width = t.grid.slice(col, col + cl.span).reduce((a, x) => a + x, 0)
      col += cl.span
      return `<div style="box-sizing:border-box;flex:none;width:${width}pt;height:${r.h}pt;overflow:hidden;display:flex;flex-direction:column;justify-content:${JUSTIFY[cl.valign]};` +
        `padding:${cl.pad[0]}pt ${cl.pad[1]}pt ${cl.pad[2]}pt ${cl.pad[3]}pt;${cl.fill ? `background:#${cl.fill};` : ''}` +
        `${bd('top', cl.edge.t)}${bd('right', cl.edge.r)}${bd('bottom', cl.edge.b)}${bd('left', cl.edge.l)}">${cl.nodes.map(node).join('')}</div>`
    }).join('')
    return `<div style="display:flex;height:${r.h}pt;width:${W}pt;">${cells}</div>`
  }).join('')
  return `<div style="width:${W}pt;">${rows}</div>`
}
