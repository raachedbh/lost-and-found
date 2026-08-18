export type Language = 'en' | 'fr' | 'ar' | 'tn'
export type PostKind = 'found' | 'lost'
export type PostStatus = 'open' | 'returned'
export type CategoryId =
  | 'documents'
  | 'keys'
  | 'phones'
  | 'wallets'
  | 'bags'
  | 'pets'
  | 'other'

export interface ItemPost {
  id: string
  kind: PostKind
  category: CategoryId
  title: string
  ownerName?: string
  description: string
  location: string
  date?: string
  image?: string
  contactPhone?: string
  contactFacebook?: string
  contactInstagram?: string
  status: PostStatus
  createdAt: number
}

export interface PostFormData {
  kind: PostKind
  category: CategoryId
  title: string
  ownerName: string
  description: string
  location: string
  date: string
  image?: string
  contactPhone: string
  contactFacebook: string
  contactInstagram: string
  privacyConfirmed: boolean
}
