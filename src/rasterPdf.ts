import type { Page } from './lib/layout'

/**
 * PDF direct (sans passer par l'impression du navigateur) : utilisé sur iPhone/iPad, où Safari ajoute
 * lui-même l'adresse du site, la date et « Page x sur y » et rogne la page. Chaque page de l'aperçu
 * est dessinée telle quelle (même mise en page que le Word) puis assemblée dans un vrai fichier PDF A4.
 */
const PT_PX = 96 / 72
const SCALE = 2 // 2 px par px CSS ≈ 190 dpi : net à l'impression, fichier léger

/** iPhone, iPad (y compris iPadOS qui se présente comme un Mac tactile). */
export const needsDirectPdf = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Chaque mot devient son propre élément : le texte justifié garde ses vraies positions une fois dessiné. */
function splitWords(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  for (const t of nodes) {
    const text = t.nodeValue ?? ''
    if (!/\S/.test(text) || !t.parentElement) continue
    const frag = document.createDocumentFragment()
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue }
      const s = document.createElement('span')
      s.textContent = part
      frag.appendChild(s)
    }
    t.parentNode!.replaceChild(frag, t)
  }
}

const u8 = (s: string) => new TextEncoder().encode(s)

/** PDF minimal : une image JPEG plein cadre par page (A4 portrait ou paysage). */
function buildPdf(jpegs: { data: Uint8Array; w: number; h: number; landscape: boolean }[]): Blob {
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (b: Uint8Array) => { parts.push(b); len += b.length }
  const obj = (n: number, ...body: (string | Uint8Array)[]) => {
    offsets[n] = len
    push(u8(`${n} 0 obj\n`))
    for (const b of body) push(typeof b === 'string' ? u8(b) : b)
    push(u8('\nendobj\n'))
  }
  push(u8('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'))
  const n = jpegs.length
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)
  jpegs.forEach((j, i) => {
    const page = 3 + i * 3, content = page + 1, img = page + 2
    const W = j.landscape ? 841.89 : 595.28, H = j.landscape ? 595.28 : 841.89
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>`)
    const draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`
    obj(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`)
    obj(img, `<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.data.length} >>\nstream\n`, j.data, '\nendstream')
  })
  const total = 3 + n * 3
  const xref = len
  push(u8(`xref\n0 ${total}\n0000000000 65535 f \n` + offsets.slice(1, total).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')))
  push(u8(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`))
  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}

export async function makeRasterPdf(pages: Page[]): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas')
  try { await document.fonts?.ready } catch { /* */ }
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;'
  document.body.appendChild(host)
  const out: { data: Uint8Array; w: number; h: number; landscape: boolean }[] = []
  try {
    for (const p of pages) {
      host.innerHTML = p.html
      const sheet = host.firstElementChild as HTMLElement
      splitWords(sheet)
      const w = Math.round((p.landscape ? 841.89 : 595.28) * PT_PX), h = Math.round((p.landscape ? 595.28 : 841.89) * PT_PX)
      const canvas = await html2canvas(sheet, { scale: SCALE, width: w, height: h, backgroundColor: '#ffffff', logging: false, useCORS: true })
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Image de page impossible'))), 'image/jpeg', 0.92))
      out.push({ data: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height, landscape: p.landscape })
      canvas.width = canvas.height = 0 // libère la mémoire (iPhone)
    }
  } finally { host.remove() }
  return buildPdf(out)
}
