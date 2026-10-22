import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { parse } from './lib/parse'
import type { Layout } from './lib/layout'
import { DEFAULTS, PRESETS, type Block, type PresetKey, type Settings, type Cover } from './lib/types'
import { SAMPLE } from './sample'

const Preview = lazy(() => import('./Preview'))
const Modal = lazy(() => import('./Modal'))
type Acc = typeof import('./account')
const HAS_BACKEND = !!import.meta.env.VITE_FIREBASE_API_KEY
const newId = () => crypto.randomUUID()
const makeLayout = (...a: Parameters<typeof import('./lib/layout').layoutDocument>) => import('./lib/layout').then(m => m.layoutDocument(...a))
/** Word final : on calcule d'abord les pages, puis on écrit les numéros dans le sommaire. */
async function makeDocx(blocks: Block[], s: Settings): Promise<Blob> {
  const [lay, b] = await Promise.all([makeLayout(blocks, s), import('./lib/build')])
  return b.toBlob(blocks, s, { headings: lay.headingLabels, captions: lay.captionLabels })
}

type Tab = 'texte' | 'garde' | 'reglages' | 'apercu'
const TABS: [Tab, string][] = [['texte', 'Texte'], ['garde', 'Page de garde'], ['reglages', 'Réglages'], ['apercu', 'Aperçu']]
const KEY = 'mondocpro:v1'
const PDF_URL = import.meta.env.VITE_PDF_URL as string | undefined

function load(): { text: string; s: Settings; preset: PresetKey; docId: string } {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '')
    return { text: d.text, s: { ...DEFAULTS, ...d.s, cover: { ...DEFAULTS.cover, ...d.s.cover } }, preset: d.preset, docId: d.docId || newId() }
  } catch { return { text: SAMPLE, s: DEFAULTS, preset: 'memoire', docId: newId() } }
}

const Logo = () => (
  <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2457D6" /><path d="M20 12h17l9 9v31a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" /><path d="M37 12v9h9" fill="none" stroke="#FFC94A" strokeWidth="3" strokeLinejoin="round" /><path d="M24 32h16M24 38h16M24 44h9" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
)

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

export default function App() {
  const init = useMemo(load, [])
  const [text, setText] = useState(init.text)
  const [s, setS] = useState<Settings>(init.s)
  const [preset, setPreset] = useState<PresetKey>(init.preset)
  const [tab, setTab] = useState<Tab>('texte')
  const [layout, setLayout] = useState<Layout | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [docId, setDocId] = useState(init.docId)
  const [acc, setAcc] = useState<Acc | null>(null)
  const [account, setAccount] = useState<import('./account').Account | null>(null)
  const [modal, setModal] = useState<null | 'login' | 'pay'>(null)
  const [pending, setPending] = useState<boolean | null>(null)

  const set = (p: Partial<Settings>) => setS(v => ({ ...v, ...p }))
  const setCover = (p: Partial<Cover>) => setS(v => ({ ...v, cover: { ...v.cover, ...p } }))
  const blocks = useMemo(() => parse(text), [text])

  useEffect(() => {
    if (!HAS_BACKEND) return
    let stop = () => {}, alive = true
    import('./account').then(async m => {
      if (!alive) return
      setAcc(m)
      await m.finishLink().catch(() => {})
      stop = m.watch(setAccount)
    })
    return () => { alive = false; stop() }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      makeLayout(blocks, s).then(l => { setLayout(l); setError('') }).catch(e => setError(String(e.message || e)))
      try { localStorage.setItem(KEY, JSON.stringify({ text, s, preset, docId })) } catch { /* quota */ }
    }, 400)
    return () => clearTimeout(t)
  }, [blocks, s, text, preset, docId])

  const pickPreset = (k: PresetKey) => {
    setPreset(k)
    setS(v => ({ ...v, chapterBreak: PRESETS[k].chapterBreak, tablesList: PRESETS[k].tablesList, cover: { ...v.cover, kind: PRESETS[k].kind } }))
  }

  const save = (b: Blob, ext: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `${(s.cover.title || 'document').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50)}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  const download = async (pdf: boolean) => {
    setError('')
    if (HAS_BACKEND) {
      if (!acc || !account) { setPending(pdf); setModal('login'); return }
      if (!account.paid) {
        const g = await acc.claim('download', { docId }).catch(() => ({ status: 0, error: '' }))
        if (g.status === 402) { setPending(pdf); setModal('pay'); return }
        if (g.status !== 200) { setError('Vérification impossible, réessaie dans un instant.'); return }
      }
    }
    setBusy(true)
    try {
      const docx = await makeDocx(blocks, s)
      if (!pdf) save(docx, 'docx')
      else {
        const r = await fetch(PDF_URL!, { method: 'POST', body: docx })
        if (!r.ok) throw new Error('Le PDF n’a pas pu être créé. Réessaie dans un instant.')
        save(await r.blob(), 'pdf')
      }
    } catch (e) { setError(String((e as Error).message)) }
    setBusy(false)
  }
  const resume = () => { const p = pending; setModal(null); setPending(null); if (p !== null) setTimeout(() => download(p), 0) }

  const onLogo = (f?: File) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const url = String(r.result), img = new Image()
      if (!/^data:image\/(png|jpe?g)/.test(url)) { setError('Logo : utilise un fichier PNG ou JPG.'); return }
      img.onload = () => setCover({ logo: { url, w: img.naturalWidth, h: img.naturalHeight } })
      img.src = url
    }
    r.readAsDataURL(f)
  }

  const tables = blocks.filter(b => b.t === 'table').length
  const heads = blocks.filter(b => b.t === 'h').length

  return (
    <>
      <header className="nav">
        <a className="brand" href="#top"><Logo /><span>mondocpro</span></a>
        {account
          ? <span className="who">{account.paid && <b>À vie</b>}<span>{account.email}</span><button className="link" onClick={() => acc?.logout()}>Déconnexion</button></span>
          : <a className="btn small" href="#atelier">Essayer gratuitement</a>}
      </header>

      <section className="hero" id="top">
        <h1>Ton mémoire ou rapport de stage, <em>bien mis en page</em> en 5 minutes.</h1>
        <p>Colle ton texte, choisis tes réglages, télécharge ton fichier Word et ton PDF. Plus besoin de te battre avec Word.</p>
        <a className="btn" href="#atelier">Essayer gratuitement</a>
        <p className="muted">1er document gratuit · ensuite 1 000 F une seule fois, à vie</p>
        <ol className="steps">
          <li><b>1</b> Colle ton texte</li>
          <li><b>2</b> Remplis ta page de garde</li>
          <li><b>3</b> Télécharge Word ou PDF</li>
        </ol>
      </section>

      <main className="atelier" id="atelier">
        <nav className="tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={(tab === k ? 'on ' : '') + (k === 'apercu' ? 'only-mobile' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>

        <div className={'panel ' + (tab === 'apercu' ? 'hide-mobile' : '')}>
          {tab === 'texte' && (
            <>
              <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-label="Ton texte" placeholder="Colle ton texte ici…" />
              <p className="hint">
                {heads} titre{heads > 1 ? 's' : ''} détecté{heads > 1 ? 's' : ''} · {tables} tableau{tables > 1 ? 'x' : ''}.
                Titres : « CHAPITRE 1 », « I. », « A. », « 1.1 » sont reconnus, ou écris <code># Titre</code>, <code>## Sous-titre</code>.
                Tableau : copie-le depuis Word ou Excel et colle-le ; mets une ligne « Tableau : titre » juste avant pour la légende.
              </p>
              <div className="row"><button className="link" onClick={() => setText(SAMPLE)}>Remettre l’exemple</button><button className="link" onClick={() => { setText(''); setDocId(newId()); setCover({ title: '' }) }}>Nouveau document</button></div>
            </>
          )}

          {tab === 'garde' && (
            <div className="form">
              <Check label="Ajouter une page de garde" checked={s.cover.enabled} onChange={v => setCover({ enabled: v })} />
              {s.cover.enabled && (
                <>
                  <Field label="École / université"><input value={s.cover.school} onChange={e => setCover({ school: e.target.value })} placeholder="Institut Universitaire d’Abidjan" /></Field>
                  <Field label="Type de document"><input value={s.cover.kind} onChange={e => setCover({ kind: e.target.value })} placeholder="MÉMOIRE DE FIN D’ÉTUDES" /></Field>
                  <Field label="Thème / titre"><textarea rows={3} value={s.cover.title} onChange={e => setCover({ title: e.target.value })} placeholder="Analyse du corridor Abidjan-Ouagadougou" /></Field>
                  <Field label="Présenté par"><input value={s.cover.author} onChange={e => setCover({ author: e.target.value })} /></Field>
                  <Field label="Encadreur"><input value={s.cover.supervisor} onChange={e => setCover({ supervisor: e.target.value })} /></Field>
                  <Field label="Année académique"><input value={s.cover.year} onChange={e => setCover({ year: e.target.value })} placeholder="2025-2026" /></Field>
                  <Field label="Logo de l’école (PNG ou JPG)">
                    <input type="file" accept="image/png,image/jpeg" onChange={e => onLogo(e.target.files?.[0])} />
                    {s.cover.logo && <button className="link" onClick={() => setCover({ logo: undefined })}>Retirer le logo</button>}
                  </Field>
                </>
              )}
            </div>
          )}

          {tab === 'reglages' && (
            <div className="form">
              <div className="chips">
                {(Object.keys(PRESETS) as PresetKey[]).map(k => (
                  <button key={k} className={'chip ' + (preset === k ? 'on' : '')} onClick={() => pickPreset(k)}>{PRESETS[k].label}</button>
                ))}
              </div>
              <div className="grid2">
                <Field label="Police">
                  <select value={s.font} onChange={e => set({ font: e.target.value })}>
                    {['Times New Roman', 'Arial', 'Calibri', 'Georgia'].map(f => <option key={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="Taille">
                  <select value={s.size} onChange={e => set({ size: +e.target.value })}>{[10, 11, 12, 13, 14].map(n => <option key={n} value={n}>{n} pt</option>)}</select>
                </Field>
                <Field label="Interligne">
                  <select value={s.spacing} onChange={e => set({ spacing: +e.target.value })}>{[1, 1.15, 1.5, 2].map(n => <option key={n} value={n}>{n}</option>)}</select>
                </Field>
                <Field label="Numéro de page">
                  <select value={s.footer} onChange={e => set({ footer: e.target.value as Settings['footer'] })}>
                    <option value="number">Numéro seul</option><option value="page">« Page 5 »</option><option value="text">Texte + numéro</option>
                  </select>
                </Field>
              </div>
              {s.footer === 'text' && <Field label="Texte du pied de page"><input value={s.footerText} onChange={e => set({ footerText: e.target.value })} placeholder="Nom de l’école ou titre court" /></Field>}
              <Field label="Numéro placé"><select value={s.numAlign} onChange={e => set({ numAlign: e.target.value as Settings['numAlign'] })}><option value="center">Au centre</option><option value="right">À droite</option></select></Field>
              <Field label="En-tête (facultatif)"><input value={s.headerText} onChange={e => set({ headerText: e.target.value })} placeholder="Laisser vide pour aucun en-tête" /></Field>
              <Check label="Texte justifié" checked={s.justify} onChange={v => set({ justify: v })} />
              <Check label="Retrait de première ligne" checked={s.indent} onChange={v => set({ indent: v })} />
              <Check label="Sommaire automatique" checked={s.toc} onChange={v => set({ toc: v })} />
              <Check label="Liste des tableaux" checked={s.tablesList} onChange={v => set({ tablesList: v })} />
              <Check label="Chaque titre principal sur une nouvelle page" checked={s.chapterBreak} onChange={v => set({ chapterBreak: v })} />
              <Check label="Grands tableaux en paysage" hint="6 colonnes ou plus : seule leur page passe en paysage" checked={s.landscape} onChange={v => set({ landscape: v })} />
              <Check label="Marge de reliure" hint="3 cm à gauche au lieu de 2,5 cm" checked={s.reliure} onChange={v => set({ reliure: v })} />
              <Check label="Pages d’avant-texte en chiffres romains" hint="Sommaire en i, ii, iii puis le texte repart à 1" checked={s.romanPrelim} onChange={v => set({ romanPrelim: v })} />
            </div>
          )}
        </div>

        <div className={'view ' + (tab === 'apercu' ? '' : 'hide-mobile')}>
          {error && <p className="error">{error}</p>}
          <Suspense fallback={<p className="hint">Chargement de l’aperçu…</p>}><Preview layout={layout} /></Suspense>
        </div>

        <div className="dock">
          <button className="btn" onClick={() => download(false)} disabled={busy || !blocks.length}>{busy ? 'Préparation…' : 'Télécharger en Word'}</button>
          {PDF_URL && <button className="btn ghost" onClick={() => download(true)} disabled={busy || !blocks.length}>PDF</button>}
        </div>
      </main>

      <section className="info">
        <h2>Ce que le site fait pour toi</h2>
        <ul className="inclus">
          {['Page de garde avec logo', 'Sommaire automatique', 'Pagination et pied de page', 'Texte justifié, interligne, marges', 'Tableaux avec légendes numérotées', 'Grands tableaux en paysage, page par page', 'Export Word modifiable + PDF'].map(x => <li key={x}>{x}</li>)}
        </ul>
        <h2>Questions fréquentes</h2>
        <details><summary>Ça marche sur téléphone ?</summary><p>Oui, tout est pensé pour le smartphone : l’écran passe en onglets Texte, Page de garde, Réglages et Aperçu.</p></details>
        <details><summary>Mon texte est-il enregistré chez vous ?</summary><p>Le Word est fabriqué dans ton navigateur : ton texte reste sur ton appareil. Pour le PDF, le fichier est converti sur notre serveur puis supprimé aussitôt.</p></details>
        <details><summary>Combien ça coûte ?</summary><p>Le premier document est gratuit. Ensuite, 1 000 F payés une seule fois donnent l’accès à vie.</p></details>
        <details><summary>Je peux modifier le fichier après ?</summary><p>Oui : c’est un vrai fichier Word avec de vrais styles de titres, le sommaire est déjà rempli avec les bons numéros de page (clic droit › Mettre à jour les champs si tu modifies le texte).</p></details>
      </section>
      {modal && acc && <Suspense fallback={null}><Modal kind={modal} acc={acc} onClose={() => { setModal(null); setPending(null) }} onDone={resume} /></Suspense>}
      <footer className="foot">mondocpro · fait en Côte d’Ivoire</footer>
    </>
  )
}
