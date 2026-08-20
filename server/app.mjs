import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import sharp from 'sharp'
import { openDatabase } from './database.mjs'
import { firebaseAuthConfigured, verifyFirebaseIdToken } from './firebase-auth.mjs'
import { findCandidates } from './matching.mjs'

const categories = new Set(['documents', 'phones', 'electronics', 'wallets', 'keys', 'pets', 'bags', 'vehicles', 'clothing', 'other'])
const kinds = new Set(['lost', 'found', 'help'])
const statuses = new Set(['open', 'matching', 'claimed', 'returned', 'resolved'])
const languages = new Set(['tn', 'ar', 'fr', 'en'])
const themes = new Set(['system', 'light', 'dark'])
const reportTargetTypes = new Set(['case', 'comment', 'message', 'profile'])
const reportReasons = new Set(['scam', 'spam', 'fake', 'harassment', 'personal_info', 'stolen', 'inappropriate', 'other'])
const analyticsEvents = new Set([
  'home_search', 'category_selected', 'lost_flow_started', 'found_flow_started', 'image_uploaded',
  'privacy_redaction_completed', 'post_published', 'match_viewed', 'match_contacted', 'claim_started',
  'claim_verified', 'message_sent', 'case_resolved', 'reward_added',
])
const aliases = {
  documents: 'document documents cin id بطاقة تعريف وثائق papiers passeport passport',
  phones: 'phone phones telephone téléphone tel talifoun تلفون تليفون portable smartphone iphone',
  electronics: 'electronics électronique سماعات earbuds laptop ordinateur casque',
  wallets: 'wallet portefeuille محفظة wallets',
  keys: 'keys key clé clés مفتاح مفاتيح mfte7',
  pets: 'pet pets cat dog animal قطوس 9attous gatous كلب حيوان',
  bags: 'bag bags backpack sac حقيبة cartable',
  vehicles: 'car vehicle voiture scooter كرهبة moto',
  clothing: 'clothes clothing vêtements ملابس veste',
  other: 'other autre أخرى',
}
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; font-src 'self'; frame-src https://*.firebaseapp.com https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  if (res.l9ithaProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

function json(res, status, payload, extraHeaders = {}) {
  securityHeaders(res)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders })
  res.end(JSON.stringify(payload))
}

function parseCookies(req) {
  const result = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    try {
      const key = decodeURIComponent(part.slice(0, separator).trim())
      const value = decodeURIComponent(part.slice(separator + 1).trim())
      if (key) result[key] = value
    } catch {
      // Ignore a malformed cookie instead of failing the whole request.
    }
  }
  return result
}

function getSessionUser(db, req) {
  const id = parseCookies(req).l9itha_session
  if (!id) return null
  return db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at_epoch > ?
  `).get(id, Math.floor(Date.now() / 1000)) ?? null
}

function requireUser(db, req, res) {
  const user = getSessionUser(db, req)
  if (!user) json(res, 401, { error: 'authentication_required', message: 'Sign in before changing community data.' })
  return user
}

function cleanText(value, maxLength, { required = false } = {}) {
  if (typeof value !== 'string') {
    if (required) throw new ApiError(400, 'invalid_text')
    return ''
  }
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (required && !clean) throw new ApiError(400, 'required_field')
  if (clean.length > maxLength) throw new ApiError(400, 'field_too_long')
  return clean
}

function normalize(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').toLocaleLowerCase().trim()
}

function localize(value) {
  return { tn: value, ar: value, fr: value, en: value }
}

function timeAgo(createdAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000))
  if (seconds < 90) return { tn: 'توّا', ar: 'الآن', fr: "à l'instant", en: 'just now' }
  if (seconds < 3600) {
    const value = Math.floor(seconds / 60)
    return { tn: `منذ ${value} دقيقة`, ar: `منذ ${value} دقيقة`, fr: `il y a ${value} min`, en: `${value} min ago` }
  }
  if (seconds < 86400) {
    const value = Math.floor(seconds / 3600)
    return { tn: `منذ ${value} س`, ar: `منذ ${value} س`, fr: `il y a ${value} h`, en: `${value}h ago` }
  }
  const value = Math.floor(seconds / 86400)
  return { tn: `منذ ${value} نهار`, ar: `منذ ${value} يوم`, fr: `il y a ${value} j`, en: `${value}d ago` }
}

function parseJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

function mapCase(row) {
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    title: parseJson(row.title_json, localize('')),
    description: parseJson(row.description_json, localize('')),
    location: parseJson(row.location_json, localize('')),
    date: row.event_date,
    timeAgo: timeAgo(row.created_at),
    image: row.image_url ?? undefined,
    status: row.status,
    reward: row.reward ?? undefined,
    matchCount: row.match_count || undefined,
    matchScore: row.match_score ?? undefined,
    source: row.source ?? undefined,
    author: {
      id: row.author_id,
      name: row.author_name,
      initials: row.author_initials,
      verified: Boolean(row.author_verified),
      returns: row.author_returns,
    },
    comments: row.comments_count,
    saved: Boolean(row.is_saved),
    urgent: Boolean(row.urgent),
  }
}

function listCases(db, userId) {
  return db.prepare(`
    SELECT c.*, u.name AS author_name, u.initials AS author_initials, u.verified AS author_verified,
      u.returns_count AS author_returns,
      c.base_comments + (SELECT COUNT(*) FROM comments cm WHERE cm.case_id = c.id) AS comments_count,
      EXISTS(SELECT 1 FROM saved_cases s WHERE s.case_id = c.id AND s.user_id = ?) AS is_saved
    FROM cases c JOIN users u ON u.id = c.author_id
    ORDER BY c.created_at DESC
  `).all(userId ?? '').map(mapCase)
}

function mapCandidate(result, match = {}) {
  return {
    id: match.id,
    relation: result.relation,
    score: result.score,
    reasons: result.reasons,
    engine: result.engine,
    status: match.status ?? 'suggested',
    case: result.candidate,
  }
}

function listCaseMatches(db, caseId, userId) {
  const casesById = new Map(listCases(db, userId).map((item) => [item.id, item]))
  return db.prepare(`
    SELECT * FROM matches
    WHERE (case_a_id = ? OR case_b_id = ?) AND status <> 'dismissed'
    ORDER BY score DESC, created_at DESC
  `).all(caseId, caseId).flatMap((row) => {
    const candidate = casesById.get(row.case_a_id === caseId ? row.case_b_id : row.case_a_id)
    if (!candidate) return []
    return [mapCandidate({
      relation: row.relation,
      score: row.score,
      reasons: parseJson(row.reasons_json, []),
      engine: row.engine,
      candidate,
    }, row)]
  })
}

function refreshMatchSummary(db, caseId) {
  const summary = db.prepare(`
    SELECT COUNT(*) AS count, MAX(score) AS score FROM matches
    WHERE relation = 'possible_match' AND status = 'suggested' AND (case_a_id = ? OR case_b_id = ?)
  `).get(caseId, caseId)
  db.prepare(`
    UPDATE cases SET
      match_count = ?,
      match_score = ?,
      status = CASE
        WHEN status = 'open' AND ? > 0 THEN 'matching'
        WHEN status = 'matching' AND ? = 0 THEN 'open'
        ELSE status
      END
    WHERE id = ?
  `).run(summary.count, summary.score ?? null, summary.count, summary.count, caseId)
}

function persistCandidates(db, input, candidates) {
  const persisted = []
  for (const candidate of candidates) {
    const [caseA, caseB] = [input.id, candidate.candidate.id].sort()
    const matchId = randomUUID()
    const createdAt = new Date().toISOString()
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO matches (id, case_a_id, case_b_id, relation, score, reasons_json, engine, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?)
    `).run(matchId, caseA, caseB, candidate.relation, candidate.score, JSON.stringify(candidate.reasons), candidate.engine, createdAt)
    const row = inserted.changes
      ? { id: matchId, status: 'suggested' }
      : db.prepare('SELECT id, status FROM matches WHERE case_a_id = ? AND case_b_id = ? AND relation = ?').get(caseA, caseB, candidate.relation)
    persisted.push(mapCandidate(candidate, row))

    if (candidate.relation === 'possible_match') {
      refreshMatchSummary(db, input.id)
      refreshMatchSummary(db, candidate.candidate.id)
      if (inserted.changes) {
        const owners = db.prepare('SELECT id, author_id FROM cases WHERE id IN (?, ?)').all(input.id, candidate.candidate.id)
        for (const ownerCase of owners) {
          db.prepare(`
            INSERT INTO notifications (id, user_id, type, title, body, priority, case_id, created_at)
            VALUES (?, ?, 'match', ?, ?, 'critical', ?, ?)
          `).run(
            randomUUID(), ownerCase.author_id, 'يمكن لقينا حاجتك',
            `${input.title} · ${input.location}`, ownerCase.id, createdAt,
          )
        }
      }
    }
  }
  return persisted
}

function validateMatchInput(body) {
  if (!kinds.has(body.kind) || body.kind === 'help') throw new ApiError(400, 'invalid_kind')
  if (!categories.has(body.category)) throw new ApiError(400, 'invalid_category')
  const title = cleanText(body.title, 120, { required: true })
  const description = cleanText(body.description, 1200)
  const location = cleanText(body.location, 100, { required: true })
  if (/\d/.test(location)) throw new ApiError(400, 'public_area_too_precise')
  const date = cleanText(body.date, 10, { required: true })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'invalid_date')
  return { kind: body.kind, category: body.category, title, description, location, date, status: 'open' }
}

function reportTargetExists(db, objectType, objectId, userId) {
  if (objectType === 'message') {
    return Boolean(db.prepare(`
      SELECT 1 FROM messages m
      JOIN conversations cv ON cv.id = m.conversation_id
      WHERE m.id = ? AND (cv.owner_user_id = ? OR cv.participant_user_id = ?)
    `).get(objectId, userId, userId))
  }
  const tableByType = { case: 'cases', comment: 'comments', message: 'messages', profile: 'users' }
  return Boolean(db.prepare(`SELECT 1 FROM ${tableByType[objectType]} WHERE id = ?`).get(objectId))
}

async function readBody(req, limit = 9 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new ApiError(413, 'payload_too_large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ApiError(400, 'invalid_json') }
}

async function saveImage(dataUrl, uploadsDir) {
  if (!dataUrl) return null
  if (typeof dataUrl !== 'string') throw new ApiError(400, 'invalid_image')
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) throw new ApiError(400, 'unsupported_image')
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw new ApiError(400, 'invalid_image_size')
  const signatureOk = match[1] === 'png'
    ? buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : match[1] === 'jpeg'
      ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP'
  if (!signatureOk) throw new ApiError(400, 'invalid_image_signature')

  let processed
  try {
    processed = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true })
  } catch {
    throw new ApiError(400, 'invalid_image_content')
  }

  mkdirSync(uploadsDir, { recursive: true })
  const name = `${randomUUID()}.webp`
  writeFileSync(join(uploadsDir, name), processed.data, { mode: 0o600 })
  return `/uploads/${name}`
}

function getEncryptionKey(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const keyPath = join(dataDir, 'private-data.key')
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600 })
  return createHash('sha256').update(readFileSync(keyPath)).digest()
}

function sealPrivateText(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

function mutationOriginAllowed(req, production) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    if (!production && ['127.0.0.1', 'localhost'].includes(parsed.hostname)) return true
    const configured = process.env.L9ITHA_ALLOWED_ORIGIN
    return configured ? origin === configured : parsed.host === req.headers.host
  } catch { return false }
}

function createRateLimiter() {
  const buckets = new Map()
  let requestCount = 0
  return (req, limit) => {
    const now = Date.now()
    requestCount += 1
    if (requestCount % 100 === 0) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key)
      }
    }
    const forwarded = process.env.L9ITHA_TRUST_PROXY === '1' ? req.headers['x-forwarded-for'] : ''
    const ip = String(forwarded || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
    const key = `${ip}:${req.method}:${limit}`
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      if (!current && buckets.size >= 10_000) buckets.delete(buckets.keys().next().value)
      buckets.set(key, { count: 1, resetAt: now + 60_000 })
      return true
    }
    current.count += 1
    return current.count <= limit
  }
}

function setSessionCookie(res, sessionId, maxAgeSeconds, production) {
  const secure = production || process.env.L9ITHA_COOKIE_SECURE === '1' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `l9itha_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`)
}

function createSession(db, userId) {
  db.prepare('DELETE FROM sessions WHERE expires_at_epoch <= ?').run(Math.floor(Date.now() / 1000))
  const sessionId = randomBytes(32).toString('base64url')
  const maxAge = 60 * 60 * 24 * 30
  const expiresAt = new Date(Date.now() + maxAge * 1000)
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, expires_at_epoch)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, userId, expiresAt.toISOString(), Math.floor(expiresAt.getTime() / 1000))
  return { sessionId, maxAge }
}

function initialsFor(name) {
  const parts = name.split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : name.slice(0, 2)).toLocaleUpperCase()
}

function upsertFirebaseUser(db, token) {
  const id = `firebase:${token.uid}`
  const fallbackName = typeof token.email === 'string' ? token.email.split('@')[0] : 'L9itha member'
  const name = cleanText(token.name || fallbackName, 80, { required: true })
  const city = cleanText(token.city, 80)
  db.prepare(`
    INSERT INTO users (id, name, initials, verified, returns_count, city)
    VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, initials = excluded.initials,
      verified = excluded.verified, city = CASE WHEN excluded.city <> '' THEN excluded.city ELSE users.city END
  `).run(id, name, initialsFor(name), Number(Boolean(token.email_verified)), city)
  db.prepare('INSERT OR IGNORE INTO settings (user_id) VALUES (?)').run(id)
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
}

function authorizedConversation(db, conversationId, userId) {
  return db.prepare(`
    SELECT * FROM conversations
    WHERE id = ? AND (owner_user_id = ? OR participant_user_id = ?)
  `).get(conversationId, userId, userId)
}

function mimeFor(path) {
  return mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

class ApiError extends Error {
  constructor(status, code, message = code) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function createApp(options = {}) {
  const production = Boolean(options.production)
  const tokenVerifier = options.verifyFirebaseToken ?? verifyFirebaseIdToken
  const dataDir = resolve(options.dataDir ?? '.data')
  const uploadsDir = resolve(options.uploadsDir ?? join(dataDir, 'uploads'))
  const distDir = resolve(options.distDir ?? 'dist')
  const db = openDatabase(options.databasePath ?? join(dataDir, 'l9itha.sqlite'))
  const encryptionKey = getEncryptionKey(dataDir)
  const rateLimit = createRateLimiter()

  async function handler(req, res) {
    try {
      res.l9ithaProduction = production
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
      const path = url.pathname
      const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      const requestLimit = isMutation ? 30 : 180
      if (!rateLimit(req, path.includes('/messages') || path.includes('/claims') ? 12 : requestLimit)) {
        return json(res, 429, { error: 'rate_limited', message: 'Please wait before trying again.' }, { 'Retry-After': '60' })
      }
      if (isMutation && !mutationOriginAllowed(req, production)) return json(res, 403, { error: 'invalid_origin' })
      if (req.method === 'OPTIONS') return json(res, 204, {})

      if (req.method === 'GET' && path === '/api/health') {
        const database = db.prepare('SELECT 1 AS ok').get().ok === 1
        return json(res, 200, { ok: true, database, firebaseAuth: Boolean(options.verifyFirebaseToken || firebaseAuthConfigured()), uptime: Math.floor(process.uptime()), version: 3 })
      }

      if (req.method === 'POST' && path === '/api/auth/demo') {
        if (production) throw new ApiError(404, 'not_found')
        const existingUser = getSessionUser(db, req)
        if (existingUser) return json(res, 200, { user: mapUser(existingUser) })
        const { sessionId, maxAge } = createSession(db, 'demo-user')
        setSessionCookie(res, sessionId, maxAge, production)
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get('demo-user')
        return json(res, 201, { user: mapUser(user) })
      }

      if (req.method === 'POST' && path === '/api/auth/firebase') {
        if (!options.verifyFirebaseToken && !firebaseAuthConfigured()) throw new ApiError(503, 'auth_not_configured')
        const body = await readBody(req, 24 * 1024)
        const idToken = cleanText(body.idToken, 16 * 1024, { required: true })
        let decoded
        try {
          decoded = await tokenVerifier(idToken)
        } catch {
          throw new ApiError(401, 'invalid_identity_token')
        }
        if (!decoded?.uid) throw new ApiError(401, 'invalid_identity_token')
        const user = upsertFirebaseUser(db, decoded)
        const previousSessionId = parseCookies(req).l9itha_session
        if (previousSessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(previousSessionId)
        const { sessionId, maxAge } = createSession(db, user.id)
        setSessionCookie(res, sessionId, maxAge, production)
        return json(res, 201, { user: mapUser(user) })
      }

      if (req.method === 'GET' && path === '/api/auth/session') {
        const user = getSessionUser(db, req)
        return user ? json(res, 200, { user: mapUser(user) }) : json(res, 401, { error: 'authentication_required' })
      }

      if (req.method === 'DELETE' && path === '/api/auth/session') {
        const sessionId = parseCookies(req).l9itha_session
        if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
        setSessionCookie(res, '', 0, production)
        return json(res, 204, {})
      }

      if (req.method === 'GET' && path === '/api/cases') {
        const user = getSessionUser(db, req)
        const query = normalize(url.searchParams.get('q') ?? '')
        const kind = url.searchParams.get('kind')
        const category = url.searchParams.get('category')
        const saved = url.searchParams.get('saved') === 'true'
        let items = listCases(db, user?.id)
        if (kind && kinds.has(kind)) items = items.filter((item) => item.kind === kind)
        if (category && categories.has(category)) items = items.filter((item) => item.category === category)
        if (saved) items = items.filter((item) => item.saved)
        if (query) items = items.filter((item) => normalize([
          ...Object.values(item.title), ...Object.values(item.description), ...Object.values(item.location), aliases[item.category],
        ].join(' ')).includes(query))
        return json(res, 200, { cases: items, total: items.length })
      }

      if (req.method === 'POST' && path === '/api/matches/preview') {
        const user = requireUser(db, req, res)
        if (!user) return
        const input = validateMatchInput(await readBody(req, 32 * 1024))
        const matches = findCandidates(input, listCases(db, user.id)).map((candidate) => mapCandidate(candidate))
        return json(res, 200, { matches })
      }

      const caseMatches = /^\/api\/cases\/([^/]+)\/matches$/.exec(path)
      if (req.method === 'GET' && caseMatches) {
        const user = getSessionUser(db, req)
        const caseId = decodeURIComponent(caseMatches[1])
        if (!db.prepare('SELECT 1 FROM cases WHERE id = ?').get(caseId)) throw new ApiError(404, 'case_not_found')
        return json(res, 200, { matches: listCaseMatches(db, caseId, user?.id) })
      }

      if (req.method === 'POST' && path === '/api/cases') {
        const user = requireUser(db, req, res)
        if (!user) return
        const body = await readBody(req)
        const input = validateMatchInput(body)
        const { title, description, location, date } = input
        if (body.category === 'documents' && body.imageData) throw new ApiError(400, 'document_images_disabled')
        const image = await saveImage(body.imageData, uploadsDir)
        const reward = body.reward == null || body.reward === '' ? null : Number(body.reward)
        if (reward != null && (!Number.isFinite(reward) || reward < 0 || reward > 100000)) throw new ApiError(400, 'invalid_reward')
        const id = randomUUID()
        const createdAt = new Date().toISOString()
        db.prepare(`
          INSERT INTO cases (id, kind, category, title_json, description_json, location_json, event_date, created_at, image_url, status, reward, source, author_id, privacy_redacted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, 'community', ?, ?)
        `).run(id, body.kind, body.category, JSON.stringify(localize(title)), JSON.stringify(localize(description)), JSON.stringify(localize(location)), date, createdAt, image, reward, user.id, Number(body.privacyRedacted === true))
        const candidates = findCandidates({ ...input, id }, listCases(db, user.id))
        const possibleMatches = persistCandidates(db, { ...input, id }, candidates)
        const item = listCases(db, user.id).find((candidate) => candidate.id === id)
        return json(res, 201, { case: item, possibleMatches })
      }

      if (req.method === 'POST' && path === '/api/reports') {
        const user = requireUser(db, req, res)
        if (!user) return
        const body = await readBody(req, 24 * 1024)
        if (!reportTargetTypes.has(body.objectType)) throw new ApiError(400, 'invalid_report_target')
        if (!reportReasons.has(body.reason)) throw new ApiError(400, 'invalid_report_reason')
        const objectId = cleanText(body.objectId, 128, { required: true })
        const details = cleanText(body.details, 1000)
        if (!reportTargetExists(db, body.objectType, objectId, user.id)) throw new ApiError(404, 'report_target_not_found')
        const existing = db.prepare(`
          SELECT id, object_type, object_id, reason, details, status, created_at FROM moderation_reports
          WHERE reporter_user_id = ? AND object_type = ? AND object_id = ? AND reason = ?
        `).get(user.id, body.objectType, objectId, body.reason)
        if (existing) return json(res, 200, { report: existing, duplicate: true })
        const id = randomUUID()
        const createdAt = new Date().toISOString()
        db.prepare(`
          INSERT INTO moderation_reports (id, reporter_user_id, object_type, object_id, reason, details, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
        `).run(id, user.id, body.objectType, objectId, body.reason, details, createdAt)
        return json(res, 201, { report: { id, object_type: body.objectType, object_id: objectId, reason: body.reason, details, status: 'open', created_at: createdAt }, duplicate: false })
      }

      const saveMatch = /^\/api\/cases\/([^/]+)\/saved$/.exec(path)
      if (req.method === 'PUT' && saveMatch) {
        const user = requireUser(db, req, res)
        if (!user) return
        const caseId = decodeURIComponent(saveMatch[1])
        const body = await readBody(req, 8 * 1024)
        if (body.saved) db.prepare('INSERT OR IGNORE INTO saved_cases (user_id, case_id, created_at) VALUES (?, ?, ?)').run(user.id, caseId, new Date().toISOString())
        else db.prepare('DELETE FROM saved_cases WHERE user_id = ? AND case_id = ?').run(user.id, caseId)
        return json(res, 200, { saved: Boolean(body.saved) })
      }

      const statusMatch = /^\/api\/cases\/([^/]+)\/status$/.exec(path)
      if (req.method === 'PATCH' && statusMatch) {
        const user = requireUser(db, req, res)
        if (!user) return
        const body = await readBody(req, 8 * 1024)
        if (!statuses.has(body.status)) throw new ApiError(400, 'invalid_status')
        const caseId = decodeURIComponent(statusMatch[1])
        const result = db.prepare('UPDATE cases SET status = ? WHERE id = ? AND author_id = ?').run(body.status, caseId, user.id)
        if (!result.changes) throw new ApiError(404, 'case_not_found')
        if (['returned', 'resolved'].includes(body.status)) {
          const connected = db.prepare(`
            SELECT case_a_id, case_b_id FROM matches
            WHERE status = 'suggested' AND (case_a_id = ? OR case_b_id = ?)
          `).all(caseId, caseId)
          db.prepare(`UPDATE matches SET status = 'dismissed' WHERE status = 'suggested' AND (case_a_id = ? OR case_b_id = ?)`).run(caseId, caseId)
          refreshMatchSummary(db, caseId)
          for (const row of connected) refreshMatchSummary(db, row.case_a_id === caseId ? row.case_b_id : row.case_a_id)
        }
        return json(res, 200, { status: body.status })
      }

      const commentsMatch = /^\/api\/cases\/([^/]+)\/comments$/.exec(path)
      if (req.method === 'GET' && commentsMatch) {
        const rows = db.prepare(`
          SELECT c.id, c.body, c.created_at, u.name, u.initials, u.verified
          FROM comments c JOIN users u ON u.id = c.user_id WHERE c.case_id = ? ORDER BY c.created_at ASC
        `).all(decodeURIComponent(commentsMatch[1]))
        return json(res, 200, { comments: rows.map((row) => ({ ...row, verified: Boolean(row.verified) })) })
      }
      if (req.method === 'POST' && commentsMatch) {
        const user = requireUser(db, req, res)
        if (!user) return
        const body = await readBody(req, 16 * 1024)
        const text = cleanText(body.body, 800, { required: true })
        const id = randomUUID()
        const createdAt = new Date().toISOString()
        db.prepare('INSERT INTO comments (id, case_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, decodeURIComponent(commentsMatch[1]), user.id, text, createdAt)
        return json(res, 201, { comment: { id, body: text, name: user.name, initials: user.initials, verified: Boolean(user.verified), created_at: createdAt } })
      }

      const claimMatch = /^\/api\/cases\/([^/]+)\/claims$/.exec(path)
      if (req.method === 'POST' && claimMatch) {
        const user = requireUser(db, req, res)
        if (!user) return
        const proof = cleanText((await readBody(req, 16 * 1024)).proof, 1200, { required: true })
        const caseId = decodeURIComponent(claimMatch[1])
        if (!db.prepare('SELECT 1 FROM cases WHERE id = ? AND kind = ?').get(caseId, 'found')) throw new ApiError(404, 'found_case_not_found')
        const id = randomUUID()
        const createdAt = new Date().toISOString()
        db.prepare('INSERT INTO claims (id, case_id, user_id, proof_cipher, created_at) VALUES (?, ?, ?, ?, ?)').run(id, caseId, user.id, sealPrivateText(proof, encryptionKey), createdAt)
        return json(res, 201, { claim: { id, status: 'pending', createdAt } })
      }

      if (req.method === 'GET' && path === '/api/conversations') {
        const user = requireUser(db, req, res)
        if (!user) return
        const rows = db.prepare(`
          SELECT cv.*, c.title_json, c.location_json,
            (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
          FROM conversations cv JOIN cases c ON c.id = cv.case_id
          WHERE cv.owner_user_id = ? OR cv.participant_user_id = ?
          ORDER BY cv.updated_at DESC
        `).all(user.id, user.id)
        return json(res, 200, { conversations: rows.map((row) => ({ ...row, title: parseJson(row.title_json, localize('')), location: parseJson(row.location_json, localize('')) })) })
      }

      if (req.method === 'POST' && path === '/api/conversations') {
        const user = requireUser(db, req, res)
        if (!user) return
        const body = await readBody(req, 8 * 1024)
        const caseId = cleanText(body.caseId, 128, { required: true })
        const item = db.prepare(`
          SELECT c.id, c.author_id, u.name, u.initials
          FROM cases c JOIN users u ON u.id = c.author_id WHERE c.id = ?
        `).get(caseId)
        if (!item || item.author_id === user.id) throw new ApiError(404, 'case_not_found')
        const existing = db.prepare(`
          SELECT id FROM conversations
          WHERE case_id = ? AND owner_user_id = ? AND participant_user_id = ?
        `).get(caseId, item.author_id, user.id)
        if (existing) return json(res, 200, { conversation: { id: existing.id } })
        const id = randomUUID()
        db.prepare(`
          INSERT INTO conversations (
            id, case_id, owner_user_id, participant_user_id, participant_name, participant_initials, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, caseId, item.author_id, user.id, item.name, item.initials, new Date().toISOString())
        return json(res, 201, { conversation: { id } })
      }

      const messagesMatch = /^\/api\/conversations\/([^/]+)\/messages$/.exec(path)
      if (req.method === 'GET' && messagesMatch) {
        const user = requireUser(db, req, res)
        if (!user) return
        const conversationId = decodeURIComponent(messagesMatch[1])
        if (!authorizedConversation(db, conversationId, user.id)) throw new ApiError(404, 'conversation_not_found')
        const rows = db.prepare('SELECT id, user_id, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId)
        return json(res, 200, { messages: rows.map((row) => ({ id: row.id, from: row.user_id === user.id ? 'me' : 'them', text: row.body, time: row.created_at })) })
      }
      if (req.method === 'POST' && messagesMatch) {
        const user = requireUser(db, req, res)
        if (!user) return
        const body = cleanText((await readBody(req, 16 * 1024)).body, 2000, { required: true })
        const id = randomUUID()
        const conversationId = decodeURIComponent(messagesMatch[1])
        if (!authorizedConversation(db, conversationId, user.id)) throw new ApiError(404, 'conversation_not_found')
        const createdAt = new Date().toISOString()
        db.prepare('INSERT INTO messages (id, conversation_id, user_id, from_me, body, created_at) VALUES (?, ?, ?, 0, ?, ?)').run(id, conversationId, user.id, body, createdAt)
        db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversationId)
        return json(res, 201, { message: { id, from: 'me', text: body, time: createdAt } })
      }

      if (req.method === 'GET' && path === '/api/notifications') {
        const user = requireUser(db, req, res)
        if (!user) return
        const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id)
        return json(res, 200, { notifications: rows.map((row) => ({ ...row, read: Boolean(row.is_read) })) })
      }

      if (path === '/api/settings' && req.method === 'GET') {
        const user = requireUser(db, req, res)
        if (!user) return
        const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(user.id)
        return json(res, 200, { settings: mapSettings(row) })
      }
      if (path === '/api/settings' && req.method === 'PATCH') {
        const user = requireUser(db, req, res)
        if (!user) return
        const current = mapSettings(db.prepare('SELECT * FROM settings WHERE user_id = ?').get(user.id))
        const body = await readBody(req, 16 * 1024)
        const next = {
          verifiedOnly: typeof body.verifiedOnly === 'boolean' ? body.verifiedOnly : current.verifiedOnly,
          notifications: typeof body.notifications === 'boolean' ? body.notifications : current.notifications,
          language: languages.has(body.language) ? body.language : current.language,
          theme: themes.has(body.theme) ? body.theme : current.theme,
        }
        db.prepare(`UPDATE settings SET verified_only = ?, notifications = ?, language = ?, theme = ? WHERE user_id = ?`).run(Number(next.verifiedOnly), Number(next.notifications), next.language, next.theme, user.id)
        return json(res, 200, { settings: next })
      }

      if (path === '/api/analytics' && req.method === 'POST') {
        const user = getSessionUser(db, req)
        const body = await readBody(req, 16 * 1024)
        if (!analyticsEvents.has(body.event)) throw new ApiError(400, 'invalid_event')
        const metadata = Object.fromEntries(Object.entries(body.metadata ?? {}).filter(([key, value]) => ['page', 'category', 'kind', 'status', 'source'].includes(key) && typeof value === 'string' && value.length <= 80))
        db.prepare('INSERT INTO analytics_events (id, user_id, event_name, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), user?.id ?? null, body.event, JSON.stringify(metadata), new Date().toISOString())
        return json(res, 202, { accepted: true })
      }

      if (req.method === 'GET' && path.startsWith('/uploads/')) {
        const name = basename(path)
        const filePath = join(uploadsDir, name)
        if (!name || !existsSync(filePath) || !statSync(filePath).isFile()) throw new ApiError(404, 'image_not_found')
        securityHeaders(res)
        res.writeHead(200, { 'Content-Type': mimeFor(filePath), 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Length': statSync(filePath).size })
        return res.end(await readFile(filePath))
      }

      if (production && req.method === 'GET') {
        const requested = path === '/' ? 'index.html' : path.slice(1)
        let filePath = resolve(distDir, requested)
        if (!filePath.startsWith(`${distDir}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) filePath = join(distDir, 'index.html')
        if (!existsSync(filePath)) throw new ApiError(503, 'build_missing', 'Run npm run build before starting production.')
        const body = await readFile(filePath)
        securityHeaders(res)
        const immutable = filePath.includes(`${join('dist', 'assets')}`)
        res.writeHead(200, { 'Content-Type': mimeFor(filePath), 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'Content-Length': body.length })
        return res.end(body)
      }

      return json(res, 404, { error: 'not_found' })
    } catch (error) {
      if (error instanceof ApiError) return json(res, error.status, { error: error.code, message: error.message })
      console.error(error)
      return json(res, 500, { error: 'internal_error', message: 'The server could not complete this request.' })
    }
  }

  return { handler, db, close: () => db.close() }
}

function mapUser(user) {
  return { id: user.id, name: user.name, initials: user.initials, verified: Boolean(user.verified), returns: user.returns_count, city: user.city }
}

function mapSettings(row) {
  return {
    verifiedOnly: Boolean(row.verified_only),
    notifications: Boolean(row.notifications),
    language: row.language,
    theme: row.theme,
  }
}
