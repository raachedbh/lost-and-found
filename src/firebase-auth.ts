export type SocialProvider = 'google' | 'facebook'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function firebaseAuthConfigured() {
  return Object.values(firebaseConfig).every(Boolean)
}

export async function getFirebaseIdToken(providerName: SocialProvider, language: string) {
  if (!firebaseAuthConfigured()) throw new Error('firebase_not_configured')
  const [{ initializeApp, getApp, getApps }, authSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ])
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  const auth = authSdk.getAuth(app)
  auth.languageCode = language === 'tn' ? 'ar' : language
  const provider = providerName === 'google'
    ? new authSdk.GoogleAuthProvider()
    : new authSdk.FacebookAuthProvider()
  const result = await authSdk.signInWithPopup(auth, provider)
  return result.user.getIdToken()
}

export async function signOutFirebase() {
  if (!firebaseAuthConfigured()) return
  const [{ getApp, getApps }, authSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ])
  if (getApps().length) await authSdk.signOut(authSdk.getAuth(getApp()))
}
