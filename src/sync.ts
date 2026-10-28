import type { Doc } from './storage'

/** Document tel qu'il est gardé dans le compte (Firestore). `s` = réglages en JSON ; `deleted` = document supprimé (trace pour les autres appareils). */
export interface CloudDoc { id: string; name: string; text: string; s: string; preset: string; updatedAt: number; deleted?: boolean }

export interface SyncPlan {
  pull: CloudDoc[]            // à copier sur cet appareil
  push: Doc[]                 // à envoyer au compte
  removeLocal: string[]       // supprimés ailleurs : à retirer d'ici
  pushDeleted: { id: string; updatedAt: number }[] // supprimés ici : à signaler au compte
}

/**
 * Fusionne les documents de l'appareil et ceux du compte : pour chaque document, la modification la plus récente gagne.
 * `tombs` = documents supprimés sur cet appareil (id → date de suppression).
 */
export function planSync(local: Doc[], cloud: CloudDoc[], tombs: Record<string, number>): SyncPlan {
  const plan: SyncPlan = { pull: [], push: [], removeLocal: [], pushDeleted: [] }
  const byId = new Map(local.map(d => [d.id, d]))
  const seen = new Set<string>()
  for (const c of cloud) {
    seen.add(c.id)
    const l = byId.get(c.id)
    const t = tombs[c.id]
    if (c.deleted) {
      if (l && l.updatedAt > c.updatedAt) plan.push.push(l)       // modifié ici après la suppression : on le garde
      else if (l) plan.removeLocal.push(c.id)
      continue
    }
    if (t !== undefined && !l) {
      if (c.updatedAt > t) plan.pull.push(c)                       // modifié ailleurs après ma suppression : il revient
      else plan.pushDeleted.push({ id: c.id, updatedAt: t })       // supprimé ici : on le signale
      continue
    }
    if (!l) plan.pull.push(c)
    else if (c.updatedAt > l.updatedAt) plan.pull.push(c)
    else if (l.updatedAt > c.updatedAt) plan.push.push(l)
  }
  for (const l of local) if (!seen.has(l.id)) plan.push.push(l)
  for (const [id, at] of Object.entries(tombs)) if (!seen.has(id)) plan.pushDeleted.push({ id, updatedAt: at })
  return plan
}

/** Réglages envoyés au compte : le logo (souvent lourd) est laissé de côté s'il ferait dépasser la limite. */
export function packSettings(d: Doc): string {
  let sj = JSON.stringify(d.s)
  if (sj.length > 250_000) sj = JSON.stringify({ ...d.s, cover: { ...d.s.cover, logo: undefined } })
  return sj
}
export const toCloud = (d: Doc): CloudDoc => ({ id: d.id, name: d.name.slice(0, 120), text: d.text.slice(0, 590_000), s: packSettings(d), preset: d.preset, updatedAt: d.updatedAt })
export const deletedMarker = (id: string, updatedAt: number): CloudDoc => ({ id, name: '', text: '', s: '{}', preset: 'standard', updatedAt, deleted: true })
