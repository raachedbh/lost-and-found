import {
  ArrowRight,
  AtSign,
  Backpack,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheckBig,
  Eye,
  FileText,
  HeartHandshake,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  MapPin,
  Menu,
  Package,
  PawPrint,
  Phone,
  Plus,
  ScanText,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
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
  type FormEvent,
} from 'react'
import { categoryIds, languageNames, translations } from './data'
import type {
  CategoryId,
  ItemPost,
  Language,
  PostFormData,
  PostKind,
} from './types'

const categoryIcons: Record<CategoryId, LucideIcon> = {
  documents: FileText,
  keys: KeyRound,
  phones: Smartphone,
  wallets: WalletCards,
  bags: Backpack,
  pets: PawPrint,
  other: Package,
}

const categoryColors: Record<CategoryId, string> = {
  documents: 'peach',
  keys: 'blue',
  phones: 'lavender',
  wallets: 'mint',
  bags: 'yellow',
  pets: 'rose',
  other: 'stone',
}

const locations = ['Tunis', 'Ariana', 'Ben Arous', 'La Marsa', 'Sousse', 'Sfax', 'Nabeul']
type AppPage = 'home' | 'browse'

function pageFromHash(): AppPage {
  return window.location.hash.startsWith('#/browse') ? 'browse' : 'home'
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

function publicName(fullName?: string) {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return parts[0]
  return `${parts[0]} ${parts[1].slice(0, 1)}.`
}

function socialHref(network: 'facebook' | 'instagram', value: string) {
  const cleaned = value.trim()
  if (/^https?:\/\//i.test(cleaned)) return cleaned
  if (/^(?:www\.)?(?:facebook|instagram)\.com\//i.test(cleaned)) return `https://${cleaned}`
  const username = cleaned.replace(/^@/, '')
  return `https://${network}.com/${encodeURIComponent(username)}`
}

function getStoredPosts(): ItemPost[] {
  try {
    const saved = localStorage.getItem('l9itha-posts')
    return saved ? (JSON.parse(saved) as ItemPost[]) : []
  } catch {
    return []
  }
}

function extractLikelyName(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[|_~=]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const labelled = lines.find((line) =>
    /^(?:name|nom(?:\s+et\s+pr[eé]nom)?|pr[eé]nom|الاسم(?:\s+واللقب)?|اللقب)\s*[-:.]?\s*\S+/i.test(
      line,
    ),
  )

  if (labelled) {
    return labelled
      .replace(
        /^(?:name|nom(?:\s+et\s+pr[eé]nom)?|pr[eé]nom|الاسم(?:\s+واللقب)?|اللقب)\s*[-:.]?\s*/i,
        '',
      )
      .trim()
  }

  return (
    lines.find((line) => {
      const words = line.split(/\s+/)
      const letters = (line.match(/[A-Za-zÀ-ÿ\u0600-\u06ff]/g) ?? []).length
      return (
        words.length >= 2 &&
        words.length <= 5 &&
        line.length >= 5 &&
        line.length <= 48 &&
        !/\d/.test(line) &&
        letters / line.length > 0.65
      )
    }) ?? ''
  )
}

function App() {
  const [page, setPage] = useState<AppPage>(pageFromHash)
  const [language, setLanguage] = useState<Language>('en')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [postModal, setPostModal] = useState<PostKind | null>(null)
  const [selectedPost, setSelectedPost] = useState<ItemPost | null>(null)
  const [userPosts, setUserPosts] = useState<ItemPost[]>(getStoredPosts)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | PostKind>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | null>(null)
  const [toast, setToast] = useState('')
  const feedRef = useRef<HTMLElement>(null)

  const t = useCallback(
    (key: string) => translations[language][key] ?? translations.en[key] ?? key,
    [language],
  )

  useEffect(() => {
    document.documentElement.lang = language === 'tn' ? 'fr-TN' : language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    const handleHashChange = () => {
      setPage(pageFromHash())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('l9itha-posts', JSON.stringify(userPosts))
    } catch {
      // An image can exceed browser storage; the live session still keeps the post.
    }
  }, [userPosts])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const posts = userPosts

  const filteredPosts = useMemo(() => {
    const needle = normalize(query)
    return posts.filter((post) => {
      const text = normalize(
        [post.title, post.ownerName, post.description, post.location, t(post.category)].join(' '),
      )
      const matchesQuery = !needle || text.includes(needle)
      const matchesLocation = !location || normalize(post.location).includes(normalize(location))
      const matchesKind = kindFilter === 'all' || post.kind === kindFilter
      const matchesCategory = !categoryFilter || post.category === categoryFilter
      return matchesQuery && matchesLocation && matchesKind && matchesCategory
    })
  }, [categoryFilter, kindFilter, location, posts, query, t])

  const scrollToFeed = () => {
    setPage('browse')
    window.history.pushState(null, '', '#/browse')
    window.setTimeout(() => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  const runSearch = (event: FormEvent) => {
    event.preventDefault()
    scrollToFeed()
  }

  const selectCategory = (category: CategoryId) => {
    setCategoryFilter(categoryFilter === category ? null : category)
    scrollToFeed()
  }

  const addPost = (form: PostFormData) => {
    const post: ItemPost = {
      id: crypto.randomUUID(),
      kind: form.kind,
      category: form.category,
      title: form.title.trim() || t(form.kind === 'found' ? 'untitledFound' : 'untitledLost'),
      ownerName: form.ownerName.trim() || undefined,
      description: form.description.trim(),
      location: form.location.trim(),
      date: form.date || undefined,
      image: form.image,
      contactPhone: form.contactPhone.trim() || undefined,
      contactFacebook: form.contactFacebook.trim() || undefined,
      contactInstagram: form.contactInstagram.trim() || undefined,
      status: 'open',
      createdAt: form.date ? Date.parse(`${form.date}T23:59:59`) : 0,
    }
    setUserPosts((current) => [post, ...current])
    setPostModal(null)
    setToast(t('postPublished'))
    setQuery('')
    setLocation('')
    setKindFilter('all')
    setCategoryFilter(null)
    setPage('browse')
    window.history.pushState(null, '', '#/browse')
    window.setTimeout(() => feedRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const clearSearch = () => {
    setQuery('')
    setLocation('')
    setKindFilter('all')
    setCategoryFilter(null)
  }

  const openPostModal = (kind: PostKind) => {
    setPostModal(kind)
    setMobileNavOpen(false)
  }

  const goHome = () => {
    setPage('home')
    window.history.pushState(null, '', '#/')
    setMobileNavOpen(false)
  }

  const goBrowse = () => {
    setPage('browse')
    window.history.pushState(null, '', '#/browse')
    setMobileNavOpen(false)
  }

  const goHow = () => {
    goHome()
    window.setTimeout(() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#/" onClick={goHome} aria-label="L9itha home">
          <span className="brand-mark"><MapPin size={19} strokeWidth={2.6} /></span>
          <span className="brand-name">L9itha<span>.</span></span>
        </a>

        <nav className={`main-nav ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <button className={`nav-link ${page === 'browse' ? 'active' : ''}`} onClick={goBrowse}>{t('browse')}</button>
          <button className="nav-link" onClick={goHow}>{t('how')}</button>
          <button className="nav-lost" onClick={() => openPostModal('lost')}>{t('postLost')}</button>
          <button className="nav-found" onClick={() => openPostModal('found')}>
            <Plus size={18} /> {t('postFound')}
          </button>
        </nav>

        <div className="header-actions">
          <div className="language-picker">
            <button
              className="language-button"
              onClick={() => setLanguageOpen((open) => !open)}
              aria-expanded={languageOpen}
            >
              {language.toUpperCase()} <ChevronDown size={14} />
            </button>
            {languageOpen && (
              <div className="language-menu">
                {(Object.keys(languageNames) as Language[]).map((code) => (
                  <button
                    key={code}
                    className={language === code ? 'active' : ''}
                    onClick={() => {
                      setLanguage(code)
                      setLanguageOpen(false)
                    }}
                  >
                    <span>{languageNames[code]}</span>
                    {language === code && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="menu-button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="Open menu"
          >
            {mobileNavOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main id="top">
        {page === 'home' ? (
        <>
        <section className="hero-section">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> {t('heroEyebrow')}</div>
            <h1><span>{t('heroTitleA')}</span> {t('heroTitleB')}</h1>
            <p className="hero-lede">{t('heroText')}</p>

            <form className="hero-search" onSubmit={runSearch}>
              <label className="search-field">
                <Search size={21} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchPlaceholder')}
                />
              </label>
              <label className="location-field">
                <MapPin size={19} />
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  aria-label={t('location')}
                >
                  <option value="">{t('allTunisia')}</option>
                  {locations.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                <ChevronDown size={15} />
              </label>
              <button className="search-submit" type="submit">{t('search')} <ArrowRight size={18} /></button>
            </form>
            <div className="search-note">
              <span>{t('example')}</span>
            </div>
          </div>

          <div className="hero-visual community-visual" aria-hidden="true">
            <div className="community-center"><HeartHandshake size={64} strokeWidth={1.3} /></div>
            <div className="community-ring ring-a" />
            <div className="community-ring ring-b" />
            <span className="community-node node-search"><Search size={22} /></span>
            <span className="community-node node-pin"><MapPin size={22} /></span>
            <span className="community-node node-safe"><ShieldCheck size={22} /></span>
            <div className="safe-float"><ShieldCheck size={21} /><span>{t('safetyTitle')}</span></div>
          </div>
        </section>

        <section className="category-section section-wrap" aria-labelledby="category-title">
          <div className="section-heading">
            <div><span className="kicker">01 — {t('categories')}</span><h2 id="category-title">{t('categories')}</h2></div>
            <p>{t('categoriesText')}</p>
          </div>
          <div className="category-grid">
            {categoryIds.map((category) => {
              const Icon = categoryIcons[category]
              const count = posts.filter((post) => post.category === category).length
              return (
                <button
                  key={category}
                  className={`category-card ${categoryFilter === category ? 'selected' : ''}`}
                  onClick={() => selectCategory(category)}
                >
                  <span className={`category-icon ${categoryColors[category]}`}><Icon size={25} /></span>
                  <span><strong>{t(category)}</strong><small>{count} posts</small></span>
                  <ArrowRight size={17} />
                </button>
              )
            })}
          </div>
        </section>

        <section className="how-section section-wrap" id="how" aria-labelledby="how-title">
          <div className="how-intro">
            <span className="kicker">03 — {t('how')}</span>
            <h2 id="how-title">{t('how')}</h2>
          </div>
          <div className="steps-grid">
            <article><span>01</span><div className="step-icon"><Upload /></div><h3>{t('stepOne')}</h3><p>{t('stepOneText')}</p></article>
            <article><span>02</span><div className="step-icon"><Search /></div><h3>{t('stepTwo')}</h3><p>{t('stepTwoText')}</p></article>
            <article><span>03</span><div className="step-icon"><HeartHandshake /></div><h3>{t('stepThree')}</h3><p>{t('stepThreeText')}</p></article>
          </div>

          <div className="safety-banner">
            <div className="safety-icon"><ShieldCheck /></div>
            <div><h3>{t('safetyTitle')}</h3><p>{t('safetyText')}</p></div>
            <div className="redaction-demo"><span /><span /><span className="black" /></div>
          </div>
        </section>

        <section className="cta-section section-wrap">
          <div className="cta-panel">
            <div className="cta-pin"><MapPin /></div>
            <div><span className="kicker">L9itha community</span><h2>{t('ctaTitle')}</h2><p>{t('ctaText')}</p></div>
            <button onClick={() => openPostModal('found')}><Plus size={19} /> {t('postFound')}</button>
          </div>
        </section>
        </>
        ) : (
        <div className="browse-page">
          <section className="browse-hero">
            <div className="section-wrap browse-hero-inner">
              <div className="eyebrow"><Search size={15} /> {t('findEyebrow')}</div>
              <h1>{t('findTitle')}</h1>
              <p>{t('findText')}</p>
              <form className="browse-search" onSubmit={runSearch}>
                <label className="search-field">
                  <Search size={22} />
                  <div>
                    <span>{t('searchHelp')}</span>
                    <input
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t('searchPlaceholder')}
                      aria-label={t('searchPlaceholder')}
                    />
                  </div>
                </label>
                <label className="location-field">
                  <MapPin size={19} />
                  <select value={location} onChange={(event) => setLocation(event.target.value)} aria-label={t('location')}>
                    <option value="">{t('allTunisia')}</option>
                    {locations.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                  <ChevronDown size={15} />
                </label>
                <button className="search-submit" type="submit">{t('search')} <ArrowRight size={18} /></button>
              </form>
              <div className="browse-actions">
                <span>{t('example')}</span>
                <button onClick={() => openPostModal('lost')}><Plus size={17} /> {t('postLost')}</button>
              </div>
            </div>
          </section>

          <section className="items-section browse-results" id="items" ref={feedRef} aria-labelledby="latest-title">
            <div className="section-wrap">
              <div className="results-topline">
                <div>
                  <span className="kicker">{t('browse')}</span>
                  <h2 id="latest-title">{filteredPosts.length} {t('results')}</h2>
                </div>
                <button className="new-found-button" onClick={() => openPostModal('found')}><Plus size={17} /> {t('postFound')}</button>
              </div>

              <div className="browse-category-row" aria-label={t('categories')}>
                <button className={!categoryFilter ? 'active' : ''} onClick={() => setCategoryFilter(null)}><Package size={17} /> {t('all')}</button>
                {categoryIds.map((category) => {
                  const Icon = categoryIcons[category]
                  return <button key={category} className={categoryFilter === category ? 'active' : ''} onClick={() => setCategoryFilter(category)}><Icon size={17} /> {t(category)}</button>
                })}
              </div>

              <div className="filter-bar">
                <div className="filter-tabs">
                  {(['all', 'found', 'lost'] as const).map((kind) => (
                    <button key={kind} className={kindFilter === kind ? 'active' : ''} onClick={() => setKindFilter(kind)}>{t(kind)}</button>
                  ))}
                </div>
                {(query || location || categoryFilter || kindFilter !== 'all') && (
                  <button className="clear-filter" onClick={clearSearch}><X size={14} /> {t('clearSearch')}</button>
                )}
              </div>

              {filteredPosts.length ? (
                <div className="item-grid">
                  {filteredPosts.map((post) => <ItemCard key={post.id} post={post} t={t} language={language} onOpen={setSelectedPost} />)}
                </div>
              ) : (
                <div className="empty-state real-empty-state">
                  <span><Search size={28} /></span>
                  <h3>{posts.length ? t('noResults') : t('noPosts')}</h3>
                  <p>{posts.length ? t('noResultsText') : t('noPostsText')}</p>
                  {posts.length ? <button onClick={clearSearch}>{t('clearSearch')}</button> : <button onClick={() => openPostModal('found')}>{t('firstPost')}</button>}
                </div>
              )}
            </div>
          </section>
        </div>
        )}
      </main>

      <footer className="site-footer section-wrap">
        <div className="footer-brand">
          <a className="brand" href="#/" onClick={goHome}><span className="brand-mark"><MapPin size={19} /></span><span className="brand-name">L9itha<span>.</span></span></a>
          <p>{t('footerText')}</p>
        </div>
        <div className="footer-links"><button onClick={goBrowse}>{t('browse')}</button><button onClick={goHow}>{t('how')}</button><button onClick={() => openPostModal('found')}>{t('postFound')}</button></div>
        <small>© 2026 L9itha · Made with care in Tunisia 🇹🇳</small>
      </footer>

      {postModal && (
        <PostModal
          initialKind={postModal}
          t={t}
          onClose={() => setPostModal(null)}
          onSubmit={addPost}
        />
      )}

      {selectedPost && (
        <DetailModal
          post={selectedPost}
          language={language}
          t={t}
          onClose={() => setSelectedPost(null)}
          onClaim={() => {
            setSelectedPost(null)
            setToast(t('claimSent'))
          }}
        />
      )}

      {toast && <div className="toast"><CircleCheckBig size={19} /> {toast}</div>}
    </div>
  )
}

interface ItemCardProps {
  post: ItemPost
  language: Language
  t: (key: string) => string
  onOpen: (post: ItemPost) => void
}

function ItemCard({ post, language, t, onOpen }: ItemCardProps) {
  const Icon = categoryIcons[post.category]
  const locale = language === 'ar' ? 'ar-TN' : language === 'fr' || language === 'tn' ? 'fr-TN' : 'en-GB'
  const date = post.date
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(post.date))
    : ''

  return (
    <article className={`item-card ${post.status === 'returned' ? 'is-returned' : ''}`}>
      <button className="item-open-area" onClick={() => onOpen(post)} aria-label={`${t('openItem')}: ${post.title}`}>
        <div className={`item-image ${categoryColors[post.category]}`}>
          {post.image ? <img src={post.image} alt="" /> : (
            <div className="item-placeholder">
              <Icon size={48} strokeWidth={1.45} />
              {post.category === 'documents' && <span className="privacy-stripe">PRIVATE</span>}
            </div>
          )}
          <span className={`item-kind ${post.kind}`}><span /> {t(post.kind)}</span>
          {post.status === 'returned' && <span className="returned-stamp"><CircleCheckBig size={15} /> {t('returned')}</span>}
        </div>
        <div className="item-body">
          <div className="item-meta"><span>{t(post.category)}</span>{date && <><span>·</span><time>{date}</time></>}</div>
          <h3>{post.ownerName ? publicName(post.ownerName) : post.title}</h3>
          {post.ownerName && <p className="item-subtitle">{post.title}</p>}
          {post.location && <p className="item-location"><MapPin size={15} /> {post.location}</p>}
          <span className="details-link">{t('openItem')} <ArrowRight size={16} /></span>
        </div>
      </button>
    </article>
  )
}

interface PostModalProps {
  initialKind: PostKind
  t: (key: string) => string
  onClose: () => void
  onSubmit: (form: PostFormData) => void
}

function PostModal({ initialKind, t, onClose, onSubmit }: PostModalProps) {
  const [form, setForm] = useState<PostFormData>({
    kind: initialKind,
    category: 'other',
    title: '',
    ownerName: '',
    description: '',
    location: '',
    date: new Date().toISOString().slice(0, 10),
    contactPhone: '',
    contactFacebook: '',
    contactInstagram: '',
    privacyConfirmed: false,
  })
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const setField = <K extends keyof PostFormData>(field: K, value: PostFormData[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
  }

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 6 * 1024 * 1024) {
      setError(t('photoTooLarge'))
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => setField('image', String(reader.result))
    reader.readAsDataURL(file)
  }

  const scanName = async () => {
    if (!form.image || scanning) return
    setScanning(true)
    setScanProgress(0)
    setError('')
    try {
      const Tesseract = await import('tesseract.js')
      const result = await Tesseract.recognize(form.image, 'eng+fra+ara', {
        logger: (message) => {
          if (message.status === 'recognizing text') setScanProgress(Math.round((message.progress ?? 0) * 100))
        },
      })
      const name = extractLikelyName(result.data.text)
      if (name) setField('ownerName', name)
      else setError(t('ocrFailed'))
    } catch {
      setError(t('ocrFailed'))
    } finally {
      setScanning(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(form)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal post-modal" role="dialog" aria-modal="true" aria-labelledby="post-modal-title">
        <div className="modal-header">
          <div><span className="modal-kicker">L9itha</span><h2 id="post-modal-title">{t('createPost')}</h2><p>{t('editLater')}</p></div>
          <button className="modal-close" onClick={onClose} aria-label={t('close')}><X /></button>
        </div>

        <form onSubmit={submit}>
          <fieldset className="form-section">
            <legend>{t('whatHappened')}</legend>
            <div className="kind-selector">
              <button type="button" className={form.kind === 'found' ? 'active found' : ''} onClick={() => setField('kind', 'found')}><BadgeCheck size={19} /> {t('postFound')}</button>
              <button type="button" className={form.kind === 'lost' ? 'active lost' : ''} onClick={() => setField('kind', 'lost')}><Search size={19} /> {t('postLost')}</button>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>{t('itemCategory')}</legend>
            <div className="modal-categories">
              {categoryIds.map((category) => {
                const Icon = categoryIcons[category]
                return <button type="button" key={category} className={form.category === category ? 'active' : ''} onClick={() => setField('category', category)}><Icon size={20} /><span>{t(category)}</span></button>
              })}
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>{t('addPhoto')} <span className="optional">{t('optional')}</span></legend>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto} hidden />
            {form.image ? (
              <div className="photo-preview">
                <img src={form.image} alt="Preview" />
                <button type="button" onClick={() => fileRef.current?.click()}><ImagePlus size={17} /> {t('changePhoto')}</button>
              </div>
            ) : (
              <button type="button" className="photo-upload" onClick={() => fileRef.current?.click()}>
                <span><ImagePlus /></span><strong>{t('choosePhoto')}</strong><small>{t('photoHint')}</small>
              </button>
            )}
          </fieldset>

          {form.category === 'documents' && (
            <div className="privacy-box">
              <ShieldCheck size={23} />
              <div><strong>{t('documentSafety')}</strong><p>{t('documentSafetyText')}</p>
                <label className="confirm-check"><input type="checkbox" checked={form.privacyConfirmed} onChange={(event) => setField('privacyConfirmed', event.target.checked)} /><span><Check size={13} /></span>{t('confirmPrivacy')}</label>
              </div>
            </div>
          )}

          {form.category === 'documents' && form.image && (
            <div className="scan-row">
              <button type="button" onClick={scanName} disabled={scanning}>
                {scanning ? <LoaderCircle className="spin" size={18} /> : <ScanText size={18} />}
                {scanning ? `${t('scanning')} ${scanProgress}%` : t('scanName')}
              </button>
              <small>{t('scanHint')}</small>
            </div>
          )}

          <div className="field-grid">
            {form.category === 'documents' && (
              <label className="full-field"><span>{t('nameOnItem')}</span><input value={form.ownerName} onChange={(event) => setField('ownerName', event.target.value)} placeholder={t('namePlaceholder')} /><small>{t('nameHelp')}</small></label>
            )}
            <label className="full-field"><span>{t('itemTitle')} <em>{t('optional')}</em></span><input value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder={t('titlePlaceholder')} /></label>
            <label className="full-field"><span>{t('description')} <em>{t('optional')}</em></span><textarea value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder={t('descriptionPlaceholder')} rows={3} /></label>
            <label><span>{t('where')} <em>{t('optional')}</em></span><div className="input-icon"><MapPin size={17} /><input value={form.location} onChange={(event) => setField('location', event.target.value)} placeholder={t('locationPlaceholder')} /></div></label>
            <label><span>{t('when')} <em>{t('optional')}</em></span><div className="input-icon"><CalendarDays size={17} /><input type="date" value={form.date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setField('date', event.target.value)} /></div></label>
          </div>

          <section className="contact-fields">
            <div className="contact-fields-heading">
              <div className="contact-icon"><Phone size={19} /></div>
              <div><h3>{t('contactHeading')}</h3><p>{t('contactHelp')}</p></div>
            </div>
            <div className="contact-inputs">
              <label><span>{t('phone')} <em>{t('optional')}</em></span><div className="input-icon"><Phone size={16} /><input type="tel" value={form.contactPhone} onChange={(event) => setField('contactPhone', event.target.value)} placeholder="+216 00 000 000" /></div></label>
              <label><span>{t('facebook')} <em>{t('optional')}</em></span><div className="input-icon"><AtSign size={16} /><input value={form.contactFacebook} onChange={(event) => setField('contactFacebook', event.target.value)} placeholder="facebook.com/name" /></div></label>
              <label><span>{t('instagram')} <em>{t('optional')}</em></span><div className="input-icon"><AtSign size={16} /><input value={form.contactInstagram} onChange={(event) => setField('contactInstagram', event.target.value)} placeholder="@username" /></div></label>
            </div>
          </section>

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('cancel')}</button><button type="submit" className="primary-button"><Upload size={18} /> {t('publish')}</button></div>
        </form>
      </section>
    </div>
  )
}

interface DetailModalProps {
  post: ItemPost
  language: Language
  t: (key: string) => string
  onClose: () => void
  onClaim: () => void
}

function DetailModal({ post, language, t, onClose, onClaim }: DetailModalProps) {
  const [claimOpen, setClaimOpen] = useState(false)
  const [proof, setProof] = useState('')
  const [contact, setContact] = useState('')
  const Icon = categoryIcons[post.category]
  const locale = language === 'ar' ? 'ar-TN' : language === 'fr' || language === 'tn' ? 'fr-TN' : 'en-GB'
  const date = post.date
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(post.date))
    : t('notProvided')
  const hasPublicContact = Boolean(post.contactPhone || post.contactFacebook || post.contactInstagram)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const submitClaim = (event: FormEvent) => {
    event.preventDefault()
    if (proof.trim() && contact.trim()) onClaim()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal detail-modal" role="dialog" aria-modal="true">
        <button className="modal-close floating" onClick={onClose} aria-label={t('close')}><X /></button>
        <div className={`detail-image ${categoryColors[post.category]}`}>
          {post.image ? <img src={post.image} alt="" /> : <Icon size={82} strokeWidth={1.25} />}
          {post.category === 'documents' && !post.image && <span className="privacy-stripe large">PRIVATE DETAILS HIDDEN</span>}
          <span className={`item-kind ${post.kind}`}><span /> {t(post.kind)}</span>
        </div>
        <div className="detail-content">
          <span className="detail-category">{t(post.category)}</span>
          <h2>{post.ownerName ? publicName(post.ownerName) : post.title}</h2>
          {post.ownerName && <p className="detail-subtitle">{post.title}</p>}
          {post.description && <p className="detail-description">{post.description}</p>}
          <dl className="detail-facts">
            <div><dt><MapPin size={17} /> {t('location')}</dt><dd>{post.location || t('notProvided')}</dd></div>
            <div><dt><CalendarDays size={17} /> {t('date')}</dt><dd>{date}</dd></div>
          </dl>
          {hasPublicContact && (
            <div className="public-contact-card">
              <h3>{t(post.kind === 'found' ? 'contactFinder' : 'contactPoster')}</h3>
              <div>
                {post.contactPhone && <a href={`tel:${post.contactPhone.replace(/\s/g, '')}`}><Phone size={16} /><span>{post.contactPhone}</span></a>}
                {post.contactFacebook && <a href={socialHref('facebook', post.contactFacebook)} target="_blank" rel="noreferrer"><AtSign size={16} /><span>Facebook</span></a>}
                {post.contactInstagram && <a href={socialHref('instagram', post.contactInstagram)} target="_blank" rel="noreferrer"><AtSign size={16} /><span>Instagram</span></a>}
              </div>
            </div>
          )}
          <div className="safe-note"><ShieldCheck size={18} /><span>{t('safeReminder')}</span></div>

          {!claimOpen ? (
            <button className="claim-button" onClick={() => setClaimOpen(true)} disabled={post.status === 'returned'}><Eye size={19} /> {post.status === 'returned' ? t('returned') : t(post.kind === 'lost' ? 'foundThis' : 'claimThis')}</button>
          ) : (
            <form className="claim-form" onSubmit={submitClaim}>
              <h3>{t('claimTitle')}</h3><p>{t('claimText')}</p>
              <textarea required value={proof} onChange={(event) => setProof(event.target.value)} placeholder={t('proofPlaceholder')} rows={3} />
              <input required value={contact} onChange={(event) => setContact(event.target.value)} placeholder={t('yourContact')} />
              <button type="submit"><Send size={17} /> {t('sendClaim')}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}

export default App
