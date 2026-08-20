const activeStatuses = new Set(['open', 'matching', 'claimed'])

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064b-\u065f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value) {
  return new Set(normalizeSearchText(value).split(' ').filter((token) => token.length > 1))
}

function similarity(left, right) {
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  if (!leftTokens.size || !rightTokens.size) return 0
  let intersection = 0
  leftTokens.forEach((token) => { if (rightTokens.has(token)) intersection += 1 })
  return intersection / new Set([...leftTokens, ...rightTokens]).size
}

function localizedSimilarity(input, value) {
  if (!value || typeof value !== 'object') return similarity(input, value)
  return Math.max(0, ...Object.values(value).map((candidate) => similarity(input, candidate)))
}

function dayDistance(left, right) {
  const leftTime = Date.parse(`${left}T00:00:00Z`)
  const rightTime = Date.parse(`${right}T00:00:00Z`)
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null
  return Math.abs(leftTime - rightTime) / 86_400_000
}

export function scoreCandidate(input, candidate) {
  if (!candidate || candidate.id === input.id || !activeStatuses.has(candidate.status)) return null
  if (candidate.category !== input.category || !['lost', 'found'].includes(input.kind) || !['lost', 'found'].includes(candidate.kind)) return null

  const relation = candidate.kind === input.kind ? 'possible_duplicate' : 'possible_match'
  const titleSimilarity = localizedSimilarity(input.title, candidate.title)
  const descriptionSimilarity = localizedSimilarity(input.description, candidate.description)
  const locationSimilarity = localizedSimilarity(input.location, candidate.location)
  const days = dayDistance(input.date, candidate.date)

  // A generic category noun (for example, “wallet”) is not enough to call two
  // reports duplicates. Same-kind suggestions need a majority token overlap in
  // either the title or the description.
  if (relation === 'possible_duplicate' && Math.max(titleSimilarity, descriptionSimilarity) < 0.5) return null

  let score = 35
  const reasons = ['same_category']

  if (locationSimilarity >= 0.5) {
    score += 25
    reasons.push('nearby_location')
  } else if (locationSimilarity > 0) {
    score += 14
    reasons.push('related_location')
  }

  if (days != null && days <= 1) {
    score += 20
    reasons.push('close_date')
  } else if (days != null && days <= 3) {
    score += 14
    reasons.push('nearby_date')
  } else if (days != null && days <= 7) {
    score += 8
    reasons.push('same_week')
  }

  const textSimilarity = Math.max(titleSimilarity, descriptionSimilarity)
  if (textSimilarity >= 0.6) {
    score += 20
    reasons.push('very_similar_text')
  } else if (textSimilarity >= 0.25) {
    score += 12
    reasons.push('similar_text')
  } else if (textSimilarity > 0) {
    score += 6
    reasons.push('shared_details')
  }

  const threshold = relation === 'possible_match' ? 55 : 68
  if (score < threshold) return null
  return {
    relation,
    score: Math.min(92, Math.round(score)),
    reasons,
    engine: 'rules_v1',
    candidate,
  }
}

export function findCandidates(input, candidates, limit = 5) {
  return candidates
    .map((candidate) => scoreCandidate(input, candidate))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, limit)
}
