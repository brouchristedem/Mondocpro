import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider, getAuth, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail,
  signInWithEmailLink, signInWithPopup, signOut,
} from 'firebase/auth'
import { doc, getFirestore, onSnapshot } from 'firebase/firestore'

const env = import.meta.env
export const HAS_BACKEND = !!env.VITE_FIREBASE_API_KEY
export const WAVE_LINK = env.VITE_WAVE_LINK as string | undefined

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const db = getFirestore(app)
const MAIL = 'mondocpro:email'

export interface Account { email: string | null; paid: boolean }

export function watch(cb: (a: Account | null) => void): () => void {
  let stop = () => {}
  const off = onAuthStateChanged(auth, u => {
    stop(); stop = () => {}
    if (!u) return cb(null)
    cb({ email: u.email, paid: false })
    stop = onSnapshot(doc(db, 'users', u.uid), s => cb({ email: u.email, paid: !!s.data()?.paid }), () => {})
  })
  return () => { off(); stop() }
}

export const loginGoogle = () => signInWithPopup(auth, new GoogleAuthProvider()).then(() => undefined)
export const logout = () => signOut(auth)

export async function sendLink(email: string) {
  await sendSignInLinkToEmail(auth, email, { url: location.origin, handleCodeInApp: true })
  try { localStorage.setItem(MAIL, email) } catch { /* navigation privée */ }
}

/** À appeler au chargement : termine la connexion si l'utilisateur arrive depuis le lien reçu par email. */
export async function finishLink() {
  if (!isSignInWithEmailLink(auth, location.href)) return
  let email = ''
  try { email = localStorage.getItem(MAIL) || '' } catch { /* */ }
  email ||= prompt('Confirme ton adresse email') || ''
  if (!email) return
  await signInWithEmailLink(auth, email, location.href)
  history.replaceState(null, '', location.pathname)
}

export async function claim(action: 'download' | 'activate', payload: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken()
  const r = await fetch((env.VITE_API_URL || '') + '/api/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  })
  const body = await r.json().catch(() => ({}))
  return { status: r.status, error: (body.error as string | undefined) ?? '' }
}

/** Paiement automatique (CinetPay) : actif seulement si VITE_CINETPAY_ENABLED=1, sinon l'ancien parcours (ID Wave en attente) reste. */
export const CINETPAY = env.VITE_CINETPAY_ENABLED === '1'

async function payCall(method: 'POST' | 'GET', query = '') {
  const token = await auth.currentUser?.getIdToken()
  const r = await fetch((env.VITE_API_URL || '') + '/api/pay' + query, { method, headers: { Authorization: `Bearer ${token}` } })
  const body = await r.json().catch(() => ({}))
  return { status: r.status, body }
}

/** Crée la commande côté serveur (le montant n'est jamais envoyé par le navigateur) et renvoie la page de paiement. */
export async function startPay(): Promise<{ paymentUrl: string }> {
  const r = await payCall('POST')
  if (r.status !== 200 || !r.body.paymentUrl) {
    if (r.body.paid) return { paymentUrl: location.origin }
    throw new Error(r.status === 429 ? 'Trop de tentatives. Réessaie plus tard.' : 'Le paiement n’a pas pu démarrer. Réessaie dans un instant.')
  }
  return { paymentUrl: String(r.body.paymentUrl) }
}

/** Au retour du paiement : le serveur redemande le statut réel au prestataire (filet de sécurité si le webhook tarde). */
export async function payStatus(id: string): Promise<{ status: string; paid: boolean } | null> {
  const r = await payCall('GET', `?tx=${encodeURIComponent(id)}`)
  return r.status === 200 ? { status: String(r.body.status), paid: !!r.body.paid } : null
}
