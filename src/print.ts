import type { Page } from './lib/layout'

/**
 * PDF sans serveur : les pages de l'aperçu (celles du Word) sont envoyées à l'impression du navigateur,
 * qui propose « Enregistrer au format PDF ». Fonctionne sur ordinateur, Android et iPhone.
 */
const STYLE = `
@page{size:A4;margin:0}
@page land{size:A4 landscape;margin:0}
#print-root{display:none}
@media print{
  html.printing,html.printing body{background:#fff!important;margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
  html.printing body>*:not(#print-root){display:none!important}
  html.printing #print-root{display:block!important}
  #print-root .pgw{break-after:page;page-break-after:always;break-inside:avoid;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #print-root .pgw:last-child{break-after:auto;page-break-after:auto}
  #print-root .pgw.land{page:land}
  #print-root .sheet{box-shadow:none!important;margin:0!important}
}`

export function cleanupPrint() {
  document.getElementById('print-root')?.remove()
  document.getElementById('print-style')?.remove()
  document.documentElement.classList.remove('printing')
}

export async function printPdf(pages: Page[], title: string): Promise<void> {
  cleanupPrint()
  const style = document.createElement('style')
  style.id = 'print-style'; style.textContent = STYLE
  const root = document.createElement('div')
  root.id = 'print-root'
  root.innerHTML = pages.map(p => `<div class="pgw${p.landscape ? ' land' : ''}">${p.html}</div>`).join('')
  document.head.appendChild(style); document.body.appendChild(root)
  document.documentElement.classList.add('printing')
  const prev = document.title
  document.title = title
  try { await document.fonts?.ready } catch { /* */ }
  await new Promise(r => setTimeout(r, 80))
  const done = () => { document.title = prev; cleanupPrint(); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
  setTimeout(() => { if (document.getElementById('print-root')) { document.title = prev } }, 1000)
}
