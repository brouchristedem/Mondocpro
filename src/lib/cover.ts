import type { Cover } from './types'
import { stripToc } from './parse'

/**
 * Lit le début du texte collé : si une page de garde y est déjà écrite (thème, auteur, encadreur,
 * année, école…), les infos sont reprises automatiquement et ces lignes sortent du corps du document.
 */
export interface Detected { cover: Partial<Pick<Cover, 'school' | 'kind' | 'title' | 'author' | 'supervisor' | 'year'>>; body: string }

const L = (re: string) => new RegExp(`^(?:${re})\\s*[:：]\\s*(.+)$`, 'i')
const TITLE = L('th[èe]me|sujet|titre|intitul[ée]')
const AUTHOR = L('pr[ée]sent[ée]e?\\s+par|r[ée]alis[ée]e?\\s+par|r[ée]dig[ée]e?\\s+par|auteure?|[ée]tudiante?|candidate?|nom(?:\\s+et\\s+pr[ée]noms?)?|par')
const SUPERVISOR = L('encadr(?:eur|eure|ant|ante)(?:\\s+(?:acad[ée]mique|p[ée]dagogique|professionnel(?:le)?))?|encadr[ée]e?\\s+par|directeur\\s+de\\s+(?:m[ée]moire|th[èe]se)|directrice\\s+de\\s+(?:m[ée]moire|th[èe]se)|sous\\s+la\\s+direction\\s+(?:de|du|de\\s+la)|superviseure?|tuteur|tutrice|professeur|enseignant')
const SCHOOL_LBL = L('[ée]tablissement|universit[ée]|institut|[ée]cole|facult[ée]')
const YEAR = /(?:ann[ée]e\s+(?:acad[ée]mique|universitaire|scolaire)|ann[ée]e|session)?\s*[:：]?\s*((?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2})\s*$/i
const SCHOOL = /^(universit[ée]|institut|[ée]cole|ecole|facult[ée]|haute\s+[ée]cole|centre|lyc[ée]e|iua\b)/i
const KIND = /^(m[ée]moire|rapport|th[èe]se|projet|dossier|travail|expos[ée]|atelier|livrable)\b/i
const END = /^(introduction|remerciements?|d[ée]dicace|r[ée]sum[ée]|abstract|avant-propos|sommaire|table des mati[èe]res|liste des .+|chapitre\s+[\dIVXLC]+|partie\s+[\dIVXLC]+)\b/i
const unq = (t: string) => t.trim().replace(/^[«"“'‘]+|[»"”'’]+$/g, '').trim()

export function extractCover(src: string): Detected {
  const lines = stripToc(src.replace(/\r/g, '').split('\n'))
  const cover: Detected['cover'] = {}
  let end = -1
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const t = lines[i].trim()
    if (/^#{1,4}\s/.test(t) || (END.test(t) && t.length < 80) || t.length > 180) { end = i; break }
  }
  if (end < 0) return { cover, body: lines.join('\n') }

  const drop: number[] = []
  let hits = 0
  let loose = ''
  for (let i = 0; i < end; i++) {
    const t = lines[i].trim()
    if (!t) continue
    let m: RegExpMatchArray | null
    if ((m = t.match(TITLE))) { cover.title = unq(m[1]); hits++ }
    else if ((m = t.match(SUPERVISOR))) { cover.supervisor = unq(m[1]); hits++ }
    else if ((m = t.match(AUTHOR))) { cover.author = unq(m[1]); hits++ }
    else if ((m = t.match(SCHOOL_LBL))) { cover.school = unq(m[1]); hits++ }
    else if ((m = t.match(YEAR)) && t.length < 60) { cover.year = m[1].replace(/\s+/g, '').replace('/', '-'); hits++ }
    else if (SCHOOL.test(t) && !cover.school && t.length < 120) { cover.school = t; hits++ }
    else if (KIND.test(t) && t.length < 70 && !/[.;]$/.test(t)) { cover.kind = t.toUpperCase(); hits++ }
    else if (/^page\s+de\s+garde$/i.test(t)) { /* simple étiquette */ }
    else if (!loose && t.length >= 12 && /^[«"“]/.test(t)) loose = unq(t)
    else if (!loose && t.length >= 20 && t === t.toUpperCase() && !cover.title) loose = t
    drop.push(i)
  }
  if (hits < 2) return { cover: {}, body: lines.join('\n') }
  if (!cover.title && loose) cover.title = loose
  const body = lines.filter((_, i) => !drop.includes(i)).join('\n').replace(/^\s+/, '')
  return { cover, body }
}
