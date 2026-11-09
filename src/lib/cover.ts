import type { Cover } from './types'
import { stripToc, kindOf } from './parse'

/**
 * Lit le début du texte collé : si une page de garde y est déjà écrite (thème, auteur, encadreur,
 * année, école…), les infos sont reprises automatiquement et ces lignes sortent du corps du document.
 */
export interface Detected { cover: Partial<Pick<Cover, 'school' | 'kind' | 'title' | 'author' | 'supervisor' | 'year' | 'group' | 'extras'>>; body: string }

const L = (re: string) => new RegExp(`^(?:${re})\\s*[:：]\\s*(.+)$`, 'i')
const TITLE = L('th[èe]me|sujet|titre|intitul[ée]|objet')
const AUTHOR = L('pr[ée]sent[ée]e?\\s+par|r[ée]alis[ée]e?\\s+par|r[ée]dig[ée]e?\\s+par|[ée]labor[ée]e?\\s+par|soutenu(?:e)?\\s+par|pr[ée]par[ée]e?\\s+par|auteurs?|[ée]tudiants?|[ée]l[èe]ve|stagiaire|[ée]tudiante?|candidate?|nom(?:\\s+et\\s+pr[ée]noms?)?|par')
/** Sans deux-points : « Réalisé par Awa Koné », « Sous la direction de Dr Yao ». */
const AUTHOR_NC = /^(?:pr[ée]sent[ée]|r[ée]alis[ée]|r[ée]dig[ée]|[ée]labor[ée]|pr[ée]par[ée]|soutenu)e?\s+par\s+(.+)$/i
const SUPERVISOR_NC = /^(?:sous\s+la\s+direction\s+(?:de\s+la|de|du)|encadr[ée]e?\s+par)\s+(.+)$/i
const SUPERVISOR = L('encadr(?:eur|eure|ant|ante)(?:\\s+(?:acad[ée]mique|p[ée]dagogique|professionnel(?:le)?))?|encadr[ée]e?\\s+par|directeur\\s+de\\s+(?:m[ée]moire|th[èe]se)|directrice\\s+de\\s+(?:m[ée]moire|th[èe]se)|sous\\s+la\\s+direction\\s+(?:de|du|de\\s+la)|superviseure?|tuteur|tutrice|professeur|enseignant|enseignante|formateur|formatrice|responsable|ma[iî]tre\\s+de\\s+stage|encadreur\\s+professionnel|charg[ée]e?\\s+de\\s+cours')
const GROUP = L('groupe(?:\\s*/\\s*fili[èe]re)?|fili[èe]re|niveau|classe|parcours|sp[ée]cialit[ée]|option')
const SCHOOL_LBL = L('[ée]tablissement|universit[ée]|institut|[ée]cole|facult[ée]|entreprise|soci[ée]t[ée]|organisme|structure|d[ée]partement')
const YEAR = /(?:ann[ée]e\s+(?:acad[ée]mique|universitaire|scolaire)|ann[ée]e|session)?\s*[:：]?\s*((?:19|20)\d{2}\s*[-–/]\s*(?:19|20)?\d{2})\s*$/i
const SCHOOL = /^(universit[ée]|minist[èe]re|r[ée]publique|groupe scolaire|centre de formation|institut|[ée]cole|ecole|facult[ée]|haute\s+[ée]cole|centre|lyc[ée]e|iua\b)/i
const KIND = /^(m[ée]moire|rapport|th[èe]se|projet|dossier|travail|expos[ée]|atelier|livrable|devoir|tp|td|cas pratique|[ée]tude de cas|compte[- ]rendu|note de synth[èe]se|portfolio|journal de stage)\b/i
const END = /^(exercices?(?:\s*\d+)?|questions?|introduction|remerciements?|d[ée]dicace|r[ée]sum[ée]|abstract|avant-propos|sommaire|table des mati[èe]res|liste des .+|chapitre\s+[\dIVXLC]+|partie\s+[\dIVXLC]+)\b/i
/** « A. … », « 1. … », « II. … » : début d'un vrai titre du corps, jamais une ligne de page de garde. */
/** Un vrai titre du corps (« 1. », « 1.1 », « A. », « II. », « Chapitre 1 »…) : la page de garde s'arrête avant. Les lignes en MAJUSCULES, courantes sur une page de garde, ne comptent pas. */
const isBodyHead = (t: string) => { const k = kindOf(t); return k !== null && k !== 'caps' && k !== 'plain' && k !== 'special' }
const EXTRA = /^([A-ZÀ-Ý][^:：]{1,32}?)\s*[:：]\s*(\S.{0,100})$/
const unq = (t: string) => t.trim().replace(/^[«"“'‘]+|[»"”'’]+$/g, '').trim()

export function extractCover(src: string): Detected {
  const lines = stripToc(src.replace(/\r/g, '').split('\n'))
  const cover: Detected['cover'] = {}
  let end = -1
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const t = lines[i].trim()
    if (/^#{1,4}\s/.test(t) || (END.test(t) && t.length < 80) || isBodyHead(t) || t.length > 180) { end = i; break }
  }
  if (end < 0) end = Math.min(lines.length, 40) // pas de titre ensuite : tout le début est candidat (rien n'est retiré sans 2 informations reconnues)

  const drop: number[] = []
  let hits = 0
  let loose = ''
  let looseAt = -1
  let free = -1
  const extras: number[] = []
  for (let i = 0; i < end; i++) {
    const t = lines[i].trim()
    if (!t) continue
    let m: RegExpMatchArray | null
    if ((m = t.match(TITLE))) { cover.title = unq(m[1]); hits++ }
    else if ((m = t.match(SUPERVISOR_NC))) { cover.supervisor = unq(m[1]); hits++ }
    else if ((m = t.match(AUTHOR_NC))) { cover.author = unq(m[1]); hits++ }
    else if ((m = t.match(SUPERVISOR))) { cover.supervisor = unq(m[1]); hits++ }
    else if ((m = t.match(AUTHOR))) { cover.author = unq(m[1]); hits++ }
    else if ((m = t.match(GROUP))) { cover.group = unq(m[1]); hits++ }
    else if ((m = t.match(SCHOOL_LBL))) { cover.school = unq(m[1]); hits++ }
    else if ((m = t.match(YEAR)) && t.length < 60) { cover.year = m[1].replace(/\s+/g, '').replace('/', '-'); hits++ }
    else if (SCHOOL.test(t) && !cover.school && t.length < 120) { cover.school = t; hits++ }
    else if (KIND.test(t) && t.length < 70 && !/[.;]$/.test(t)) { cover.kind = t.toUpperCase(); hits++ }
    else if (/^page\s+de\s+garde$/i.test(t)) { /* simple étiquette */ }
    else {
      // ligne non reconnue : elle reste dans le texte (rien ne disparaît), sauf si elle devient le titre
      if (!loose && t.length >= 12 && /^[«"“]/.test(t)) { loose = unq(t); looseAt = i }
      else if (!loose && t.length >= 20 && t === t.toUpperCase() && !cover.title) { loose = t; looseAt = i }
      else if (EXTRA.test(t) && !/[.;]$/.test(t)) extras.push(i) // « Module : Logistique », « Date : … » : gardé sur la page de garde
      else if (free < 0 && t.length >= 4 && t.length <= 150 && !/[.;:]$/.test(t)) free = i
      continue
    }
    drop.push(i)
  }
  if (hits < 2) return { cover: {}, body: lines.join('\n') }
  if (!cover.title && loose) { cover.title = loose; drop.push(looseAt) }
  else if (!cover.title && free >= 0) { cover.title = unq(lines[free]); drop.push(free) } // à défaut : 1re ligne libre = thème
  if (extras.length) { cover.extras = extras.map(i => lines[i].trim().replace(/\s*[:：]\s*/, ' : ')); drop.push(...extras) }
  const body = lines.filter((_, i) => !drop.includes(i)).join('\n').replace(/^\s+/, '')
  return { cover, body }
}
