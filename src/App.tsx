import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { extractCover } from './lib/cover'
import { parse } from './lib/parse'
import type { Layout } from './lib/layout'
import { DEFAULTS, DEFAULT_PRESET, PRESETS, type Block, type Cover, type PresetKey, type Settings } from './lib/types'
import { clearTombs, currentId, dropLocal, fromCloud, getDoc, listDocs, nameFor, newId, removeDoc, saveDoc, setCurrent, tombs, type Doc } from './storage'
import { deletedMarker, planSync, toCloud } from './sync'
import { useInstall } from './install'
import ContactFab from './ContactFab'
import { PHONE_SHOW, TEL_URL, WA_URL } from './contact'

const AdminDialog = lazy(() => import('./AdminDialog'))
const ADMIN_EMAILS = ((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? 'brouchristedem@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
const Preview = lazy(() => import('./Preview'))
const DownloadDialog = lazy(() => import('./DownloadDialog'))
const LibraryDialog = lazy(() => import('./LibraryDialog'))
const LoginDialog = lazy(() => import('./LoginDialog'))
type Acc = typeof import('./account')
const HAS_BACKEND = !!import.meta.env.VITE_FIREBASE_API_KEY
const ACCT_FLAG = 'mondocpro:acct'
const PDF_URL = import.meta.env.VITE_PDF_URL as string | undefined

const makeLayout = (...a: Parameters<typeof import('./lib/layout').layoutDocument>) => import('./lib/layout').then(m => m.layoutDocument(...a))
/** Word final : on calcule d'abord les pages, puis on écrit les numéros dans le sommaire. */
async function makeDocx(blocks: Block[], s: Settings): Promise<Blob> {
  const [lay, b] = await Promise.all([makeLayout(blocks, s), import('./lib/build')])
  return b.toBlob(blocks, s, { headings: lay.headingLabels, captions: lay.captionLabels })
}

type Tab = 'texte' | 'garde' | 'reglages' | 'apercu'
const TABS: [Tab, string][] = [['texte', 'Texte'], ['garde', 'Page de garde'], ['reglages', 'Réglages'], ['apercu', 'Aperçu']]

const Logo = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2457D6" /><path d="M20 12h17l9 9v31a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" /><path d="M37 12v9h9" fill="none" stroke="#FFC94A" strokeWidth="3" strokeLinejoin="round" /><path d="M24 32h16M24 38h16M24 44h9" stroke="#fff" strokeWidth="3" strokeLinecap="round" /></svg>
)

function Check({ label, hint, checked, disabled, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

const blank = (): Doc => ({ id: newId(), name: 'Sans titre', text: '', s: DEFAULTS, preset: DEFAULT_PRESET, updatedAt: 0 })

export default function App() {
  const init = useMemo<Doc>(() => {
    listDocs()
    const id = currentId()
    return (id && getDoc(id)) || blank()
  }, [])
  const [docId, setDocId] = useState(init.id)
  const [text, setText] = useState(init.text)
  const [s, setS] = useState<Settings>(init.s)
  const [preset, setPreset] = useState<PresetKey>(init.preset)
  const [tab, setTab] = useState<Tab>('texte')
  const [layout, setLayout] = useState<Layout | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<null | 'download' | 'library' | 'login' | 'admin'>(null)
  const [users, setUsers] = useState<number | null>(null)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>(init.text.trim() ? 'saved' : 'idle')
  const [docs, setDocs] = useState<Doc[]>(() => listDocs())
  const [toast, setToast] = useState('')
  const install = useInstall()
  const [acc, setAcc] = useState<Acc | null>(null)
  const [account, setAccount] = useState<import('./account').Account | null>(null)
  const [syncState, setSyncState] = useState<'off' | 'syncing' | 'ok' | 'error'>('off')
  const accRef = useRef<Promise<Acc> | null>(null)
  const stopWatch = useRef<() => void>(() => {})
  const syncing = useRef(false)
  const pushT = useRef<number>(0)
  const uid = account?.uid
  const isAdmin = !!account?.email && ADMIN_EMAILS.includes(account.email.toLowerCase()) // simple affichage du bouton : l'accès réel est vérifié côté serveur
  const taRef = useRef<HTMLTextAreaElement>(null)
  const atelierRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)
  const toastT = useRef<number>(0)

  const say = useCallback((m: string) => {
    setToast(m); window.clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const set = (p: Partial<Settings>) => setS(v => ({ ...v, ...p }))
  const setCover = (p: Partial<Cover>) => setS(v => ({ ...v, cover: { ...v.cover, ...p } }))
  const meta = useMemo(() => extractCover(text), [text])
  const blocks = useMemo(() => parse(meta.body), [meta])
  const found = meta.cover
  const hasFound = Object.keys(found).length > 0
  const sEff = useMemo<Settings>(() => ({ ...s, cover: { ...s.cover, ...found, enabled: s.cover.enabled || hasFound } }), [s, found, hasFound])
  const empty = !text.trim()
  const heads = blocks.filter(b => b.t === 'h').length
  const tables = blocks.filter(b => b.t === 'table').length
  const firstHead = blocks.find((b): b is Extract<Block, { t: 'h' }> => b.t === 'h')?.text
  const docName = useMemo(() => nameFor(text, sEff.cover.title, firstHead), [text, sEff.cover.title, firstHead])

  // pages : recalculées 0,4 s après la dernière frappe
  useEffect(() => {
    if (empty) { setLayout(null); setError(''); return }
    const t = setTimeout(() => { makeLayout(blocks, sEff).then(l => { setLayout(l); setError('') }).catch(e => setError(String(e.message || e))) }, 400)
    return () => clearTimeout(t)
  }, [blocks, sEff, empty])

  // nombre d'utilisateurs : affiché seulement si le propriétaire l'a activé dans l'espace admin
  useEffect(() => {
    if (install.installed) return
    fetch((import.meta.env.VITE_API_URL || '') + '/api/stats')
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b && typeof b.count === 'number') setUsers(b.count) })
      .catch(() => {})
  }, [install.installed])

  // les boutons Enregistrer / Télécharger ne s'affichent que sur l'atelier (pas sur l'accueil)
  useEffect(() => {
    const el = atelierRef.current
    if (!el || !('IntersectionObserver' in window)) { setInView(true); return }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // enregistrement automatique (dans cet appareil)
  const persist = useCallback((): boolean => {
    if (!text.trim()) return true
    // rien n'a changé depuis le dernier enregistrement : on ne touche pas à la date (sinon un document ouvert écraserait la version du compte)
    const prev = getDoc(docId)
    if (prev && prev.text === text && prev.preset === preset && JSON.stringify(prev.s) === JSON.stringify(s)) return true
    const d: Doc = { id: docId, name: docName, text, s, preset, updatedAt: Date.now() }
    const ok = saveDoc(d)
    if (ok) {
      setCurrent(docId); setDocs(listDocs())
      if (acc && uid) { // envoi au compte, regroupé (au plus un envoi toutes les 1,5 s)
        window.clearTimeout(pushT.current)
        pushT.current = window.setTimeout(() => { acc.saveCloudDoc(uid, toCloud(d)).then(() => setSyncState('ok')).catch(() => setSyncState('error')) }, 1500)
      }
    }
    setSaved(ok ? 'saved' : 'error')
    return ok
  }, [docId, docName, text, s, preset, acc, uid])
  const persistRef = useRef(persist)
  persistRef.current = persist
  const docIdRef = useRef(docId)
  docIdRef.current = docId
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!text.trim()) { setSaved('idle'); return }
    setSaved('saving')
    const t = setTimeout(persist, 700)
    return () => clearTimeout(t)
  }, [text, s, preset, persist])

  // hors connexion : on charge à l'avance les morceaux utilisés pour l'aperçu et le Word
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2500))
    idle(() => { import('./lib/layout'); import('./lib/build'); import('./Preview'); import('./DownloadDialog'); import('./LibraryDialog') })
  }, [])

  // compte (facultatif) : chargé seulement si la personne est déjà connectée ou revient d'un lien reçu par e-mail
  const loadAcc = useCallback((): Promise<Acc> => {
    if (!accRef.current) {
      accRef.current = import('./account').then(async m => {
        setAcc(m)
        await m.finishLink().catch(() => {})
        stopWatch.current = m.watch(a => { setAccount(a); if (a) { try { localStorage.setItem(ACCT_FLAG, '1') } catch { /* */ } } })
        return m
      })
    }
    return accRef.current
  }, [])
  useEffect(() => {
    if (!HAS_BACKEND) return
    let flag = false
    try { flag = localStorage.getItem(ACCT_FLAG) === '1' } catch { /* */ }
    if (flag || /[?&]oobCode=/.test(location.search)) loadAcc()
    return () => stopWatch.current()
  }, [loadAcc])
  useEffect(() => { if (account && dialog === 'login') { setDialog(null); say('Connecté : tes documents sont synchronisés.') } }, [account, dialog, say])

  const syncAll = useCallback(async () => {
    if (!acc || !uid || syncing.current) return
    syncing.current = true; setSyncState('syncing')
    try {
      persistRef.current()
      const plan = planSync(listDocs(), await acc.listCloudDocs(uid), tombs())
      for (const c of plan.pull) saveDoc(fromCloud(c))
      for (const id of plan.removeLocal) dropLocal(id)
      await Promise.all([
        ...plan.push.map(d => acc.saveCloudDoc(uid, toCloud(d))),
        ...plan.pushDeleted.map(x => acc.saveCloudDoc(uid, deletedMarker(x.id, x.updatedAt))),
      ])
      clearTombs(plan.pushDeleted.map(x => x.id))
      setDocs(listDocs())
      const here = docIdRef.current
      const fresh = plan.pull.find(c => c.id === here)
      if (fresh) { const d = fromCloud(fresh); setText(d.text); setS(d.s); setPreset(d.preset); setSaved('saved') }
      setSyncState('ok')
    } catch { setSyncState('error') }
    syncing.current = false
  }, [acc, uid])
  useEffect(() => {
    if (!uid) { setSyncState('off'); return }
    syncAll()
    const onVis = () => { if (document.visibilityState === 'visible') syncAll() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [uid, syncAll])
  const openLogin = async () => { await loadAcc(); setDialog('login') }
  const logout = async () => { await acc?.logout(); try { localStorage.removeItem(ACCT_FLAG) } catch { /* */ } setAccount(null); setDialog(null); say('Déconnecté. Tes documents restent sur cet appareil.') }
  const removeOne = (id: string) => {
    removeDoc(id); setDocs(listDocs())
    if (id === docId) setSaved('idle')
    if (acc && uid) acc.saveCloudDoc(uid, deletedMarker(id, Date.now())).then(() => clearTombs([id])).catch(() => setSyncState('error'))
  }

  const load = (d: Doc) => {
    setDocId(d.id); setText(d.text); setS(d.s); setPreset(d.preset); setTab('texte'); setDialog(null); setCurrent(d.id)
    setSaved(d.text.trim() ? 'saved' : 'idle'); firstRun.current = true
    document.getElementById('atelier')?.scrollIntoView()
  }
  const newDoc = () => {
    persist()
    const d = blank(); load(d); setTimeout(() => taRef.current?.focus(), 50)
  }

  const pickPreset = (k: PresetKey) => {
    const P = PRESETS[k]
    setPreset(k)
    setS(v => ({ ...v, toc: P.toc, chapterBreak: P.chapterBreak, tablesList: P.tablesList, cover: { ...v.cover, enabled: P.cover } }))
  }

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) { say('Le presse-papiers est vide : copie d’abord ton texte.'); return }
      setText(cur => (cur.trim() ? cur.replace(/\s+$/, '') + '\n\n' + t : t))
      setTab('texte')
    } catch {
      taRef.current?.focus()
      say('Appuie longuement dans la zone, puis choisis « Coller ».')
    }
  }

  const save = (b: Blob, ext: string, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'document'}.${ext}`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  const download = async (kind: 'docx' | 'pdf', name: string) => {
    setError(''); setBusy(true)
    try {
      persist()
      if (kind === 'docx') {
        save(await makeDocx(blocks, sEff), 'docx', name)
        setDialog(null); say('Ton fichier Word est téléchargé.')
      } else if (PDF_URL) {
        const r = await fetch(PDF_URL, { method: 'POST', body: await makeDocx(blocks, sEff) })
        if (!r.ok) throw new Error('Le PDF n’a pas pu être créé. Réessaie dans un instant.')
        save(await r.blob(), 'pdf', name)
        setDialog(null); say('Ton PDF est téléchargé.')
      } else {
        const lay = await makeLayout(blocks, sEff)
        const { printPdf } = await import('./print')
        setDialog(null)
        await printPdf(lay.pages, name)
      }
    } catch (e) { setError(String((e as Error).message || e)) }
    setBusy(false)
  }

  const syncLabel = syncState === 'syncing' ? 'synchronisation…' : syncState === 'ok' ? 'synchronisé' : syncState === 'error' ? 'synchronisation impossible' : ''
  const savedLabel = saved === 'saving' ? 'Enregistrement…' : saved === 'error' ? 'Espace plein : télécharge ton fichier'
    : saved === 'saved' ? (account && syncLabel ? `Enregistré · ${syncLabel}` : 'Enregistré') : ''
  const explicitSave = () => { if (persist()) say('Document enregistré dans « Mes documents ».'); else say('Enregistrement impossible : l’espace de ton navigateur est plein.') }
  const goInstall = async () => {
    if (install.canPrompt) { await install.prompt(); return }
    document.getElementById('installer')?.scrollIntoView({ behavior: 'smooth' })
  }
  const pages = layout?.pages.length ?? null

  return (
    <>
      <header className="nav">
        {HAS_BACKEND && (account
          ? <button className="nav-btn left" onClick={() => { setDocs(listDocs()); setDialog('library') }}>Mon compte</button>
          : <button className="nav-btn left" onClick={openLogin}>Connexion</button>)}
        <a className="brand" href="#top"><Logo /><span>mondocpro</span></a>
        {!install.installed && <button className="nav-btn" onClick={goInstall}>Installer</button>}
      </header>

      {!install.installed && (
        <section className="hero" id="top">
          <span className="badge">Gratuit pour le moment</span>
          <h1>Colle ton texte.<br /><em>Récupère un Word impeccable.</em></h1>
          <p className="lead">Titres, sommaire, pagination et tableaux se mettent en page tout seuls.</p>
          <a className="btn big" href="#atelier">Mettre mon texte en page</a>
          <ul className="proof"><li>Sans inscription</li><li>Word et PDF</li><li>Sur téléphone</li>{users !== null && <li>{users.toLocaleString('fr-FR')} utilisateur{users > 1 ? 's' : ''} inscrit{users > 1 ? 's' : ''}</li>}</ul>

          <div className="demo" aria-hidden="true">
            <figure className="raw">
              <figcaption>Ton texte collé</figcaption>
              <div className="rawtext">
                <p>CHAPITRE 1 : LE MARCHÉ</p>
                <p>I. Les chiffres clés</p>
                <p>Les ventes ont progressé sur toute l’année, portées par la demande locale.</p>
                <p className="tabs">Produit&nbsp;&nbsp;&nbsp;Ventes&nbsp;&nbsp;&nbsp;Part</p>
                <p className="tabs">Riz&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1 200&nbsp;&nbsp;&nbsp;&nbsp;40 %</p>
                <p className="tabs">Maïs&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;900&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;30 %</p>
              </div>
            </figure>
            <div className="arrow">→</div>
            <figure className="doc">
              <figcaption>Ton document prêt</figcaption>
              <div className="page">
                <div className="toc-t">SOMMAIRE</div>
                <div className="toc"><span>CHAPITRE 1 : LE MARCHÉ</span><i /><b>2</b></div>
                <div className="toc sub"><span>I. Les chiffres clés</span><i /><b>2</b></div>
                <div className="h">I. Les chiffres clés</div>
                <div className="line" /><div className="line s" />
                <div className="cap">Tableau 1 : Ventes par produit</div>
                <table><tbody><tr><th>Produit</th><th>Ventes</th><th>Part</th></tr><tr><td>Riz</td><td>1 200</td><td>40 %</td></tr><tr><td>Maïs</td><td>900</td><td>30 %</td></tr></tbody></table>
                <div className="num">2</div>
              </div>
            </figure>
          </div>
          <p className="fine">Offre de lancement : gratuit pour le moment. Un tarif sera proposé plus tard.</p>
        </section>
      )}

      <main className="atelier" id="atelier" ref={atelierRef}>
        {!install.installed && <h2 className="section-title">Ton document</h2>}
        <div className="bar">
          <button className="chipbtn" onClick={() => { setDocs(listDocs()); setDialog('library') }}>Mes documents{docs.length > 0 ? ` · ${docs.length}` : ''}</button>
          <span className={'status ' + saved} aria-live="polite">{savedLabel}</span>
          <button className="chipbtn" onClick={newDoc} disabled={empty && !hasFound}>Nouveau</button>
        </div>

        <nav className="tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={(tab === k ? 'on ' : '') + (k === 'apercu' ? 'only-mobile' : '')} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>

        <div className={'panel ' + (tab === 'apercu' ? 'hide-mobile' : '')}>
          {tab === 'texte' && (
            <>
              <div className="row actions">
                <button className="btn small" onClick={paste}>Coller mon texte</button>
                {!empty && <button className="link" onClick={() => { setText(''); setCover({ title: '' }); taRef.current?.focus() }}>Tout effacer</button>}
              </div>
              <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-label="Ton texte" placeholder="Colle ton texte ici…" />
              {empty
                ? <p className="hint">Copie ton texte depuis Word, un mail, un PDF ou tes notes, puis colle-le ici. Tout le reste est automatique.</p>
                : <p className="hint found">{heads} titre{heads > 1 ? 's' : ''} · {tables} tableau{tables > 1 ? 'x' : ''}{pages ? ` · ${pages} page${pages > 1 ? 's' : ''}` : ''}</p>}
              <details className="tips">
                <summary>Astuces de mise en page</summary>
                <ul>
                  <li><b>Titres</b> : « CHAPITRE 1 », « I. », « A. », « 1.1 » sont reconnus. Tu peux aussi écrire <code># Titre</code> et <code>## Sous-titre</code>.</li>
                  <li><b>Tableaux</b> : copie-les depuis Word, Excel ou un PDF et colle-les. Ajoute « Tableau : titre » juste avant pour la légende.</li>
                  <li><b>Page de garde</b> : écris « Thème : … », « Présenté par : … » au début, elle se remplit toute seule.</li>
                  <li><b>Gras</b> : entoure un mot de deux étoiles, <code>**comme ça**</code>.</li>
                </ul>
              </details>
            </>
          )}

          {tab === 'garde' && (
            <div className="form">
              <Check label="Ajouter une page de garde" checked={sEff.cover.enabled} disabled={hasFound} onChange={v => setCover({ enabled: v })} />
              {sEff.cover.enabled && (
                <>
                  {hasFound && <p className="note">Page de garde lue dans ton texte : les champs détectés se remplissent tout seuls (modifie-les dans ton texte).</p>}
                  <Field label="Établissement ou société"><input value={sEff.cover.school} readOnly={!!found.school} onChange={e => setCover({ school: e.target.value })} placeholder="Nom de l’établissement" /></Field>
                  <Field label="Type de document"><input value={sEff.cover.kind} readOnly={!!found.kind} onChange={e => setCover({ kind: e.target.value })} placeholder="RAPPORT, DOSSIER, MÉMOIRE…" /></Field>
                  <Field label="Titre"><textarea rows={3} value={sEff.cover.title} readOnly={!!found.title} onChange={e => setCover({ title: e.target.value })} placeholder="Le titre de ton document" /></Field>
                  <Field label="Présenté par"><input value={sEff.cover.author} readOnly={!!found.author} onChange={e => setCover({ author: e.target.value })} /></Field>
                  <Field label="Encadreur ou responsable"><input value={sEff.cover.supervisor} readOnly={!!found.supervisor} onChange={e => setCover({ supervisor: e.target.value })} /></Field>
                  <Field label="Année"><input value={sEff.cover.year} readOnly={!!found.year} onChange={e => setCover({ year: e.target.value })} placeholder="2025-2026" /></Field>
                  <Field label="Logo (PNG ou JPG)">
                    <input type="file" accept="image/png,image/jpeg" onChange={e => onLogo(e.target.files?.[0])} />
                    {s.cover.logo && <button className="link" onClick={() => setCover({ logo: undefined })}>Retirer le logo</button>}
                  </Field>
                </>
              )}
            </div>
          )}

          {tab === 'reglages' && (
            <div className="form">
              <div>
                <p className="label">Modèle</p>
                <div className="chips">
                  {(Object.keys(PRESETS) as PresetKey[]).map(k => (
                    <button key={k} className={'chip ' + (preset === k ? 'on' : '')} onClick={() => pickPreset(k)}>{PRESETS[k].label}</button>
                  ))}
                </div>
                <p className="hint">{PRESETS[preset].hint}</p>
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
              {s.footer === 'text' && <Field label="Texte du pied de page"><input value={s.footerText} onChange={e => set({ footerText: e.target.value })} placeholder="Nom ou titre court" /></Field>}
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
          {error && !dialog && <p className="error">{error}</p>}
          {empty
            ? <div className="emptyview"><div className="ghostpage" aria-hidden="true"><i /><i /><i className="s" /></div><p>Ton document apparaît ici dès que tu colles ton texte.</p></div>
            : <Suspense fallback={<p className="hint">Chargement de l’aperçu…</p>}><Preview layout={layout} /></Suspense>}
        </div>

        <div className={'dock' + (inView && !empty ? ' show' : '')} aria-hidden={!(inView && !empty)}>
          <button className="btn ghost" onClick={explicitSave} disabled={empty}>Enregistrer</button>
          <button className="btn" onClick={() => { setError(''); setDialog('download') }} disabled={empty || !blocks.length}>Télécharger</button>
        </div>
      </main>

      {!install.installed && (
        <>
          <section className="band">
            <h2>Trois gestes, c’est fini</h2>
            <ol className="steps">
              <li><b>1</b><h3>Colle ton texte</h3><p>Depuis Word, un mail, un PDF ou tes notes.</p></li>
              <li><b>2</b><h3>Choisis un modèle</h3><p>Complet, Standard ou Simple. Un seul geste.</p></li>
              <li><b>3</b><h3>Télécharge</h3><p>Word modifiable ou PDF prêt à envoyer.</p></li>
            </ol>
          </section>

          <section className="info">
            <h2>Tout est fait pour toi</h2>
            <ul className="feats">
              <li><h3>Titres reconnus</h3><p>CHAPITRE 1, I., A., 1.1… détectés tout seuls.</p></li>
              <li><h3>Sommaire automatique</h3><p>Avec les bons numéros de page.</p></li>
              <li><h3>Tableaux propres</h3><p>Collés depuis Word, Excel ou un PDF, avec légendes.</p></li>
              <li><h3>Pagination exacte</h3><p>L’aperçu montre les vraies pages.</p></li>
              <li><h3>Page de garde</h3><p>Facultative, avec ton logo.</p></li>
              <li><h3>Tes documents partout</h3><p>Connecte-toi (gratuit) pour les retrouver sur tous tes appareils.</p></li>
            </ul>
          </section>

          <section className="band" id="installer">
            <h2>Installe mondocpro</h2>
            <p className="lead">Un accès direct depuis ton écran d’accueil, même sans connexion.</p>
            {install.canPrompt && <button className="btn" onClick={() => install.prompt()}>Installer l’application</button>}
            <div className="how">
              <div><h3>Android · Chrome</h3><p>Touche <b>⋮</b> puis <b>« Installer l’application »</b>.</p></div>
              <div><h3>iPhone · Safari</h3><p>Touche <b>Partager</b> puis <b>« Sur l’écran d’accueil »</b>.</p></div>
            </div>
          </section>

          <section className="info">
            <h2>Questions</h2>
            <details><summary>Est-ce vraiment gratuit ?</summary><p>Oui, mondocpro est gratuit pour le moment. Un tarif sera proposé plus tard, après la période de lancement.</p></details>
            <details><summary>Mon texte reste-t-il privé ?</summary><p>Oui. Sans compte, ton texte reste sur ton appareil. Si tu te connectes, tes documents sont gardés dans ton compte, visibles par toi seul.</p></details>
            <details><summary>Puis-je modifier le fichier ?</summary><p>Oui. Le Word est un vrai fichier, avec de vrais styles de titres et un sommaire déjà rempli.</p></details>
            <details><summary>Comment sont reconnus les tableaux ?</summary><p>Copie-les depuis Word, Excel ou un PDF, puis colle-les dans ton texte. Ajoute « Tableau : titre » juste avant pour la légende.</p></details>
            <details><summary>Où sont mes documents ?</summary><p>Enregistrés automatiquement sur ton appareil, dans « Mes documents ». Connecte-toi pour les retrouver sur tous tes appareils.</p></details>
          </section>
          <footer className="foot">
            <p className="contact">Service client : <a href={TEL_URL}>{PHONE_SHOW}</a> · <a href={WA_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
            mondocpro · fait en Côte d’Ivoire
          </footer>
        </>
      )}

      {dialog === 'download' && <Suspense fallback={null}><DownloadDialog defaultName={docName === 'Sans titre' ? 'document' : docName} pages={pages} busy={busy} error={error} onPick={download} onClose={() => setDialog(null)} /></Suspense>}
      {dialog === 'library' && <Suspense fallback={null}><LibraryDialog docs={docs} currentId={docId} onOpen={load} onDelete={removeOne} onNew={newDoc} onClose={() => setDialog(null)} account={HAS_BACKEND ? (account ? { email: account.email } : null) : undefined} syncLabel={syncLabel} onLogin={openLogin} onLogout={logout} onAdmin={isAdmin ? () => setDialog('admin') : undefined} /></Suspense>}
      {dialog === 'admin' && acc && isAdmin && <Suspense fallback={null}><AdminDialog acc={acc} onClose={() => setDialog(null)} /></Suspense>}
      <ContactFab />
      {dialog === 'login' && acc && <Suspense fallback={null}><LoginDialog acc={acc} onClose={() => setDialog(null)} /></Suspense>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )

  function onLogo(f?: File) {
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
}
