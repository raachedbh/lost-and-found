export type Language = 'tn' | 'ar' | 'fr' | 'en'
export type ThemePreference = 'system' | 'light' | 'dark'

export type Page =
  | 'home'
  | 'explore'
  | 'rewards'
  | 'help'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'saved'
  | 'settings'

export type PostKind = 'lost' | 'found' | 'help'
export type PostStatus = 'open' | 'matching' | 'claimed' | 'returned' | 'resolved'

export type CategoryId =
  | 'documents'
  | 'phones'
  | 'electronics'
  | 'wallets'
  | 'keys'
  | 'pets'
  | 'bags'
  | 'vehicles'
  | 'clothing'
  | 'other'

export interface LocalizedText {
  tn: string
  ar: string
  fr: string
  en: string
}

export interface CaseItem {
  id: string
  kind: PostKind
  category: CategoryId
  title: LocalizedText
  description: LocalizedText
  location: LocalizedText
  date: string
  timeAgo: LocalizedText
  image?: string
  status: PostStatus
  reward?: number
  matchCount?: number
  matchScore?: number
  source?: 'community' | 'facebook'
  author: {
    id: string
    name: string
    initials: string
    verified: boolean
    returns: number
  }
  comments: number
  saved?: boolean
  urgent?: boolean
}

export type MatchRelation = 'possible_match' | 'possible_duplicate'
export type MatchReason =
  | 'same_category'
  | 'nearby_location'
  | 'related_location'
  | 'close_date'
  | 'nearby_date'
  | 'same_week'
  | 'very_similar_text'
  | 'similar_text'
  | 'shared_details'

export interface MatchCandidate {
  id?: string
  relation: MatchRelation
  score: number
  reasons: MatchReason[]
  engine: 'rules_v1'
  status: 'suggested' | 'dismissed' | 'confirmed'
  case: CaseItem
}

export type ReportTargetType = 'case' | 'comment' | 'message' | 'profile'
export type ReportReason = 'scam' | 'spam' | 'fake' | 'harassment' | 'personal_info' | 'stolen' | 'inappropriate' | 'other'

export interface DraftCase {
  kind: Exclude<PostKind, 'help'>
  category: CategoryId | null
  title: string
  description: string
  location: string
  date: string
  image?: string
  rewardEnabled: boolean
  reward: string
}

export interface ChatMessage {
  id: string
  from: 'me' | 'them'
  text: string
  time: string
}

export interface ConversationItem {
  id: string
  case_id: string
  participant_name: string
  participant_initials: string
  last_message?: string
  updated_at: string
  title: LocalizedText
  location: LocalizedText
}

export interface CommentItem {
  id: string
  body: string
  name: string
  initials: string
  verified: boolean
  created_at: string
}

export interface UserSettings {
  verifiedOnly: boolean
  notifications: boolean
  language: Language
  theme: ThemePreference
}

export interface NotificationItem {
  id: string
  type: 'match' | 'claim' | 'comment' | 'nearby'
  body: string
  priority: 'critical' | 'high' | 'normal' | 'low'
  case_id?: string
  read: boolean
  created_at: string
}
