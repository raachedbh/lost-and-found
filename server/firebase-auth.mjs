import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

let auth

export function firebaseAuthConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID)
}

export async function verifyFirebaseIdToken(idToken) {
  if (!firebaseAuthConfigured()) throw new Error('firebase_not_configured')
  if (!auth) {
    const app = getApps()[0] ?? initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    })
    auth = getAuth(app)
  }
  return auth.verifyIdToken(idToken, true)
}
