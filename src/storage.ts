import { DEFAULTS, DEFAULT_PRESET, LEGACY_PRESETS, PRESETS, type PresetKey, type Settings } from './lib/types'

/** Documents enregistrés sur cet appareil ; si l'utilisateur est connecté, ils sont aussi gardés dans son compte (voir sync.ts). */
export interface Doc { id: string; name: string; text: string; s: Settings; preset: PresetKey; updatedAt: number }

const LIST = 'mondocpro:docs:v2'
const CURRENT = 'mondocpro:current:v2'
const OLD = 'mondocpro:v1'
const TOMBS = 'mondocpro:deleted:v2'

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))

export const mergeSettings = (s?: Partial<Settings>): Settings => ({ ...DEFAULTS, ...s, cover: { ...DEFAULTS.cover, ...(s?.cover ?? {}) } })
const presetOf = (k: unknown): PresetKey => (typeof k === 'string' && k in PRESETS ? (k as PresetKey) : LEGACY_PRESETS[k as string] ?? DEFAULT_PRESET)

function read(): Doc[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(d => d && typeof d.id === 'string' && typeof d.text === 'string')
      .map(d => ({ id: d.id, name: String(d.name || 'Sans titre'), text: d.text, s: mergeSettings(d.s), preset: presetOf(d.preset), updatedAt: Number(d.updatedAt) || 0 }))
  } catch { return [] }
}

/** Reprend le brouillon des versions précédentes du site (sauf l'ancien texte d'exemple). */
function migrate() {
  try {
    if (localStorage.getItem(LIST) !== null) return
    const old = JSON.parse(localStorage.getItem(OLD) || 'null')
    if (old && typeof old.text === 'string' && old.text.trim() && !old.text.startsWith('INTRODUCTION\n\nLa logistique regroupe')) {
      const id = newId()
      const s = mergeSettings({ ...old.s, cover: { ...(old.s?.cover ?? {}), enabled: false } })
      localStorage.setItem(LIST, JSON.stringify([{ id, name: 'Brouillon', text: old.text, s, preset: presetOf(old.preset), updatedAt: Date.now() }]))
      localStorage.setItem(CURRENT, id)
    } else localStorage.setItem(LIST, '[]')
  } catch { /* stockage indisponible */ }
}

export const listDocs = (): Doc[] => { migrate(); return read().sort((a, b) => b.updatedAt - a.updatedAt) }
export const getDoc = (id: string) => read().find(d => d.id === id)
export const currentId = (): string | null => { try { return localStorage.getItem(CURRENT) } catch { return null } }
export const setCurrent = (id: string) => { try { localStorage.setItem(CURRENT, id) } catch { /* */ } }

/** false si le navigateur refuse (espace plein, navigation privée). */
export function saveDoc(d: Doc): boolean {
  try {
    const all = read().filter(x => x.id !== d.id)
    all.push(d)
    localStorage.setItem(LIST, JSON.stringify(all))
    return true
  } catch {
    try { // dernier recours : on retire le logo (souvent lourd)
      const all = read().filter(x => x.id !== d.id)
      all.push({ ...d, s: { ...d.s, cover: { ...d.s.cover, logo: undefined } } })
      localStorage.setItem(LIST, JSON.stringify(all)); return true
    } catch { return false }
  }
}
/** Documents supprimés sur cet appareil (id → date) : sert à les supprimer aussi dans le compte. */
export function tombs(): Record<string, number> {
  try { const t = JSON.parse(localStorage.getItem(TOMBS) || '{}'); return t && typeof t === 'object' ? t : {} } catch { return {} }
}
export function clearTombs(ids: string[]) {
  try { const t = tombs(); for (const id of ids) delete t[id]; localStorage.setItem(TOMBS, JSON.stringify(t)) } catch { /* */ }
}
export function removeDoc(id: string) {
  try {
    localStorage.setItem(LIST, JSON.stringify(read().filter(d => d.id !== id)))
    localStorage.setItem(TOMBS, JSON.stringify({ ...tombs(), [id]: Date.now() }))
  } catch { /* */ }
}
/** Retire d'ici un document supprimé depuis un autre appareil (sans laisser de trace de suppression). */
export function dropLocal(id: string) {
  try { localStorage.setItem(LIST, JSON.stringify(read().filter(d => d.id !== id))) } catch { /* */ }
}
export function fromCloud(c: { id: string; name: string; text: string; s: string; preset: string; updatedAt: number }): Doc {
  let s: Settings = DEFAULTS
  try { s = mergeSettings(JSON.parse(c.s)) } catch { /* réglages illisibles : valeurs par défaut */ }
  return { id: c.id, name: c.name || 'Sans titre', text: c.text, s, preset: presetOf(c.preset), updatedAt: c.updatedAt }
}

/** Nom lisible : titre de la page de garde, sinon premier titre, sinon début du texte. */
export function nameFor(text: string, coverTitle: string, firstHeading?: string): string {
  const pick = coverTitle.trim() || firstHeading?.trim() || text.split('\n').map(l => l.trim()).find(Boolean) || ''
  const t = pick.replace(/^#+\s*/, '').replace(/\*+/g, '').trim()
  return t ? (t.length > 60 ? t.slice(0, 57) + '…' : t) : 'Sans titre'
}
