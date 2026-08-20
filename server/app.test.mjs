import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createApp } from './app.mjs'

const testDir = mkdtempSync(join(tmpdir(), 'l9itha-api-'))
const app = createApp({
  databasePath: join(testDir, 'test.sqlite'),
  dataDir: testDir,
  uploadsDir: join(testDir, 'uploads'),
  verifyFirebaseToken: async (token) => {
    if (token !== 'valid-user-two') throw new Error('invalid token')
    return { uid: 'user-two', name: 'Nadia Test', email: 'nadia@example.test', email_verified: true }
  },
})
const server = createServer(app.handler)
let baseUrl = ''
let cookie = ''

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  app.close()
  rmSync(testDir, { recursive: true, force: true })
})

async function request(path, options = {}) {
  const { captureCookie = true, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers)
  headers.set('Origin', baseUrl)
  if (cookie && !headers.has('Cookie')) headers.set('Cookie', cookie)
  if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...fetchOptions, headers })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie && captureCookie) cookie = setCookie.split(';')[0]
  const body = response.status === 204 ? null : await response.json()
  return { response, body }
}

test('health and public case browsing work without authentication', async () => {
  const health = await request('/api/health')
  assert.equal(health.response.status, 200)
  assert.equal(health.body.database, true)
  assert.equal(health.body.version, 3)
  assert.equal(health.body.firebaseAuth, true)

  const cases = await request('/api/cases?q=portefeuille')
  assert.equal(cases.response.status, 200)
  assert.equal(cases.body.total, 2)
  assert.ok(cases.body.cases.some((item) => item.id === 'green-wallet-ariana'))
})

test('mutations require a session and demo auth uses an HttpOnly cookie', async () => {
  const blocked = await request('/api/cases', {
    method: 'POST',
    body: JSON.stringify({ kind: 'lost' }),
  })
  assert.equal(blocked.response.status, 401)

  const blockedReport = await request('/api/reports', {
    method: 'POST',
    body: JSON.stringify({ objectType: 'case', objectId: 'car-key-menzah', reason: 'spam' }),
  })
  assert.equal(blockedReport.response.status, 401)

  const auth = await request('/api/auth/demo', { method: 'POST' })
  assert.equal(auth.response.status, 201)
  assert.equal(auth.body.user.verified, true)
  assert.match(auth.response.headers.get('set-cookie'), /HttpOnly/)
})

test('Firebase sign-in creates a distinct local session and conversation access is member-scoped', async () => {
  const demoCookie = cookie
  const signedIn = await request('/api/auth/firebase', {
    method: 'POST', headers: { Cookie: '' }, body: JSON.stringify({ idToken: 'valid-user-two' }),
  })
  assert.equal(signedIn.response.status, 201)
  assert.equal(signedIn.body.user.id, 'firebase:user-two')
  assert.equal(signedIn.body.user.name, 'Nadia Test')
  const secondUserCookie = cookie

  const conversations = await request('/api/conversations')
  assert.deepEqual(conversations.body.conversations, [])
  assert.equal((await request('/api/conversations/wallet-chat/messages')).response.status, 404)
  assert.equal((await request('/api/conversations/wallet-chat/messages', {
    method: 'POST', body: JSON.stringify({ body: 'Unauthorized message' }),
  })).response.status, 404)
  assert.equal((await request('/api/reports', {
    method: 'POST', body: JSON.stringify({ objectType: 'message', objectId: 'm1', reason: 'spam' }),
  })).response.status, 404)

  const started = await request('/api/conversations', {
    method: 'POST', body: JSON.stringify({ caseId: 'car-key-menzah' }),
  })
  assert.equal(started.response.status, 201)
  const ownConversationId = started.body.conversation.id
  assert.equal((await request(`/api/conversations/${ownConversationId}/messages`)).response.status, 200)
  assert.equal((await request(`/api/conversations/${ownConversationId}/messages`, {
    method: 'POST', body: JSON.stringify({ body: 'Hello Ahmed' }),
  })).response.status, 201)

  cookie = demoCookie
  const demoThread = await request('/api/conversations/wallet-chat/messages')
  assert.equal(demoThread.response.status, 200)
  assert.equal(demoThread.body.messages[0].from, 'them')
  assert.ok(secondUserCookie)
})

test('production disables demo auth and secures Firebase session cookies', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'l9itha-production-auth-'))
  const productionApp = createApp({
    databasePath: join(directory, 'test.sqlite'), dataDir: directory, production: true,
    verifyFirebaseToken: async () => ({ uid: 'production-user', name: 'Production User', email_verified: true }),
  })
  const productionServer = createServer(productionApp.handler)
  await new Promise((resolve) => productionServer.listen(0, '127.0.0.1', resolve))
  const address = productionServer.address()
  const origin = `http://127.0.0.1:${address.port}`
  try {
    const demo = await fetch(`${origin}/api/auth/demo`, { method: 'POST', headers: { Origin: origin } })
    assert.equal(demo.status, 404)
    const firebase = await fetch(`${origin}/api/auth/firebase`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 'valid' }),
    })
    assert.equal(firebase.status, 201)
    assert.match(firebase.headers.get('set-cookie'), /; Secure/)
    assert.match(firebase.headers.get('strict-transport-security'), /max-age=31536000/)
  } finally {
    await new Promise((resolve) => productionServer.close(resolve))
    productionApp.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('publishing persists a validated case and saving persists per user', async () => {
  const created = await request('/api/cases', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'lost', category: 'phones', title: 'Black phone', description: 'Lost near the station',
      location: 'Ariana', date: '2026-08-20', reward: 25,
    }),
  })
  assert.equal(created.response.status, 201)
  assert.equal(created.body.case.title.en, 'Black phone')
  assert.equal(created.body.case.author.name, 'Yacine')

  const id = created.body.case.id
  const saved = await request(`/api/cases/${id}/saved`, { method: 'PUT', body: JSON.stringify({ saved: true }) })
  assert.equal(saved.response.status, 200)

  const persisted = await request('/api/cases?saved=true')
  assert.ok(persisted.body.cases.some((item) => item.id === id && item.saved))

  const status = await request(`/api/cases/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'returned' }) })
  assert.equal(status.response.status, 200)
  const returned = await request('/api/cases')
  assert.equal(returned.body.cases.find((item) => item.id === id).status, 'returned')
})

test('matching previews are explainable and publishing persists the same suggestions', async () => {
  const input = {
    kind: 'lost', category: 'wallets', title: 'محفظة خضراء', description: 'فيها بطاقات',
    location: 'أريانة', date: '2026-08-20', privacyRedacted: false,
  }
  const preview = await request('/api/matches/preview', { method: 'POST', body: JSON.stringify(input) })
  assert.equal(preview.response.status, 200)
  const candidate = preview.body.matches.find((item) => item.case.id === 'found-wallet-ariana')
  assert.equal(candidate.relation, 'possible_match')
  assert.equal(candidate.score, 92)
  assert.deepEqual(candidate.reasons, ['same_category', 'nearby_location', 'close_date', 'very_similar_text'])
  assert.equal(candidate.reasons.includes('similar_photo'), false)

  const created = await request('/api/cases', { method: 'POST', body: JSON.stringify(input) })
  assert.equal(created.response.status, 201)
  assert.equal(created.body.case.status, 'matching')
  assert.ok(created.body.possibleMatches.some((item) => item.case.id === 'found-wallet-ariana'))

  const persisted = await request(`/api/cases/${created.body.case.id}/matches`)
  assert.equal(persisted.response.status, 200)
  assert.ok(persisted.body.matches.some((item) => item.id && item.case.id === 'found-wallet-ariana' && item.engine === 'rules_v1'))

  const resolved = await request(`/api/cases/${created.body.case.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'returned' }) })
  assert.equal(resolved.response.status, 200)
  const retired = await request(`/api/cases/${created.body.case.id}/matches`)
  assert.equal(retired.body.matches.length, 0)
  const refreshedCases = await request('/api/cases')
  const seededFinder = refreshedCases.body.cases.find((item) => item.id === 'found-wallet-ariana')
  assert.equal(seededFinder.matchCount, 1)
  assert.equal(seededFinder.matchScore, 92)
})

test('community reports validate their target and deduplicate repeated submissions', async () => {
  const reportInput = { objectType: 'case', objectId: 'car-key-menzah', reason: 'fake', details: 'The location appears inconsistent.' }
  const created = await request('/api/reports', { method: 'POST', body: JSON.stringify(reportInput) })
  assert.equal(created.response.status, 201)
  assert.equal(created.body.report.status, 'open')
  assert.equal(created.body.duplicate, false)

  const duplicate = await request('/api/reports', { method: 'POST', body: JSON.stringify(reportInput) })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.body.report.id, created.body.report.id)
  assert.equal(duplicate.body.duplicate, true)

  const invalidReason = await request('/api/reports', {
    method: 'POST', body: JSON.stringify({ ...reportInput, reason: 'because' }),
  })
  assert.equal(invalidReason.response.status, 400)
  assert.equal(invalidReason.body.error, 'invalid_report_reason')

  const missingTarget = await request('/api/reports', {
    method: 'POST', body: JSON.stringify({ ...reportInput, objectId: 'missing-case', reason: 'spam' }),
  })
  assert.equal(missingTarget.response.status, 404)
  assert.equal(missingTarget.body.error, 'report_target_not_found')
})

test('document images are never accepted for public publishing', async () => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
  const result = await request('/api/cases', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'found', category: 'documents', title: 'CIN', description: '', location: 'Tunis',
      date: '2026-08-20', imageData: tinyPng, privacyRedacted: false,
    }),
  })
  assert.equal(result.response.status, 400)
  assert.equal(result.body.error, 'document_images_disabled')

  const image = readFileSync(new URL('../public/assets/green-wallet.jpg', import.meta.url)).toString('base64')
  const blocked = await request('/api/cases', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'found', category: 'documents', title: 'Protected document', description: '', location: 'Tunis',
      date: '2026-08-20', imageData: `data:image/jpeg;base64,${image}`, privacyRedacted: true,
    }),
  })
  assert.equal(blocked.response.status, 400)
  assert.equal(blocked.body.error, 'document_images_disabled')
})

test('comments, messages, claims, and settings are persisted privately', async () => {
  const comment = await request('/api/cases/green-wallet-ariana/comments', {
    method: 'POST', body: JSON.stringify({ body: 'I may have seen it near the café.' }),
  })
  assert.equal(comment.response.status, 201)
  const comments = await request('/api/cases/green-wallet-ariana/comments')
  assert.equal(comments.body.comments.at(-1).body, 'I may have seen it near the café.')

  const message = await request('/api/conversations/wallet-chat/messages', {
    method: 'POST', body: JSON.stringify({ body: 'Can we verify one detail?' }),
  })
  assert.equal(message.response.status, 201)
  const messages = await request('/api/conversations/wallet-chat/messages')
  assert.equal(messages.body.messages.at(-1).text, 'Can we verify one detail?')

  const privateProof = 'The keychain has a hidden blue stripe.'
  const claim = await request('/api/cases/car-key-menzah/claims', {
    method: 'POST', body: JSON.stringify({ proof: privateProof }),
  })
  assert.equal(claim.response.status, 201)
  const stored = app.db.prepare('SELECT proof_cipher FROM claims WHERE id = ?').get(claim.body.claim.id)
  assert.ok(stored.proof_cipher)
  assert.equal(stored.proof_cipher.includes(privateProof), false)

  const updated = await request('/api/settings', {
    method: 'PATCH', body: JSON.stringify({ locationPrivate: false, language: 'fr', theme: 'dark' }),
  })
  assert.equal(updated.body.settings.locationPrivate, undefined)
  assert.equal(updated.body.settings.language, 'fr')
})

test('public location accepts an area but rejects address-like numeric detail', async () => {
  const accepted = await request('/api/matches/preview', {
    method: 'POST', body: JSON.stringify({
      kind: 'lost', category: 'keys', title: 'Keys', description: '', location: 'El Menzah, Tunis', date: '2026-08-20',
    }),
  })
  assert.equal(accepted.response.status, 200)

  const blocked = await request('/api/matches/preview', {
    method: 'POST', body: JSON.stringify({
      kind: 'lost', category: 'keys', title: 'Keys', description: '', location: '12 Rue Example, Tunis', date: '2026-08-20',
    }),
  })
  assert.equal(blocked.response.status, 400)
  assert.equal(blocked.body.error, 'public_area_too_precise')
})

test('server rejects a session immediately after its epoch expiry', async () => {
  const sessionId = decodeURIComponent(cookie.split('=')[1])
  app.db.prepare('UPDATE sessions SET expires_at = ?, expires_at_epoch = ? WHERE id = ?').run(
    new Date(Date.now() + 86_400_000).toISOString(), Math.floor(Date.now() / 1000) - 1, sessionId,
  )
  assert.equal((await request('/api/auth/session')).response.status, 401)
  const replacement = await request('/api/auth/demo', { method: 'POST' })
  assert.equal(replacement.response.status, 201)
})

test('unique request paths share a bounded client rate limit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'l9itha-rate-limit-'))
  const limitedApp = createApp({ databasePath: join(directory, 'test.sqlite'), dataDir: directory })
  const limitedServer = createServer(limitedApp.handler)
  await new Promise((resolve) => limitedServer.listen(0, '127.0.0.1', resolve))
  const address = limitedServer.address()
  const origin = `http://127.0.0.1:${address.port}`
  try {
    let lastResponse
    for (let index = 0; index < 31; index += 1) {
      lastResponse = await fetch(`${origin}/unmatched-${index}`, { method: 'POST', headers: { Origin: origin } })
    }
    assert.equal(lastResponse.status, 429)
  } finally {
    await new Promise((resolve) => limitedServer.close(resolve))
    limitedApp.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
