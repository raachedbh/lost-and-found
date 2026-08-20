import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findCandidates, normalizeSearchText, scoreCandidate } from './matching.mjs'

const text = (value) => ({ tn: value, ar: value, fr: value, en: value })
const base = {
  id: 'lost-wallet', kind: 'lost', category: 'wallets', title: 'محفظة خضراء', description: 'فيها بطاقات',
  location: 'أريانة', date: '2026-08-20', status: 'open',
}

test('normalization handles Arabic variants and accents', () => {
  assert.equal(normalizeSearchText('  TÉLÉPHONE، آريانة '), 'telephone اريانه')
})

test('opposite reports produce explainable bounded possible matches', () => {
  const result = scoreCandidate(base, {
    id: 'found-wallet', kind: 'found', category: 'wallets', title: text('محفظة خضراء'),
    description: text('لقينا فيها بطاقات'), location: text('أريانة'), date: '2026-08-20', status: 'open',
  })
  assert.equal(result.relation, 'possible_match')
  assert.equal(result.score, 92)
  assert.deepEqual(result.reasons, ['same_category', 'nearby_location', 'close_date', 'very_similar_text'])
})

test('same-kind reports require meaningful text overlap before being called duplicates', () => {
  const similar = scoreCandidate(base, {
    id: 'duplicate-wallet', kind: 'lost', category: 'wallets', title: text('محفظة خضراء ضايعة'),
    description: text('فيها بطاقات'), location: text('أريانة'), date: '2026-08-20', status: 'open',
  })
  assert.equal(similar.relation, 'possible_duplicate')

  const unrelated = scoreCandidate(base, {
    id: 'different-wallet', kind: 'lost', category: 'wallets', title: text('محفظة بنية'),
    description: text('فارغة'), location: text('أريانة'), date: '2026-08-20', status: 'open',
  })
  assert.equal(unrelated, null)
})

test('resolved cases and unrelated categories are excluded and results are ranked', () => {
  const candidates = [
    { id: 'resolved', kind: 'found', category: 'wallets', title: text('محفظة خضراء'), description: text('بطاقات'), location: text('أريانة'), date: '2026-08-20', status: 'resolved' },
    { id: 'phone', kind: 'found', category: 'phones', title: text('هاتف'), description: text(''), location: text('أريانة'), date: '2026-08-20', status: 'open' },
    { id: 'strong', kind: 'found', category: 'wallets', title: text('محفظة خضراء'), description: text('فيها بطاقات'), location: text('أريانة'), date: '2026-08-20', status: 'open' },
    { id: 'weaker', kind: 'found', category: 'wallets', title: text('محفظة'), description: text(''), location: text('تونس'), date: '2026-08-23', status: 'open' },
  ]
  const results = findCandidates(base, candidates)
  assert.equal(results[0].candidate.id, 'strong')
  assert.equal(results.some((result) => result.candidate.id === 'resolved'), false)
  assert.equal(results.some((result) => result.candidate.id === 'phone'), false)
})
