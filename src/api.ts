import type { CaseItem, ChatMessage, CommentItem, ConversationItem, Language, MatchCandidate, NotificationItem, ReportReason, ReportTargetType, ThemePreference, UserSettings } from './types'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    headers.set('X-L9itha-Client', 'web')
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin', signal: controller.signal })
    if (response.status === 204) return undefined as T
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new ApiError(response.status, body.error ?? 'request_failed', body.message ?? 'The request failed.')
    return body as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError(408, 'request_timeout', 'The request took too long.')
    throw new ApiError(0, 'network_unavailable', 'The server is unavailable.')
  } finally {
    window.clearTimeout(timeout)
  }
}

export interface CaseInput {
  kind: 'lost' | 'found'
  category: string
  title: string
  description: string
  location: string
  date: string
  reward?: number
  imageData?: string
  privacyRedacted: boolean
}

export interface DemoUser {
  id: string
  name: string
  initials: string
  verified: boolean
  returns: number
  city: string
}

export const api = {
  health: () => request<{ ok: boolean; database: boolean; version: number; firebaseAuth: boolean }>('/api/health'),
  getSession: () => request<{ user: DemoUser }>('/api/auth/session'),
  signInDemo: () => request<{ user: DemoUser }>('/api/auth/demo', { method: 'POST' }),
  signInFirebase: (idToken: string) => request<{ user: DemoUser }>('/api/auth/firebase', { method: 'POST', body: JSON.stringify({ idToken }) }),
  signOut: () => request<void>('/api/auth/session', { method: 'DELETE' }),
  listCases: () => request<{ cases: CaseItem[]; total: number }>('/api/cases'),
  previewMatches: (input: CaseInput) => request<{ matches: MatchCandidate[] }>('/api/matches/preview', { method: 'POST', body: JSON.stringify(input) }),
  listMatches: (caseId: string) => request<{ matches: MatchCandidate[] }>(`/api/cases/${encodeURIComponent(caseId)}/matches`),
  createCase: (input: CaseInput) => request<{ case: CaseItem; possibleMatches: MatchCandidate[] }>('/api/cases', { method: 'POST', body: JSON.stringify(input) }),
  saveCase: (id: string, saved: boolean) => request<{ saved: boolean }>(`/api/cases/${encodeURIComponent(id)}/saved`, { method: 'PUT', body: JSON.stringify({ saved }) }),
  updateCaseStatus: (id: string, status: CaseItem['status']) => request<{ status: CaseItem['status'] }>(`/api/cases/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  listComments: (caseId: string) => request<{ comments: CommentItem[] }>(`/api/cases/${encodeURIComponent(caseId)}/comments`),
  addComment: (caseId: string, body: string) => request<{ comment: CommentItem }>(`/api/cases/${encodeURIComponent(caseId)}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  sendClaim: (caseId: string, proof: string) => request<{ claim: { id: string; status: 'pending'; createdAt: string } }>(`/api/cases/${encodeURIComponent(caseId)}/claims`, { method: 'POST', body: JSON.stringify({ proof }) }),
  listConversations: () => request<{ conversations: ConversationItem[] }>('/api/conversations'),
  startConversation: (caseId: string) => request<{ conversation: { id: string } }>('/api/conversations', { method: 'POST', body: JSON.stringify({ caseId }) }),
  listMessages: (conversationId: string) => request<{ messages: ChatMessage[] }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`),
  sendMessage: (body: string, conversationId: string) => request<{ message: ChatMessage }>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  reportContent: (input: { objectType: ReportTargetType; objectId: string; reason: ReportReason; details?: string }) => request<{ report: { id: string; status: 'open' }; duplicate: boolean }>('/api/reports', { method: 'POST', body: JSON.stringify(input) }),
  listNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  getSettings: () => request<{ settings: UserSettings }>('/api/settings'),
  updateSettings: (settings: Partial<UserSettings> & { language?: Language; theme?: ThemePreference }) => request<{ settings: UserSettings }>('/api/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  track: (event: string, metadata: Record<string, string> = {}) => request<{ accepted: true }>('/api/analytics', { method: 'POST', body: JSON.stringify({ event, metadata }) }).catch(() => undefined),
}
