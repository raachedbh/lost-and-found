import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { demoUser, seedCases } from './seed.mjs'

const localized = (value) => JSON.stringify(value)

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      returns_count INTEGER NOT NULL DEFAULT 0,
      city TEXT NOT NULL DEFAULT '',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      expires_at_epoch INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('lost','found','help')),
      category TEXT NOT NULL,
      title_json TEXT NOT NULL,
      description_json TEXT NOT NULL,
      location_json TEXT NOT NULL,
      event_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matching','claimed','returned','resolved')),
      reward REAL,
      match_count INTEGER NOT NULL DEFAULT 0,
      match_score INTEGER,
      source TEXT CHECK (source IN ('community','facebook')),
      author_id TEXT NOT NULL REFERENCES users(id),
      base_comments INTEGER NOT NULL DEFAULT 0,
      urgent INTEGER NOT NULL DEFAULT 0,
      privacy_redacted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS cases_created_idx ON cases(created_at DESC);
    CREATE INDEX IF NOT EXISTS cases_category_idx ON cases(category, kind, status);
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS comments_case_idx ON comments(case_id, created_at);
    CREATE TABLE IF NOT EXISTS saved_cases (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, case_id)
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      participant_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      participant_name TEXT NOT NULL,
      participant_initials TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      from_me INTEGER NOT NULL DEFAULT 0,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      proof_cipher TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('critical','high','normal','low')),
      case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      location_private INTEGER NOT NULL DEFAULT 1,
      verified_only INTEGER NOT NULL DEFAULT 0,
      notifications INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'tn',
      theme TEXT NOT NULL DEFAULT 'system'
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_name TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      case_a_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      case_b_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      relation TEXT NOT NULL CHECK (relation IN ('possible_match','possible_duplicate')),
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      reasons_json TEXT NOT NULL,
      engine TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','dismissed','confirmed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (case_a_id <> case_b_id),
      UNIQUE (case_a_id, case_b_id, relation)
    );
    CREATE INDEX IF NOT EXISTS matches_case_a_idx ON matches(case_a_id, status, score DESC);
    CREATE INDEX IF NOT EXISTS matches_case_b_idx ON matches(case_b_id, status, score DESC);
    CREATE TABLE IF NOT EXISTS moderation_reports (
      id TEXT PRIMARY KEY,
      reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      object_type TEXT NOT NULL CHECK (object_type IN ('case','comment','message','profile')),
      object_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('scam','spam','fake','harassment','personal_info','stolen','inappropriate','other')),
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','actioned','dismissed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (reporter_user_id, object_type, object_id, reason)
    );
    CREATE INDEX IF NOT EXISTS moderation_reports_status_idx ON moderation_reports(status, created_at DESC);
  `)
  migrateDatabase(db)
  seedDatabase(db)
  return db
}

function migrateDatabase(db) {
  const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name))
  if (!sessionColumns.has('expires_at_epoch')) db.exec('ALTER TABLE sessions ADD COLUMN expires_at_epoch INTEGER')
  db.prepare(`
    UPDATE sessions
    SET expires_at_epoch = CAST(strftime('%s', expires_at) AS INTEGER)
    WHERE expires_at_epoch IS NULL
  `).run()

  const conversationColumns = new Set(db.prepare('PRAGMA table_info(conversations)').all().map((column) => column.name))
  if (!conversationColumns.has('owner_user_id')) db.exec('ALTER TABLE conversations ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE')
  if (!conversationColumns.has('participant_user_id')) db.exec('ALTER TABLE conversations ADD COLUMN participant_user_id TEXT REFERENCES users(id) ON DELETE CASCADE')
  db.exec(`
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at_epoch);
    CREATE INDEX IF NOT EXISTS conversations_owner_idx ON conversations(owner_user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS conversations_participant_idx ON conversations(participant_user_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_idx
      ON conversations(case_id, owner_user_id, participant_user_id);
  `)
}

function seedDatabase(db) {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, initials, verified, returns_count, city)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertUser.run(demoUser.id, demoUser.name, demoUser.initials, Number(demoUser.verified), demoUser.returns, demoUser.city)
  for (const item of seedCases) {
    insertUser.run(item.author.id, item.author.name, item.author.initials, Number(item.author.verified), item.author.returns, '')
  }

  const insertCase = db.prepare(`
    INSERT OR IGNORE INTO cases (
      id, kind, category, title_json, description_json, location_json, event_date, created_at,
      image_url, status, reward, match_count, match_score, source, author_id, base_comments, privacy_redacted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  seedCases.forEach((item, index) => {
    const createdAt = new Date(Date.now() - (index * 36 + 22) * 60_000).toISOString()
    insertCase.run(
      item.id, item.kind, item.category, localized(item.title), localized(item.description), localized(item.location),
      item.date, createdAt, item.image ?? null, item.status, item.reward ?? null, item.matchCount ?? 0,
      item.matchScore ?? null, item.source ?? 'community', item.author.id, item.comments ?? 0, 0,
    )
  })

  // Keep the bundled demo internally consistent when an older local database is reopened.
  db.prepare(`UPDATE cases SET status = 'open', match_count = 0, match_score = NULL WHERE id = 'car-key-menzah'`).run()
  db.prepare(`UPDATE cases SET status = 'open', match_count = 0, match_score = NULL WHERE id = 'earbuds-lac'`).run()
  db.prepare(`UPDATE cases SET status = 'matching', match_count = 1, match_score = 92 WHERE id IN ('green-wallet-ariana', 'found-wallet-ariana')`).run()
  db.prepare(`
    INSERT OR IGNORE INTO matches (id, case_a_id, case_b_id, relation, score, reasons_json, engine, status, created_at)
    VALUES ('seed-wallet-match', 'found-wallet-ariana', 'green-wallet-ariana', 'possible_match', 92, ?, 'rules_v1', 'suggested', ?)
  `).run(JSON.stringify(['same_category', 'nearby_location', 'close_date', 'very_similar_text']), new Date(Date.now() - 2 * 60_000).toISOString())

  db.prepare(`INSERT OR IGNORE INTO settings (user_id) VALUES (?)`).run(demoUser.id)
  db.prepare(`INSERT OR IGNORE INTO saved_cases (user_id, case_id) VALUES (?, ?)`).run(demoUser.id, 'green-wallet-ariana')
  db.prepare(`
    INSERT OR IGNORE INTO conversations (
      id, case_id, owner_user_id, participant_user_id, participant_name, participant_initials, updated_at
    ) VALUES ('wallet-chat', 'green-wallet-ariana', 'demo-user', 'sarra', 'Sarra M.', 'SM', ?)
  `).run(new Date(Date.now() - 4 * 60_000).toISOString())
  db.prepare(`
    UPDATE conversations
    SET owner_user_id = 'demo-user', participant_user_id = 'sarra'
    WHERE id = 'wallet-chat' AND (owner_user_id IS NULL OR participant_user_id IS NULL)
  `).run()
  const insertMessage = db.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, user_id, from_me, body, created_at)
    VALUES (?, 'wallet-chat', ?, ?, ?, ?)
  `)
  insertMessage.run('m1', 'sarra', 0, 'عسلامة، لقيت محفظة تشبه للتصويرة متاعك.', new Date(Date.now() - 6 * 60_000).toISOString())
  insertMessage.run('m2', demoUser.id, 1, 'يعطيك الصحة! ننجم نقلك على تفصيل بالخاص باش نتثبتو.', new Date(Date.now() - 4 * 60_000).toISOString())

  const insertNotification = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, user_id, type, title, body, priority, case_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertNotification.run('n-match', demoUser.id, 'match', 'يمكن لقينا حاجتك', 'محفظة خضراء · أريانة', 'critical', 'green-wallet-ariana', new Date(Date.now() - 2 * 60_000).toISOString())
  insertNotification.run('n-claim', demoUser.id, 'claim', 'شخص قال إلي الحاجة متاعو', 'مفتاح كرهبة · المنزه', 'high', 'car-key-menzah', new Date(Date.now() - 3 * 60_000).toISOString())
  insertNotification.run('n-comment', demoUser.id, 'comment', 'تعليق جديد على حالتك', 'Sarra M. · 10:16', 'normal', 'green-wallet-ariana', new Date(Date.now() - 4 * 60_000).toISOString())
  db.prepare(`UPDATE notifications SET case_id = 'found-wallet-ariana' WHERE id = 'n-match'`).run()
}
