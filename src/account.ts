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
