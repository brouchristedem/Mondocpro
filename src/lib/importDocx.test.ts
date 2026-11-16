import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { importDocx, ImportError } from './importDocx'
import { parse } from './parse'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const P = (t: string, pPr = '') => `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
async function make(body: string, extra: Record<string, string> = {}) {
  const z = new JSZip()
  z.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  z.file('word/document.xml', `<w:document ${W}><w:body>${body}</w:body></w:document>`)
  for (const [k, v] of Object.entries(extra)) z.file(k, v)
  return z.generateAsync({ type: 'uint8array' })
}
async function main() {
  // titres par style (nom ou identifiant), gras, italique, tableau, puces : tout est repris
  const styles = `<w:styles ${W}><w:style w:styleId="Titre1"><w:name w:val="heading 1"/></w:style></w:styles>`
  const numbering = `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="-"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`
  const r = await importDocx(await make(
    P('Introduction', '<w:pStyle w:val="Titre1"/>') + P('Un texte &amp; des « accents » éàç.') +
    P('Item', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>') +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p><w:p><w:r><w:t>suite</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    { 'word/styles.xml': styles, 'word/numbering.xml': numbering }))
  const b = parse(r.text)
  assert.deepEqual(b.map(x => x.t), ['h', 'p', 'li', 'table'])
  assert.equal((b[1] as { text: string }).text, 'Un texte & des « accents » éàç.')
  assert.deepEqual((b[3] as { rows: string[][] }).rows.map(x => x.length), [2, 2])
  assert.ok(r.text.includes('suite'))
  // texte supprimé (modification suivie) : ignoré ; texte masqué : ignoré ; aucune phrase visible perdue
  const t = await importDocx(await make(`<w:p><w:r><w:t>Gardé</w:t></w:r><w:del><w:r><w:delText>Supprimé</w:delText></w:r></w:del><w:ins><w:r><w:t> inséré</w:t></w:r></w:ins></w:p>`))
  assert.equal(t.text, 'Gardé inséré')
  // sommaire Word (champ TOC) et son titre : retirés
  const toc = await importDocx(await make(P('Table des matières') + '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Intro 3</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' + P('Vrai texte.')))
  assert.equal(toc.text, 'Vrai texte.')
  // erreurs claires
  await assert.rejects(() => importDocx(new Uint8Array([1, 2, 3, 4])), ImportError)
  await assert.rejects(() => importDocx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])), /\.doc/)
  await assert.rejects(async () => importDocx(await make('')), ImportError)
  console.log('import Word : OK')
}
main()
