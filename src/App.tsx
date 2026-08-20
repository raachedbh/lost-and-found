import {
  ArrowLeft,
  ArrowRight,
  Backpack,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock3,
  CloudOff,
  Coins,
  FileText,
  Filter,
  Flag,
  Heart,
  Home,
  ImagePlus,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Package,
  PawPrint,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Shirt,
  Smartphone,
  Sparkles,
  Sun,
  Upload,
  User,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { categoryIds, languageNames, sampleCases, translations } from './data'
import { api, ApiError, type DemoUser } from './api'
import { firebaseAuthConfigured, getFirebaseIdToken, signOutFirebase, type SocialProvider } from './firebase-auth'
import { optimizeImage } from './image-processing'
import type {
  CaseItem,
  CategoryId,
  ChatMessage,
  CommentItem,
  ConversationItem,
  DraftCase,
  Language,
  MatchCandidate,
  MatchReason,
  NotificationItem,
  Page,
  PostKind,
  PostStatus,
  ReportReason,
  ReportTargetType,
  UserSettings,
} from './types'

const categoryIcons: Record<CategoryId, LucideIcon> = {
  documents: FileText,
  phones: Smartphone,
  electronics: Laptop,
  wallets: WalletCards,
  keys: KeyRound,
  pets: PawPrint,
  bags: Backpack,
  vehicles: MapPin,
  clothing: Shirt,
  other: Package,
}

const navPages: Page[] = ['home', 'explore', 'help', 'rewards']
const rtlLanguages: Language[] = ['tn', 'ar']
const matchReasonKeys: Record<MatchReason, string> = {
  same_category: 'sameCategory',
  nearby_location: 'nearbyLocation',
  related_location: 'relatedLocation',
  close_date: 'closeDate',
  nearby_date: 'nearbyDate',
  same_week: 'sameWeek',
  very_similar_text: 'verySimilarText',
  similar_text: 'similarText',
  shared_details: 'sharedDetails',
}
const reportOptions: { value: ReportReason; label: string }[] = [
  { value: 'scam', label: 'reportScam' },
  { value: 'spam', label: 'reportSpam' },
  { value: 'fake', label: 'reportFake' },
  { value: 'harassment', label: 'reportHarassment' },
  { value: 'personal_info', label: 'reportPersonalInfo' },
  { value: 'stolen', label: 'reportStolen' },
  { value: 'inappropriate', label: 'reportInappropriate' },
  { value: 'other', label: 'reportOther' },
]

interface ReportTarget {
  objectType: ReportTargetType
  objectId: string
}

const categoryAliases: Record<CategoryId, string> = {
  documents: 'document documents cin id بطاقة بطاقة تعريف وثائق papiers passeport passport',
  phones: 'phone phones telephone téléphone tel talifoun تلفون تليفون portable smartphone iphone',
  electronics: 'electronics électronique سماعات earbuds laptop ordinateur casque',
  wallets: 'wallet portefeuille محفظة wallets portefeuille',
  keys: 'keys key clé clés مفتاح مفاتيح mfte7',
  pets: 'pet pets cat dog animal قطوس 9attous gatous كلب حيوان',
  bags: 'bag bags backpack sac حقيبة cartable',
  vehicles: 'car vehicle voiture scooter كرهبة moto',
  clothing: 'clothes clothing vêtements ملابس veste',
  other: 'other autre أخرى',
}

function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem('l9itha-language') as Language | null
    return stored && ['tn', 'ar', 'fr', 'en'].includes(stored) ? stored : 'tn'
  } catch {
    return 'tn'
  }
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('l9itha-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Fall back to the product default below.
  }
  return 'light'
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064b-\u065f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .toLocaleLowerCase()
    .trim()
}

function todayValue() {
  return new Date().toISOString().slice(0, 10)
}

function emptyDraft(kind: Exclude<PostKind, 'help'>): DraftCase {
  return {
    kind,
    category: null,
    title: '',
    description: '',
    location: '',
    date: todayValue(),
    rewardEnabled: false,
    reward: '',
  }
}

function getInitialCases() {
  try {
    const cached = localStorage.getItem('l9itha-recent-cases')
    if (cached) return JSON.parse(cached) as CaseItem[]
  } catch {
    // The bundled cases remain a safe offline fallback.
  }
  return sampleCases
}

function getSavedDraft(kind: Exclude<PostKind, 'help'>) {
  try {
    const cached = sessionStorage.getItem(`l9itha-draft-${kind}`)
    if (cached) {
      const parsed = JSON.parse(cached) as DraftCase
      return { ...parsed, image: undefined, location: '' }
    }
  } catch {
    // Start a clean report if stored draft data is damaged.
  }
  return emptyDraft(kind)
}

function friendlyApiError(error: unknown, t: (key: string) => string) {
  if (error instanceof ApiError && error.code === 'network_unavailable') return t('offlineTitle')
  return t('syncFailed')
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

interface ModalProps {
  children: ReactNode
  onClose: () => void
  label: string
  wide?: boolean
}

function Modal({ children, onClose, label, wide = false }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    const frame = window.requestAnimationFrame(() => {
      const first = dialog.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? dialog).focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
      if (dialogs.at(-1) !== dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null)
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-shell ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={dialogRef}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  )
}

interface BrandProps {
  compact?: boolean
}

function Brand({ compact = false }: BrandProps) {
  return (
    <span className={`brand ${compact ? 'brand-compact' : ''}`}>
      <img src="/assets/l9itha-mark.png" alt="" width="46" height="46" />
      <span className="brand-copy">
        <strong>لقيتها</strong>
        <small>L9itha</small>
      </span>
    </span>
  )
}

interface StatusBadgeProps {
  status: PostStatus
  kind: PostKind
  t: (key: string) => string
}

function StatusBadge({ status, kind, t }: StatusBadgeProps) {
  const label = status === 'matching'
    ? t('possibleMatch')
    : status === 'returned'
      ? t('returned')
      : status === 'claimed'
        ? t('claimed')
        : status === 'resolved'
          ? t('resolved')
          : kind === 'lost'
            ? t('stillLost')
            : t('lookingForOwner')
  return <span className={`status-badge status-${status} kind-${kind}`}>{label}</span>
}

interface CaseCardProps {
  item: CaseItem
  language: Language
  t: (key: string) => string
  onOpen: () => void
  onSave: () => void
  compact?: boolean
}

function CaseCard({ item, language, t, onOpen, onSave, compact = false }: CaseCardProps) {
  return (
    <article className={`case-card ${compact ? 'case-card-compact' : ''}`}>
      <button className="case-image-button" onClick={onOpen} aria-label={`${t('viewDetails')}: ${item.title[language]}`}>
        {item.image ? (
          <img src={item.image} alt={item.title[language]} loading="lazy" decoding="async" width="640" height="480" />
        ) : (
          <span className="case-image-empty"><ImagePlus aria-hidden="true" /></span>
        )}
      </button>
      <div className="case-card-body">
        <div className="case-card-topline">
          <StatusBadge status={item.status} kind={item.kind} t={t} />
          <button className={`save-button ${item.saved ? 'saved' : ''}`} onClick={onSave} aria-label={t('save')}>
            <Heart size={18} fill={item.saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <button className="case-card-main" onClick={onOpen}>
          <strong>{item.title[language]}</strong>
          <span><MapPin size={14} /> {item.location[language]}</span>
          <span><Clock3 size={14} /> {item.timeAgo[language]}</span>
        </button>
        <div className="case-card-footer">
          {item.reward ? <span className="reward-badge"><Coins size={14} /> {item.reward} {language === 'en' ? 'TND' : 'د.ت'}</span> : <span />}
          {item.matchCount ? <button className="match-count" onClick={onOpen}><Sparkles size={14} /> {item.matchCount}</button> : null}
        </div>
      </div>
    </article>
  )
}

interface PageHeaderProps {
  eyebrow?: string
  title: string
  text?: string
  actions?: ReactNode
}

function PageHeader({ eyebrow, title, text, actions }: PageHeaderProps) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <span className="page-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {text ? <p>{text}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage)
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)
  const [page, setPage] = useState<Page>('home')
  const [languageOpen, setLanguageOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [postMenuOpen, setPostMenuOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [analysisStage, setAnalysisStage] = useState(0)
  const [draft, setDraft] = useState<DraftCase>(() => getSavedDraft('lost'))
  const [draftMatches, setDraftMatches] = useState<MatchCandidate[]>([])
  const [checkingMatches, setCheckingMatches] = useState(false)
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null)
  const [caseMatches, setCaseMatches] = useState<MatchCandidate[]>([])
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimProof, setClaimProof] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'lost' | 'found'>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | null>(null)
  const [mapView, setMapView] = useState(false)
  const [cases, setCases] = useState<CaseItem[]>(getInitialCases)
  const [sessionUser, setSessionUser] = useState<DemoUser | null>(null)
  const [apiStatus, setApiStatus] = useState<'loading' | 'online' | 'offline'>('loading')
  const [publishing, setPublishing] = useState(false)
  const [processingImage, setProcessingImage] = useState(false)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<CommentItem[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [conversationId, setConversationId] = useState('')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [reportReason, setReportReason] = useState<ReportReason | ''>('')
  const [reportDetails, setReportDetails] = useState('')
  const [reporting, setReporting] = useState(false)
  const [authProvider, setAuthProvider] = useState<SocialProvider | 'demo' | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const initialSyncStarted = useRef(false)
  const t = useCallback((key: string) => translations[language][key] ?? translations.en[key] ?? key, [language])
  const isRtl = rtlLanguages.includes(language)
  const selectedCaseId = selectedCase?.id

  const loadPrivateState = useCallback(async (user: DemoUser) => {
    const [conversationResult, notificationResult] = await Promise.all([api.listConversations(), api.listNotifications()])
    setSessionUser(user)
    setConversations(conversationResult.conversations)
    const firstConversationId = conversationResult.conversations[0]?.id ?? ''
    setConversationId(firstConversationId)
    setMessages(firstConversationId ? (await api.listMessages(firstConversationId)).messages : [])
    setNotifications(notificationResult.notifications)
  }, [])

  const connectBackend = useCallback(async () => {
    setApiStatus('loading')
    try {
      const caseResult = await api.listCases()
      setCases(caseResult.cases)
      try {
        const session = await api.getSession()
        await loadPrivateState(session.user)
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error
        setSessionUser(null)
        setConversations([])
        setConversationId('')
        setMessages([])
        setNotifications([])
      }
      setApiStatus('online')
    } catch {
      setApiStatus('offline')
    }
  }, [loadPrivateState])

  useEffect(() => {
    if (initialSyncStarted.current) return
    initialSyncStarted.current = true
    void connectBackend()
  }, [connectBackend])

  useEffect(() => {
    const reconnect = () => void connectBackend()
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [connectBackend])

  useEffect(() => {
    try {
      localStorage.setItem('l9itha-recent-cases', JSON.stringify(cases.slice(0, 30)))
    } catch {
      // Quota restrictions must not interrupt browsing.
    }
  }, [cases])

  useEffect(() => {
    if (!wizardOpen) return
    try {
      const safeDraft = { ...draft, image: undefined, location: '' }
      sessionStorage.setItem(`l9itha-draft-${draft.kind}`, JSON.stringify(safeDraft))
    } catch {
      // The active in-memory draft remains usable.
    }
  }, [draft, wizardOpen])

  useEffect(() => {
    if (!selectedCaseId) return
    let active = true
    Promise.all([api.listComments(selectedCaseId), api.listMatches(selectedCaseId)])
      .then(([commentResult, matchResult]) => {
        if (!active) return
        setComments(commentResult.comments)
        setCaseMatches(matchResult.matches)
      })
      .catch(() => {
        if (!active) return
        setComments([])
        setCaseMatches([])
      })
    return () => { active = false }
  }, [selectedCaseId])

  useEffect(() => {
    document.documentElement.lang = language === 'tn' ? 'ar-TN' : language
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
    localStorage.setItem('l9itha-language', language)
  }, [isRtl, language])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('l9itha-theme', theme)
  }, [theme])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const filteredCases = useMemo(() => {
    const needle = normalize(query)
    return cases.filter((item) => {
      const kindMatches = kindFilter === 'all' || item.kind === kindFilter
      const categoryMatches = !categoryFilter || item.category === categoryFilter
      const haystack = normalize([
        ...Object.values(item.title),
        ...Object.values(item.description),
        ...Object.values(item.location),
        categoryAliases[item.category],
      ].join(' '))
      return kindMatches && categoryMatches && (!needle || haystack.includes(needle))
    })
  }, [cases, categoryFilter, kindFilter, query])

  const navigate = (nextPage: Page) => {
    if (['messages', 'notifications', 'profile', 'saved', 'settings'].includes(nextPage) && !sessionUser) {
      setAuthOpen(true)
      return
    }
    setPage(nextPage)
    setMobileMenuOpen(false)
    setAccountOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startWizard = (kind: Exclude<PostKind, 'help'>, category?: CategoryId) => {
    if (!sessionUser) {
      setPostMenuOpen(false)
      setAuthOpen(true)
      return
    }
    const savedDraft = getSavedDraft(kind)
    setDraft({ ...savedDraft, kind, category: category ?? savedDraft.category })
    setWizardStep(category ? 1 : 0)
    setAnalysisStage(0)
    setDraftMatches([])
    setPostMenuOpen(false)
    setWizardOpen(true)
    void api.track(kind === 'lost' ? 'lost_flow_started' : 'found_flow_started', { kind, category: category ?? '' })
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    void api.track('home_search', { page: 'home' })
    navigate('explore')
  }

  const toggleSaved = async (id: string) => {
    if (!sessionUser) {
      setAuthOpen(true)
      return
    }
    const item = cases.find((candidate) => candidate.id === id)
    if (!item) return
    const nextSaved = !item.saved
    setCases((current) => current.map((candidate) => candidate.id === id ? { ...candidate, saved: nextSaved } : candidate))
    setSelectedCase((current) => current?.id === id ? { ...current, saved: nextSaved } : current)
    setToast(nextSaved ? t('savedToast') : t('removedSaved'))
    try {
      await api.saveCase(id, nextSaved)
    } catch (error) {
      setCases((current) => current.map((candidate) => candidate.id === id ? { ...candidate, saved: !nextSaved } : candidate))
      setSelectedCase((current) => current?.id === id ? { ...current, saved: !nextSaved } : current)
      setToast(friendlyApiError(error, t))
    }
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    if (draft.category === 'documents') {
      setToast(t('documentPhotoDisabled'))
      return
    }
    if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024) {
      setToast(t('photoRequiredError'))
      return
    }
    setProcessingImage(true)
    try {
      const image = await optimizeImage(file)
      setDraft((current) => ({ ...current, image }))
      void api.track('image_uploaded', { category: draft.category ?? 'other', kind: draft.kind })
    } catch {
      setToast(t('photoRequiredError'))
    } finally {
      setProcessingImage(false)
    }
  }

  const nextWizardStep = async () => {
    if (wizardStep === 0 && !draft.category) {
      setToast(t('requiredError'))
      return
    }
    if (wizardStep === 1) {
      setAnalysisStage(4)
      setWizardStep(2)
      return
    }
    if (wizardStep === 2 && analysisStage < 4) return
    if (wizardStep === 3 && (!draft.title.trim() || !draft.location.trim())) {
      setToast(t('requiredError'))
      return
    }
    if (wizardStep === 3 && draft.category) {
      setCheckingMatches(true)
      try {
        const result = await api.previewMatches({
          kind: draft.kind,
          category: draft.category,
          title: draft.title.trim(),
          description: draft.description.trim(),
          location: draft.location.trim(),
          date: draft.date,
          privacyRedacted: false,
        })
        setDraftMatches(result.matches)
        setApiStatus('online')
      } catch (error) {
        setDraftMatches([])
        setToast(friendlyApiError(error, t))
      } finally {
        setCheckingMatches(false)
      }
    }
    setWizardStep((current) => Math.min(current + 1, 4))
  }

  const publishDraft = async () => {
    if (publishing || !draft.category) return
    if (!sessionUser) {
      setAuthOpen(true)
      return
    }
    setPublishing(true)
    try {
      const result = await api.createCase({
        kind: draft.kind,
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description.trim(),
        location: draft.location.trim(),
        date: draft.date,
        reward: draft.rewardEnabled && draft.reward ? Number(draft.reward) : undefined,
        imageData: draft.category === 'documents' ? undefined : draft.image,
        privacyRedacted: false,
      })
      setCases((current) => [result.case, ...current.filter((item) => item.id !== result.case.id)])
      setDraftMatches(result.possibleMatches)
      sessionStorage.removeItem(`l9itha-draft-${draft.kind}`)
      setWizardOpen(false)
      setQuery('')
      setKindFilter('all')
      setCategoryFilter(null)
      setToast(t('publishSuccess'))
      setPage('explore')
      setApiStatus('online')
      void api.track('post_published', { category: result.case.category, kind: result.case.kind })
    } catch (error) {
      setToast(friendlyApiError(error, t))
      if (error instanceof ApiError && error.status === 0) setApiStatus('offline')
    } finally {
      setPublishing(false)
    }
  }

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    if (!sessionUser) {
      setAuthOpen(true)
      return
    }
    const value = messageInput.trim()
    if (!value || !conversationId) return
    const temporaryId = `pending-${crypto.randomUUID()}`
    setMessages((current) => [...current, { id: temporaryId, from: 'me', text: value, time: new Date().toISOString() }])
    setMessageInput('')
    try {
      const result = await api.sendMessage(value, conversationId)
      setMessages((current) => current.map((message) => message.id === temporaryId ? result.message : message))
      void api.track('message_sent', { page: 'messages' })
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== temporaryId))
      setMessageInput(value)
      setToast(friendlyApiError(error, t))
    }
  }

  const sendClaim = async (event: FormEvent) => {
    event.preventDefault()
    if (!sessionUser) {
      setClaimOpen(false)
      setAuthOpen(true)
      return
    }
    if (!claimProof.trim() || !selectedCase) {
      setToast(t('requiredError'))
      return
    }
    try {
      await api.sendClaim(selectedCase.id, claimProof.trim())
      setClaimOpen(false)
      setClaimProof('')
      setToast(t('claimSent'))
      void api.track('claim_started', { category: selectedCase.category })
    } catch (error) {
      setToast(friendlyApiError(error, t))
    }
  }

  const addComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!sessionUser) {
      setAuthOpen(true)
      return
    }
    const value = comment.trim()
    if (!value || !selectedCase) return
    const caseId = selectedCase.id
    const temporaryId = `pending-${crypto.randomUUID()}`
    const optimistic: CommentItem = { id: temporaryId, body: value, name: sessionUser?.name ?? 'Yacine', initials: sessionUser?.initials ?? 'YA', verified: true, created_at: new Date().toISOString() }
    setComments((current) => [...current, optimistic])
    setCases((current) => current.map((item) => item.id === caseId ? { ...item, comments: item.comments + 1 } : item))
    setSelectedCase((current) => current?.id === caseId ? { ...current, comments: current.comments + 1 } : current)
    setComment('')
    try {
      const result = await api.addComment(caseId, value)
      setComments((current) => current.map((item) => item.id === temporaryId ? result.comment : item))
    } catch (error) {
      setComments((current) => current.filter((item) => item.id !== temporaryId))
      setCases((current) => current.map((item) => item.id === caseId ? { ...item, comments: Math.max(0, item.comments - 1) } : item))
      setSelectedCase((current) => current?.id === caseId ? { ...current, comments: Math.max(0, current.comments - 1) } : current)
      setComment(value)
      setToast(friendlyApiError(error, t))
    }
  }

  const openCase = (item: CaseItem) => {
    setComments([])
    setCaseMatches([])
    setSelectedCase(item)
    if (item.status === 'matching') void api.track('match_viewed', { category: item.category })
  }

  const openReport = (target: ReportTarget) => {
    if (!sessionUser) {
      setAuthOpen(true)
      return
    }
    setReportTarget(target)
    setReportReason('')
    setReportDetails('')
  }

  const submitReport = async (event: FormEvent) => {
    event.preventDefault()
    if (!reportTarget || !reportReason || reporting) {
      if (!reportReason) setToast(t('requiredError'))
      return
    }
    setReporting(true)
    try {
      await api.reportContent({ ...reportTarget, reason: reportReason, details: reportDetails.trim() })
      setReportTarget(null)
      setReportReason('')
      setReportDetails('')
      setToast(t('reportSubmitted'))
    } catch (error) {
      setToast(friendlyApiError(error, t))
    } finally {
      setReporting(false)
    }
  }

  const markReturned = async (item: CaseItem) => {
    const previous = item.status
    const status: PostStatus = 'returned'
    setCases((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status } : candidate))
    setSelectedCase((current) => current?.id === item.id ? { ...current, status } : current)
    try {
      await api.updateCaseStatus(item.id, status)
      void api.track('case_resolved', { category: item.category, kind: item.kind, status })
    } catch (error) {
      setCases((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status: previous } : candidate))
      setSelectedCase((current) => current?.id === item.id ? { ...current, status: previous } : current)
      setToast(friendlyApiError(error, t))
    }
  }

  const selectConversation = async (id: string) => {
    try {
      setConversationId(id)
      setMessages((await api.listMessages(id)).messages)
    } catch (error) {
      setToast(friendlyApiError(error, t))
    }
  }

  const startMessaging = async (item: CaseItem) => {
    if (!sessionUser) {
      setSelectedCase(null)
      setAuthOpen(true)
      return
    }
    try {
      const result = await api.startConversation(item.id)
      const conversationResult = await api.listConversations()
      setConversations(conversationResult.conversations)
      await selectConversation(result.conversation.id)
      setSelectedCase(null)
      navigate('messages')
      void api.track('match_contacted', { category: item.category })
    } catch (error) {
      setToast(friendlyApiError(error, t))
    }
  }

  const signIn = async (provider: SocialProvider | 'demo') => {
    if (authProvider) return
    setAuthProvider(provider)
    try {
      const session = provider === 'demo'
        ? await api.signInDemo()
        : await api.signInFirebase(await getFirebaseIdToken(provider, language))
      await loadPrivateState(session.user)
      setApiStatus('online')
      setAuthOpen(false)
    } catch (error) {
      setToast(error instanceof Error && error.message === 'firebase_not_configured' ? t('authSetupNeeded') : friendlyApiError(error, t))
    } finally {
      setAuthProvider(null)
    }
  }

  const signOut = async () => {
    try {
      await Promise.all([api.signOut(), signOutFirebase()])
    } finally {
      setSessionUser(null)
      setConversations([])
      setConversationId('')
      setMessages([])
      setNotifications([])
      setAccountOpen(false)
      setPage('home')
    }
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    if (sessionUser) void api.updateSettings({ theme: nextTheme }).catch(() => setToast(t('syncFailed')))
  }

  return (
    <div className="app-shell">
      <Header
        page={page}
        language={language}
        t={t}
        navigate={navigate}
        languageOpen={languageOpen}
        setLanguageOpen={setLanguageOpen}
        setLanguage={setLanguage}
        accountOpen={accountOpen}
        setAccountOpen={setAccountOpen}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onPost={() => setPostMenuOpen(true)}
        onSignIn={() => setAuthOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={sessionUser}
        onSignOut={() => void signOut()}
      />

      {apiStatus === 'offline' ? (
        <div className="connection-banner" role="status">
          <CloudOff />
          <span>{t('offlineTitle')}</span>
          <button onClick={() => void connectBackend()}>{t('continue')}</button>
        </div>
      ) : null}

      <main>
        {page === 'home' && (
          <HomePage
            language={language}
            t={t}
            query={query}
            setQuery={setQuery}
            submitSearch={submitSearch}
            cases={cases}
            startWizard={startWizard}
            navigate={navigate}
            setSelectedCase={openCase}
            toggleSaved={toggleSaved}
            setCategoryFilter={setCategoryFilter}
          />
        )}
        {page === 'explore' && (
          <ExplorePage
            language={language}
            t={t}
            query={query}
            setQuery={setQuery}
            kindFilter={kindFilter}
            setKindFilter={setKindFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            cases={filteredCases}
            mapView={mapView}
            setMapView={setMapView}
            startWizard={startWizard}
            setSelectedCase={openCase}
            toggleSaved={toggleSaved}
          />
        )}
        {page === 'messages' && <MessagesPage language={language} t={t} conversations={conversations} conversationId={conversationId} selectConversation={(id) => void selectConversation(id)} messages={messages} messageInput={messageInput} setMessageInput={setMessageInput} sendMessage={sendMessage} onReport={openReport} />}
        {page === 'notifications' && <NotificationsPage t={t} items={notifications} onOpenCase={(id) => { const item = cases.find((candidate) => candidate.id === id); if (item) openCase(item) }} />}
        {page === 'profile' && <ProfilePage language={language} t={t} cases={cases} user={sessionUser} onOpen={openCase} onSettings={() => navigate('settings')} onSignOut={() => void signOut()} />}
        {page === 'saved' && <SavedPage language={language} t={t} cases={cases.filter((item) => item.saved)} onOpen={openCase} onSave={toggleSaved} navigate={navigate} />}
        {page === 'settings' && <SettingsPage language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} t={t} />}
        {page === 'help' && <InfoPage kind="help" t={t} />}
        {page === 'rewards' && <InfoPage kind="rewards" t={t} />}
      </main>

      <MobileNavigation page={page} t={t} navigate={navigate} onPost={() => setPostMenuOpen(true)} />

      {postMenuOpen && (
        <Modal onClose={() => setPostMenuOpen(false)} label={t('post')}>
          <div className="quick-post-sheet">
            <div className="modal-title-row">
              <div><span className="modal-kicker">L9itha</span><h2>{t('post')}</h2></div>
              <button className="icon-button" onClick={() => setPostMenuOpen(false)} aria-label={t('close')}><X /></button>
            </div>
            <button className="quick-action quick-lost" onClick={() => startWizard('lost')}><span><Search /></span><div><strong>{t('lostAction')}</strong><small>{t('lostActionHint')}</small></div><ChevronLeft /></button>
            <button className="quick-action quick-found" onClick={() => startWizard('found')}><span><Heart /></span><div><strong>{t('foundAction')}</strong><small>{t('foundActionHint')}</small></div><ChevronLeft /></button>
            <div className="quick-secondary">
              <button onClick={() => startWizard('lost', 'pets')}><PawPrint /> {t('pets')}</button>
              <button onClick={() => startWizard('found', 'documents')}><FileText /> {t('documents')}</button>
            </div>
          </div>
        </Modal>
      )}

      {wizardOpen && (
        <PostWizard
          draft={draft}
          setDraft={setDraft}
          step={wizardStep}
          analysisStage={analysisStage}
          matches={draftMatches}
          checkingMatches={checkingMatches}
          language={language}
          t={t}
          onClose={() => setWizardOpen(false)}
          onNext={nextWizardStep}
          onBack={() => setWizardStep((current) => Math.max(0, current - 1))}
          onPublish={publishDraft}
          uploadRef={uploadRef}
          handleFile={handleFile}
          publishing={publishing}
          processingImage={processingImage}
          onOpenMatch={(item) => { setWizardOpen(false); openCase(item) }}
        />
      )}

      {selectedCase && !claimOpen && !reportTarget && (
        <CaseDetails
          item={selectedCase}
          language={language}
          t={t}
          comments={comments}
          matches={caseMatches}
          comment={comment}
          setComment={setComment}
          addComment={addComment}
          onClose={() => setSelectedCase(null)}
          onMessage={() => void startMessaging(selectedCase)}
          onClaim={() => { if (sessionUser) setClaimOpen(true); else { setSelectedCase(null); setAuthOpen(true) } }}
          onSave={() => toggleSaved(selectedCase.id)}
          isOwner={selectedCase.author.id === sessionUser?.id}
          onMarkReturned={() => void markReturned(selectedCase)}
          onOpenMatch={openCase}
          onReport={openReport}
        />
      )}

      {claimOpen && (
        <Modal onClose={() => setClaimOpen(false)} label={t('startClaim')}>
          <form className="claim-form" onSubmit={sendClaim}>
            <div className="claim-icon"><LockKeyhole /></div>
            <h2>{t('startClaim')}</h2>
            <p>{t('proofQuestion')}</p>
            <label><span>{t('details')}</span><textarea value={claimProof} onChange={(event) => setClaimProof(event.target.value)} placeholder={t('proofPlaceholder')} rows={4} autoFocus /></label>
            <div className="privacy-note"><ShieldCheck /><span>{t('notOwnershipProof')}</span></div>
            <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setClaimOpen(false)}>{t('cancel')}</button><button className="button primary" type="submit">{t('sendPrivate')}</button></div>
          </form>
        </Modal>
      )}

      {reportTarget && (
        <ReportModal
          t={t}
          reason={reportReason}
          setReason={setReportReason}
          details={reportDetails}
          setDetails={setReportDetails}
          reporting={reporting}
          onClose={() => setReportTarget(null)}
          onSubmit={submitReport}
        />
      )}

      {authOpen && (
        <Modal onClose={() => setAuthOpen(false)} label={t('signIn')}>
          <div className="auth-form">
            <button className="auth-close icon-button" type="button" onClick={() => setAuthOpen(false)} aria-label={t('close')}><X /></button>
            <Brand />
            <h2>{t('signIn')}</h2>
            <p>{t('authIntro')}</p>
            <button className="button primary wide" type="button" onClick={() => void signIn('google')} disabled={!firebaseAuthConfigured() || Boolean(authProvider)}><User /> {authProvider === 'google' ? t('signingIn') : t('continueWithGoogle')}</button>
            <button className="button secondary wide" type="button" onClick={() => void signIn('facebook')} disabled={!firebaseAuthConfigured() || Boolean(authProvider)}><User /> {authProvider === 'facebook' ? t('signingIn') : t('continueWithFacebook')}</button>
            {!firebaseAuthConfigured() ? <small className="auth-setup">{t('authSetupNeeded')}</small> : null}
            {import.meta.env.DEV ? <button className="button text wide" type="button" onClick={() => void signIn('demo')} disabled={Boolean(authProvider)}>{t('continueAsYacine')}</button> : null}
            <p className="auth-browse">{language === 'tn' ? 'تنجم تتفرّج من غير حساب.' : language === 'ar' ? 'يمكنك التصفح دون حساب.' : language === 'fr' ? 'Vous pouvez naviguer sans compte.' : 'You can browse without an account.'}</p>
          </div>
        </Modal>
      )}

      {toast ? <div className="toast" role="status"><CheckCircle2 /> {toast}</div> : null}
    </div>
  )
}

interface HeaderProps {
  page: Page
  language: Language
  t: (key: string) => string
  navigate: (page: Page) => void
  languageOpen: boolean
  setLanguageOpen: (open: boolean) => void
  setLanguage: (language: Language) => void
  accountOpen: boolean
  setAccountOpen: (open: boolean) => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  onPost: () => void
  onSignIn: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  user: DemoUser | null
  onSignOut: () => void
}

function Header(props: HeaderProps) {
  const { page, language, t, navigate, languageOpen, setLanguageOpen, setLanguage, accountOpen, setAccountOpen, mobileMenuOpen, setMobileMenuOpen, onPost, onSignIn, theme, onToggleTheme, user, onSignOut } = props
  return (
    <header className="site-header">
      <button className="brand-button" onClick={() => navigate('home')} aria-label={t('home')}><Brand /></button>
      <nav className={`desktop-nav ${mobileMenuOpen ? 'open' : ''}`} aria-label="Primary">
        {navPages.map((item) => <button key={item} className={page === item ? 'active' : ''} onClick={() => navigate(item)}>{t(item)}</button>)}
      </nav>
      <div className="header-actions">
        <button className="header-icon theme-toggle" onClick={onToggleTheme} aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')} title={theme === 'dark' ? t('lightMode') : t('darkMode')}>{theme === 'dark' ? <Sun /> : <Moon />}</button>
        <button className="header-icon" onClick={() => navigate('notifications')} aria-label={t('notifications')}><Bell /><span className="notification-dot" /></button>
        <div className="language-control">
          <button className="language-button" onClick={() => setLanguageOpen(!languageOpen)} aria-expanded={languageOpen}>{languageNames[language]} <ChevronDown size={16} /></button>
          {languageOpen && <div className="floating-menu language-menu">{(Object.keys(languageNames) as Language[]).map((code) => <button key={code} className={language === code ? 'active' : ''} onClick={() => { setLanguage(code); setLanguageOpen(false) }}><span>{languageNames[code]}</span>{language === code ? <Check /> : null}</button>)}</div>}
        </div>
        {!user ? <button className="sign-in-button" onClick={onSignIn}><User /> {t('signIn')}</button> : (
          <div className="account-control">
            <button className="avatar-button" onClick={() => setAccountOpen(!accountOpen)} aria-label={t('profile')}>{user.initials}</button>
            {accountOpen && <div className="floating-menu account-menu"><button onClick={() => navigate('profile')}><User /> {t('profile')}</button><button onClick={() => navigate('saved')}><Heart /> {t('saved')}</button><button onClick={() => navigate('settings')}><Settings /> {t('settings')}</button><button onClick={onSignOut}><LogOut /> {t('signOut')}</button></div>}
          </div>
        )}
        <button className="header-post-button" onClick={onPost}><Plus /> {t('post')}</button>
        <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">{mobileMenuOpen ? <X /> : <Menu />}</button>
      </div>
    </header>
  )
}

interface HomePageProps {
  language: Language
  t: (key: string) => string
  query: string
  setQuery: (value: string) => void
  submitSearch: (event: FormEvent) => void
  cases: CaseItem[]
  startWizard: (kind: 'lost' | 'found', category?: CategoryId) => void
  navigate: (page: Page) => void
  setSelectedCase: (item: CaseItem) => void
  toggleSaved: (id: string) => void
  setCategoryFilter: (category: CategoryId | null) => void
}

function HomePage(props: HomePageProps) {
  const { language, t, query, setQuery, submitSearch, cases, startWizard, navigate, setSelectedCase, toggleSaved, setCategoryFilter } = props
  const homeCategories: CategoryId[] = ['keys', 'phones', 'wallets', 'bags', 'documents', 'pets', 'other']
  return (
    <>
      <section className="home-hero">
        <img className="hero-art" src="/assets/l9itha-hero.jpg" alt="" width="1720" height="573" fetchPriority="high" decoding="async" />
        <div className="hero-copy">
          <h1><span>{t('heroTitleA')}</span><strong>{t('heroTitleB')}</strong></h1>
          <p>{t('heroSubtitle')} <b>{t('heroSubtitleAccent')}</b>{t('heroSubtitleEnd')}</p>
        </div>
        <div className="hero-connection"><img src="/assets/l9itha-mark.png" alt="" width="64" height="64" /></div>
        <div className="hero-controls page-container">
          <div className="primary-actions">
            <button className="primary-action action-lost" onClick={() => startWizard('lost')}>
              <span className="action-icon"><Search /></span><span><strong>{t('lostAction')}</strong><small>{t('lostActionHint')}</small></span><ArrowLeft className="direction-arrow" />
            </button>
            <button className="primary-action action-found" onClick={() => startWizard('found')}>
              <span className="action-icon"><Heart /></span><span><strong>{t('foundAction')}</strong><small>{t('foundActionHint')}</small></span><ArrowRight className="direction-arrow" />
            </button>
          </div>
          <form className="universal-search" onSubmit={submitSearch}>
            <div className="search-input-wrap"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} /></div>
            <button className="location-selector" type="button"><MapPin /><span>{language === 'fr' ? 'El Menzah, Tunis' : language === 'en' ? 'El Menzah, Tunis' : 'المنزه، تونس'}</span><ChevronDown /></button>
            <button className="search-submit" aria-label={t('search')}><Search /></button>
          </form>
          <div className="location-privacy"><LockKeyhole /> {t('exactLocationPrivate')}</div>
          <div className="category-heading"><h2>{t('browseByCategory')}</h2></div>
          <div className="category-row">
            {homeCategories.map((category) => {
              const Icon = categoryIcons[category]
              return <button key={category} onClick={() => { setCategoryFilter(category); navigate('explore') }}><Icon /><span>{t(category)}</span></button>
            })}
          </div>
        </div>
      </section>

      <section className="nearby-section page-container">
        <div className="section-title-row"><div><h2>{t('nearYou')}</h2><span><MapPin /> {t('aroundYou')}</span></div><button onClick={() => navigate('explore')}>{t('viewAll')} <ArrowLeft /></button></div>
        <div className="compact-case-grid">
          {cases.slice(0, 4).map((item) => <CaseCard key={item.id} item={item} language={language} t={t} compact onOpen={() => setSelectedCase(item)} onSave={() => toggleSaved(item.id)} />)}
        </div>
      </section>

      <section className="trust-strip page-container" aria-label={t('privacyShort')}>
        <div><ShieldCheck /><span><strong>{t('privacyShort')}</strong></span></div>
        <div><MessageCircle /><span><strong>{t('directContact')}</strong></span></div>
        <div><BadgeCheck /><span><strong>{t('trustedCommunity')}</strong></span></div>
        <div><CheckCircle2 /><span><strong>{t('free')}</strong></span></div>
      </section>
    </>
  )
}

interface ExplorePageProps {
  language: Language
  t: (key: string) => string
  query: string
  setQuery: (value: string) => void
  kindFilter: 'all' | 'lost' | 'found'
  setKindFilter: (value: 'all' | 'lost' | 'found') => void
  categoryFilter: CategoryId | null
  setCategoryFilter: (value: CategoryId | null) => void
  cases: CaseItem[]
  mapView: boolean
  setMapView: (value: boolean) => void
  startWizard: (kind: 'lost' | 'found') => void
  setSelectedCase: (item: CaseItem) => void
  toggleSaved: (id: string) => void
}

function ExplorePage(props: ExplorePageProps) {
  const { language, t, query, setQuery, kindFilter, setKindFilter, categoryFilter, setCategoryFilter, cases, mapView, setMapView, startWizard, setSelectedCase, toggleSaved } = props
  return (
    <section className="explore-page page-container">
      <PageHeader title={t('searchResults')} actions={<button className="button primary" onClick={() => startWizard('lost')}><Plus /> {t('lostAction')}</button>} />
      <div className="explore-search-row">
        <label className="explore-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} /></label>
        <button className="filter-button"><Filter /> {t('filters')}</button>
      </div>
      <div className="filter-toolbar">
        <div className="segmented-control">{(['all', 'lost', 'found'] as const).map((kind) => <button key={kind} className={kindFilter === kind ? 'active' : ''} onClick={() => setKindFilter(kind)}>{t(kind)}</button>)}</div>
        <div className="category-filter-scroll"><button className={!categoryFilter ? 'active' : ''} onClick={() => setCategoryFilter(null)}>{t('all')}</button>{categoryIds.map((category) => <button key={category} className={categoryFilter === category ? 'active' : ''} onClick={() => setCategoryFilter(category)}>{t(category)}</button>)}</div>
        <div className="view-toggle"><button className={!mapView ? 'active' : ''} onClick={() => setMapView(false)}><BookOpen /> {t('cards')}</button><button className={mapView ? 'active' : ''} onClick={() => setMapView(true)}><Map /> {t('map')}</button></div>
      </div>
      {cases.length ? (
        mapView ? (
          <div className="location-list-view">{cases.map((item) => <button key={item.id} onClick={() => setSelectedCase(item)}><MapPin /><span><strong>{item.location[language]}</strong><small>{item.title[language]} · {item.timeAgo[language]}</small></span><StatusBadge status={item.status} kind={item.kind} t={t} /></button>)}</div>
        ) : (
          <div className="explore-grid">{cases.map((item) => <CaseCard key={item.id} item={item} language={language} t={t} onOpen={() => setSelectedCase(item)} onSave={() => toggleSaved(item.id)} />)}</div>
        )
      ) : (
        <div className="empty-state"><div className="empty-icon"><Search /></div><h2>{t('noResults')}</h2><p>{t('noResultsHint')}</p><div><button className="button secondary" onClick={() => { setQuery(''); setCategoryFilter(null); setKindFilter('all') }}>{t('clearFilters')}</button><button className="button primary" onClick={() => startWizard('lost')}>{t('createLostReport')}</button></div></div>
      )}
    </section>
  )
}

interface PostWizardProps {
  draft: DraftCase
  setDraft: (value: DraftCase | ((current: DraftCase) => DraftCase)) => void
  step: number
  analysisStage: number
  matches: MatchCandidate[]
  checkingMatches: boolean
  language: Language
  t: (key: string) => string
  onClose: () => void
  onNext: () => void
  onBack: () => void
  onPublish: () => void
  uploadRef: React.RefObject<HTMLInputElement | null>
  handleFile: (file?: File) => void | Promise<void>
  publishing: boolean
  processingImage: boolean
  onOpenMatch: (item: CaseItem) => void
}

function PostWizard(props: PostWizardProps) {
  const { draft, setDraft, step, analysisStage, matches, checkingMatches, language, t, onClose, onNext, onBack, onPublish, uploadRef, handleFile, publishing, processingImage, onOpenMatch } = props
  const stepTitles = [t('stepCategory'), t('stepPhoto'), t('stepAnalysis'), t('stepDetails'), t('stepPreview')]
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]) }
  return (
    <Modal onClose={onClose} label={stepTitles[step]} wide>
      <div className="wizard-shell">
        <header className="wizard-header">
          <div><span className="modal-kicker">{draft.kind === 'lost' ? t('lostAction') : t('foundAction')}</span><h2>{stepTitles[step]}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label={t('close')}><X /></button>
        </header>
        <div className="stepper" aria-label={`${step + 1} / 5`}>{[0, 1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? 'active' : ''} />)}</div>
        <div className="wizard-content">
          {step === 0 && <CategoryStep draft={draft} setDraft={setDraft} t={t} />}
          {step === 1 && (
            <div className="upload-step">
              {draft.category === 'documents' ? (
                <div className="privacy-banner document-photo-block"><ShieldCheck /><div><strong>{t('documentProtection')}</strong><p>{t('documentProtectionHint')}</p></div></div>
              ) : (
                <div className={`upload-zone ${draft.image ? 'has-image' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
                  {draft.image ? <img src={draft.image} alt="Preview" /> : <><span className="upload-icon"><Upload /></span><h3>{t('uploadHint')}</h3><p>JPG, PNG · 6 MB max</p></>}
                  <input ref={uploadRef} type="file" accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])} hidden />
                  <button className="button secondary" type="button" onClick={() => uploadRef.current?.click()} disabled={processingImage}><Camera /> {processingImage ? t('uploadingSecurely') : t('choosePhoto')}</button>
                </div>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="analysis-step">
              <div className="analysis-state"><span className="done"><Check /></span><div><h3>{t('analysisReady')}</h3><p>{t('editAnything')}</p></div></div>
              <div className="analysis-list">
                {[t('chooseCategory'), draft.category === 'documents' ? t('documentPhotoDisabled') : draft.image ? t('photoPrepared') : t('skipPhoto'), t('matchingAfterDetails')].map((label) => <div key={label} className="complete"><span><Check /></span>{label}</div>)}
              </div>
              <div className="match-preview method"><div className="match-preview-icon"><Sparkles /></div><div><strong>{t('lookingForMatches')}</strong><p>{t('matchingMethod')}</p></div></div>
            </div>
          )}
          {step === 3 && (
            <div className="details-form">
              <label className="field"><span>{t('title')} *</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('titlePlaceholder')} /></label>
              <label className="field"><span>{t('description')}</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('descriptionPlaceholder')} rows={3} /></label>
              <div className="field-row"><label className="field"><span>{t('where')} *</span><div className="input-with-icon"><MapPin /><input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder={t('wherePlaceholder')} /></div><small><LockKeyhole /> {t('exactLocationPrivate')}</small></label><label className="field"><span>{t('when')}</span><div className="input-with-icon"><CalendarDays /><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></div></label></div>
              <label className="toggle-field"><input type="checkbox" checked={draft.rewardEnabled} onChange={(event) => setDraft({ ...draft, rewardEnabled: event.target.checked })} /><span className="toggle" /><span><Coins /> {t('addReward')}</span></label>
              {draft.rewardEnabled && <label className="field reward-input"><span>{t('rewardAmount')}</span><input type="number" min="0" value={draft.reward} onChange={(event) => setDraft({ ...draft, reward: event.target.value })} placeholder="50" /></label>}
            </div>
          )}
          {step === 4 && <DraftPreview draft={draft} language={language} matches={matches} t={t} onOpenMatch={onOpenMatch} />}
        </div>
        <footer className="wizard-footer">
          <button className="button secondary" onClick={step === 0 ? onClose : onBack}>{step === 0 ? t('cancel') : t('back')}</button>
          {step < 4 ? <button className="button primary" onClick={onNext} disabled={(step === 2 && analysisStage < 4) || processingImage || checkingMatches}>{checkingMatches ? t('checkingMatches') : t('continue')} <ArrowLeft /></button> : <button className="button primary" onClick={onPublish} disabled={publishing}><CheckCircle2 /> {publishing ? t('publishingSecurely') : t('publish')}</button>}
        </footer>
      </div>
    </Modal>
  )
}

function CategoryStep({ draft, setDraft, t }: { draft: DraftCase; setDraft: PostWizardProps['setDraft']; t: (key: string) => string }) {
  return <div className="category-step"><p>{t('chooseCategory')}</p><div className="wizard-category-grid">{categoryIds.map((category) => { const Icon = categoryIcons[category]; return <button key={category} className={draft.category === category ? 'selected' : ''} onClick={() => setDraft({ ...draft, category })}><span><Icon /></span><strong>{t(category)}</strong>{draft.category === category ? <Check /> : null}</button> })}</div></div>
}

function DraftPreview({ draft, language, matches, t, onOpenMatch }: { draft: DraftCase; language: Language; matches: MatchCandidate[]; t: (key: string) => string; onOpenMatch: (item: CaseItem) => void }) {
  const Icon = draft.category ? categoryIcons[draft.category] : Package
  return <div className="draft-preview-layout"><div className="draft-preview"><div className="draft-image">{draft.image ? <img src={draft.image} alt="" /> : <Icon />}</div><div className="draft-copy"><StatusBadge status="open" kind={draft.kind} t={t} /><h3>{draft.title}</h3><p>{draft.description || t('descriptionPlaceholder')}</p><div><span><MapPin /> {draft.location}</span><span><CalendarDays /> {draft.date}</span></div>{draft.rewardEnabled && draft.reward ? <span className="reward-badge"><Coins /> {draft.reward} د.ت</span> : null}<div className="privacy-note"><ShieldCheck /> {t('exactLocationPrivate')}</div></div></div><CandidateList matches={matches} language={language} t={t} onOpen={onOpenMatch} empty /></div>
}

function CandidateList({ matches, language, t, onOpen, empty = false }: { matches: MatchCandidate[]; language: Language; t: (key: string) => string; onOpen: (item: CaseItem) => void; empty?: boolean }) {
  if (!matches.length) return empty ? <div className="candidate-empty"><CheckCircle2 /><div><strong>{t('noSuggestions')}</strong><p>{t('matchingMethod')}</p></div></div> : null
  return (
    <section className="candidate-section" aria-label={t('suggestedPosts')}>
      <div className="candidate-heading"><div><Sparkles /><span><strong>{t('suggestedPosts')}</strong><small>{t('notOwnershipProof')}</small></span></div><span>{matches.length}</span></div>
      <div className="candidate-list">
        {matches.map((match) => (
          <article className="candidate-card" key={match.id ?? `${match.relation}-${match.case.id}`}>
            <div className="candidate-score"><strong>{match.score}%</strong><small>{match.relation === 'possible_duplicate' ? t('possibleDuplicate') : t('possibleMatch')}</small></div>
            <div className="candidate-copy"><strong>{match.case.title[language]}</strong><span><MapPin /> {match.case.location[language]} · {match.case.date}</span><ul>{match.reasons.map((reason) => <li key={reason}><Check /> {t(matchReasonKeys[reason])}</li>)}</ul></div>
            <button type="button" className="button secondary" onClick={() => onOpen(match.case)}>{t('openSuggestion')} <ArrowLeft /></button>
          </article>
        ))}
      </div>
    </section>
  )
}

interface CaseDetailsProps {
  item: CaseItem
  language: Language
  t: (key: string) => string
  comments: CommentItem[]
  matches: MatchCandidate[]
  comment: string
  setComment: (value: string) => void
  addComment: (event: FormEvent) => void
  onClose: () => void
  onMessage: () => void
  onClaim: () => void
  onSave: () => void
  isOwner: boolean
  onMarkReturned: () => void
  onOpenMatch: (item: CaseItem) => void
  onReport: (target: ReportTarget) => void
}

function CaseDetails(props: CaseDetailsProps) {
  const { item, language, t, comments, matches, comment, setComment, addComment, onClose, onMessage, onClaim, onSave, isOwner, onMarkReturned, onOpenMatch, onReport } = props
  const strongestMatch = matches[0]
  return (
    <Modal onClose={onClose} label={item.title[language]} wide>
      <div className="case-details">
        <header className="case-detail-header">
          <span className="modal-kicker">L9-{item.id.slice(0, 6).toUpperCase()}</span>
          <div>{!isOwner ? <button className="report-link" onClick={() => onReport({ objectType: 'case', objectId: item.id })}><Flag /> {t('report')}</button> : null}<button className="icon-button" onClick={onClose} aria-label={t('close')}><X /></button></div>
        </header>
        <div className="case-detail-grid">
          <div className="case-gallery">
            {item.image ? <img src={item.image} alt={item.title[language]} decoding="async" /> : <div><ImagePlus /></div>}
            {item.source === 'facebook' ? <span className="source-badge">{t('imported')}</span> : null}
          </div>
          <div className="case-detail-copy">
            <div className="case-detail-badges">
              <StatusBadge status={item.status} kind={item.kind} t={t} />
              {item.reward ? <span className="reward-badge"><Coins /> {item.reward} د.ت</span> : null}
            </div>
            <h2>{item.title[language]}</h2>
            <div className="detail-meta"><span><MapPin /> {item.location[language]}</span><span><CalendarDays /> {item.date}</span></div>
            <p>{item.description[language]}</p>
            <div className="poster-row">
              <span className="poster-avatar">{item.author.initials}</span>
              <span><small>{t('postedBy')}</small><strong>{item.author.name} {item.author.verified ? <BadgeCheck /> : null}</strong></span>
              {!isOwner ? <button className="report-profile" onClick={() => onReport({ objectType: 'profile', objectId: item.author.id })}><MoreHorizontal /> {t('report')} {t('profile')}</button> : null}
            </div>
            {strongestMatch ? (
              <div className="why-match">
                <div className="match-score"><Sparkles /><strong>{strongestMatch.score}%</strong><span>{strongestMatch.relation === 'possible_duplicate' ? t('possibleDuplicate') : t('possibleMatch')}</span></div>
                <div><h3>{t('whyMatched')}</h3><ul>{strongestMatch.reasons.map((reason) => <li key={reason}><Check /> {t(matchReasonKeys[reason])}</li>)}</ul><p>{t('notOwnershipProof')}</p><button className="button secondary compact" onClick={() => onOpenMatch(strongestMatch.case)}>{t('openSuggestion')}</button></div>
              </div>
            ) : null}
            <div className="safety-callout"><ShieldCheck /><span>{t('safetyReminder')}</span></div>
            <div className="detail-actions">
              <button className="button primary" onClick={onMessage}><MessageCircle /> {t('contactPoster')}</button>
              {item.kind === 'found' ? <button className="button coral" onClick={onClaim}><LockKeyhole /> {t('claimItem')}</button> : null}
              <button className="icon-button bordered" onClick={onSave} aria-label={t('save')}><Heart fill={item.saved ? 'currentColor' : 'none'} /></button>
              {isOwner && item.status !== 'returned' && item.status !== 'resolved' ? <button className="button secondary" onClick={onMarkReturned}><CheckCircle2 /> {t('returned')}</button> : null}
            </div>
          </div>
        </div>
        <div className="detail-lower">
          <section className="timeline">
            <h3>{t('timeline')}</h3>
            <ol>
              <li className="done"><span /><div><strong>{t('reported')}</strong><small>{item.date}</small></div></li>
              {item.status === 'matching' ? <li className="active"><span /><div><strong>{t('matchDetected')}</strong><small>{t('today')}</small></div></li> : null}
              <li><span /><div><strong>{t('finderContacted')}</strong></div></li>
              <li><span /><div><strong>{t('ownershipVerified')}</strong></div></li>
            </ol>
          </section>
          <section className="comments-section">
            <h3>Comments · {item.comments}</h3>
            {comments.map((value) => <div className="comment" key={value.id}><span className="poster-avatar">{value.initials}</span><p>{value.body}</p>{!value.id.startsWith('pending-') ? <button className="comment-report" onClick={() => onReport({ objectType: 'comment', objectId: value.id })} aria-label={`${t('report')}: ${value.body}`}><Flag /></button> : null}</div>)}
            <form onSubmit={addComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t('messagePlaceholder')} /><button aria-label={t('send')}><Send /></button></form>
          </section>
        </div>
      </div>
    </Modal>
  )
}

function MessagesPage({ language, t, conversations, conversationId, selectConversation, messages, messageInput, setMessageInput, sendMessage, onReport }: { language: Language; t: (key: string) => string; conversations: ConversationItem[]; conversationId: string; selectConversation: (id: string) => void; messages: ChatMessage[]; messageInput: string; setMessageInput: (value: string) => void; sendMessage: (event: FormEvent) => void; onReport: (target: ReportTarget) => void }) {
  const current = conversations.find((item) => item.id === conversationId)
  return (
    <section className="messages-page page-container">
      <PageHeader title={t('messages')} />
      <div className="messages-layout">
        <aside className="conversation-list">
          <label><Search /><input placeholder={t('searchPlaceholder')} /></label>
          {conversations.map((item) => <button key={item.id} className={`conversation ${item.id === conversationId ? 'active' : ''}`} onClick={() => selectConversation(item.id)}><span className="poster-avatar">{item.participant_initials}</span><span><strong>{item.participant_name}</strong><small>{item.title[language]}</small></span><time>{formatMessageTime(item.updated_at)}</time></button>)}
          {!conversations.length ? <div className="conversation-empty">{t('inboxEmpty')}</div> : null}
        </aside>
        <section className="chat-thread">
          <header><span className="poster-avatar">{current?.participant_initials ?? 'L9'}</span><span><strong>{current ? `${t('conversationWith')} ${current.participant_name}` : t('messages')}</strong>{current ? <small>{t('regarding')}: {current.title[language]} · {current.location[language]}</small> : null}</span><button className="icon-button" aria-label={t('details')}><MoreHorizontal /></button></header>
          <div className="chat-safety"><ShieldCheck /> {t('safetyChat')}</div>
          <div className="message-stream" aria-live="polite">
            {messages.map((message) => <div key={message.id} className={`chat-bubble ${message.from} ${message.id.startsWith('pending-') ? 'pending' : ''}`}><p>{message.text}</p><time>{formatMessageTime(message.time)}</time>{message.from === 'them' ? <button className="message-report" onClick={() => onReport({ objectType: 'message', objectId: message.id })} aria-label={`${t('report')}: ${message.text}`}><Flag /></button> : null}</div>)}
          </div>
          <form className="message-composer" onSubmit={sendMessage}><button type="button" aria-label={t('choosePhoto')} disabled={!current}><ImagePlus /></button><input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} placeholder={t('messagePlaceholder')} disabled={!current} /><button aria-label={t('send')} disabled={!current}><Send /></button></form>
        </section>
      </div>
    </section>
  )
}

function ReportModal({ t, reason, setReason, details, setDetails, reporting, onClose, onSubmit }: { t: (key: string) => string; reason: ReportReason | ''; setReason: (value: ReportReason) => void; details: string; setDetails: (value: string) => void; reporting: boolean; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <Modal onClose={onClose} label={t('reportContent')}>
      <form className="report-form" onSubmit={onSubmit}>
        <div className="modal-title-row"><div><span className="modal-kicker">L9itha safety</span><h2><Flag /> {t('reportContent')}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label={t('close')}><X /></button></div>
        <p>{t('reportIntro')}</p>
        <fieldset><legend>{t('reportReason')} *</legend><div className="report-reasons">{reportOptions.map((option) => <button type="button" key={option.value} className={reason === option.value ? 'selected' : ''} onClick={() => setReason(option.value)}><span>{reason === option.value ? <Check /> : null}</span>{t(option.label)}</button>)}</div></fieldset>
        <label className="field"><span>{t('reportDetails')}</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={1000} /></label>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button coral" disabled={!reason || reporting}><Flag /> {reporting ? t('publishingSecurely') : t('submitReport')}</button></div>
      </form>
    </Modal>
  )
}

function NotificationsPage({ t, items, onOpenCase }: { t: (key: string) => string; items: NotificationItem[]; onOpenCase: (id: string) => void }) {
  const iconByType = { match: Sparkles, claim: LockKeyhole, comment: MessageCircle, nearby: MapPin }
  const titleByType = { match: 'notificationMatch', claim: 'notificationClaim', comment: 'notificationComment', nearby: 'notificationNearby' }
  return <section className="notifications-page page-container"><PageHeader title={t('notifications')} /><div className="notification-list">{items.length ? items.map((item) => { const Icon = iconByType[item.type] ?? Bell; return <button key={item.id} className={`notification-item priority-${item.priority}`} onClick={() => { if (item.case_id) onOpenCase(item.case_id) }}><span><Icon /></span><div><strong>{t(titleByType[item.type] ?? 'notifications')}</strong><small>{item.body}</small></div><ChevronLeft /></button> }) : <div className="empty-state"><div className="empty-icon"><Bell /></div><h2>{t('noResults')}</h2></div>}</div></section>
}

function ProfilePage({ language, t, cases, user, onOpen, onSettings, onSignOut }: { language: Language; t: (key: string) => string; cases: CaseItem[]; user: DemoUser | null; onOpen: (item: CaseItem) => void; onSettings: () => void; onSignOut: () => void }) {
  const name = user?.name ?? 'Yacine'
  const myCases = cases.filter((item) => item.author.id === user?.id)
  const activeCases = myCases.filter((item) => !['returned', 'resolved'].includes(item.status)).length
  const savedCount = cases.filter((item) => item.saved).length
  return <section className="profile-page page-container"><div className="profile-hero"><span className="profile-avatar">{user?.initials ?? 'YA'}</span><div><h1>{name}</h1><p><MapPin /> {user?.city ?? 'Tunis'} · {t('memberSince')}</p>{user?.verified !== false ? <span className="verified-pill"><BadgeCheck /> {t('verifiedAccount')}</span> : null}</div><div className="profile-actions"><button className="button secondary" onClick={onSettings}><Settings /> {t('settings')}</button><button className="button text" onClick={onSignOut}><LogOut /> {t('signOut')}</button></div></div><div className="profile-stats"><div><strong>{activeCases}</strong><span>{t('activeCases')}</span></div><div><strong>{user?.returns ?? 0}</strong><span>{t('successfulReturns')}</span></div><div><strong>{savedCount}</strong><span>{t('saved')}</span></div></div><PageHeader title={t('myCases')} />{myCases.length ? <div className="profile-case-list">{myCases.map((item) => <button key={item.id} onClick={() => onOpen(item)}>{item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : <Package />}<span><strong>{item.title[language]}</strong><small>{item.location[language]} · {item.timeAgo[language]}</small></span><StatusBadge status={item.status} kind={item.kind} t={t} /></button>)}</div> : <div className="empty-state"><div className="empty-icon"><Package /></div><h2>{t('noResults')}</h2><p>{t('noResultsHint')}</p></div>}</section>
}

function SavedPage({ language, t, cases, onOpen, onSave, navigate }: { language: Language; t: (key: string) => string; cases: CaseItem[]; onOpen: (item: CaseItem) => void; onSave: (id: string) => void; navigate: (page: Page) => void }) {
  return <section className="saved-page page-container"><PageHeader title={t('saved')} />{cases.length ? <div className="explore-grid">{cases.map((item) => <CaseCard key={item.id} item={item} language={language} t={t} onOpen={() => onOpen(item)} onSave={() => onSave(item.id)} />)}</div> : <div className="empty-state"><div className="empty-icon"><Heart /></div><h2>{t('noResults')}</h2><p>{t('noResultsHint')}</p><button className="button primary" onClick={() => navigate('explore')}>{t('explore')}</button></div>}</section>
}

function SettingsPage({ language, setLanguage, theme, setTheme, t }: { language: Language; setLanguage: (value: Language) => void; theme: 'light' | 'dark'; setTheme: (value: 'light' | 'dark') => void; t: (key: string) => string }) {
  const [settings, setSettings] = useState<Pick<UserSettings, 'verifiedOnly' | 'notifications'>>({ verifiedOnly: false, notifications: true })
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    let active = true
    api.getSettings().then((result) => {
      if (!active) return
      setSettings({ verifiedOnly: result.settings.verifiedOnly, notifications: result.settings.notifications })
    }).catch(() => { if (active) setSaveError(true) })
    return () => { active = false }
  }, [])

  const update = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setSaveError(false)
    api.updateSettings({ [key]: value }).catch(() => {
      setSettings((current) => ({ ...current, [key]: !value }))
      setSaveError(true)
    })
  }

  const chooseLanguage = (value: Language) => {
    setLanguage(value)
    void api.updateSettings({ language: value }).catch(() => setSaveError(true))
  }

  const chooseTheme = (value: 'light' | 'dark') => {
    setTheme(value)
    void api.updateSettings({ theme: value }).catch(() => setSaveError(true))
  }

  return <section className="settings-page page-container"><PageHeader title={t('settings')} />{saveError ? <p className="settings-error" role="alert">{t('syncFailed')}</p> : null}<div className="settings-grid"><section><h2><BookOpen /> {t('language')}</h2><div className="settings-options">{(Object.keys(languageNames) as Language[]).map((code) => <button key={code} className={language === code ? 'selected' : ''} onClick={() => chooseLanguage(code)}><span>{languageNames[code]}</span>{language === code ? <Check /> : null}</button>)}</div></section><section><h2><Sun /> {t('appearance')}</h2><div className="theme-picker"><button className={theme === 'light' ? 'selected' : ''} onClick={() => chooseTheme('light')}><Sun /> Light</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => chooseTheme('dark')}><Moon /> Dark</button></div></section><section><h2><ShieldCheck /> {t('privacy')}</h2><SettingToggle label={t('messagePermissions')} checked={settings.verifiedOnly} setChecked={(value) => update('verifiedOnly', value)} /><SettingToggle label={t('pushNotifications')} checked={settings.notifications} setChecked={(value) => update('notifications', value)} /></section></div></section>
}

function SettingToggle({ label, checked, setChecked }: { label: string; checked: boolean; setChecked: (value: boolean) => void }) {
  return <label className="setting-toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span className="toggle" /></label>
}

function InfoPage({ kind, t }: { kind: 'help' | 'rewards'; t: (key: string) => string }) {
  const isHelp = kind === 'help'
  return <section className="info-page page-container"><div className={`info-hero ${isHelp ? 'help' : 'rewards'}`}><span>{isHelp ? <ShieldCheck /> : <Coins />}</span><div><p>L9itha</p><h1>{t(isHelp ? 'helpTitle' : 'rewardsTitle')}</h1><p>{t(isHelp ? 'helpText' : 'rewardsText')}</p></div></div><div className="info-steps">{(isHelp ? [t('notOwnershipProof'), t('safetyReminder'), t('safetyChat')] : [t('rewardInfo'), t('exactLocationPrivate'), t('notOwnershipProof')]).map((item, index) => <article key={item}><span>0{index + 1}</span><CheckCircle2 /><p>{item}</p></article>)}</div></section>
}

function MobileNavigation({ page, t, navigate, onPost }: { page: Page; t: (key: string) => string; navigate: (page: Page) => void; onPost: () => void }) {
  return <nav className="mobile-bottom-nav" aria-label="Mobile navigation"><button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}><Home /><span>{t('home')}</span></button><button className={page === 'explore' ? 'active' : ''} onClick={() => navigate('explore')}><Search /><span>{t('search')}</span></button><button className="mobile-post" onClick={onPost}><span><Plus /></span><small>{t('post')}</small></button><button className={page === 'messages' ? 'active' : ''} onClick={() => navigate('messages')}><MessageCircle /><span>{t('messages')}</span></button><button className={page === 'profile' ? 'active' : ''} onClick={() => navigate('profile')}><User /><span>{t('profile')}</span></button></nav>
}

export default App
