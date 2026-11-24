import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import {
  ApiError,
  fetchArticleDetail,
  fetchArticles,
  fetchProjects,
  fetchSiteOverview,
  type ArticleDetail,
  type ArticleSummary,
  type ProjectItem,
  type SiteOverview,
} from '../../api/client'
import { ArticleDialog } from '../../components/ArticleDialog/ArticleDialog'
import { MessageDialog } from '../../components/MessageDialog/MessageDialog'
import { ModuleMenu } from '../../components/ModuleMenu/ModuleMenu'
import { ModulePanel } from '../../components/ModulePanel/ModulePanel'
import { ScrollSheet } from '../../components/ScrollSheet/ScrollSheet'
import { MODULE_IDS, isModuleId, moduleIndex, type ModuleId } from '../../config/modules'
import {
  QUALITY_LABELS,
  autoQuality,
  loadSavedQuality,
  saveQuality,
  type QualityLevel,
} from '../../config/quality'
import {
  resolveScheme,
  subscribeThemeChanges,
  syncSchemeMeta,
  toggleThemeScheme,
  type ThemeScheme,
} from '../../config/theme'
import './HomePage.scss'

// three 体积较大，拆成独立 chunk，首帧由「入夜」加载提示兜住
const Scene = lazy(() => import('../../components/Scene/Scene').then((m) => ({ default: m.Scene })))

const initialModule = (): ModuleId => {
  const hash = window.location.hash.slice(1)
  return isModuleId(hash) ? hash : 'home'
}

const initialQuality = (): QualityLevel => loadSavedQuality() ?? autoQuality()

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function HomePage() {
  const [module, setModule] = useState<ModuleId>(initialModule)
  const [quality, setQuality] = useState<QualityLevel>(initialQuality)
  const [theme, setTheme] = useState<ThemeScheme>(() => resolveScheme())
  const [fallback, setFallback] = useState(false)

  // 实时后端数据（无静态兜底）
  const [site, setSite] = useState<SiteOverview | null>(null)
  const [articles, setArticles] = useState<ArticleSummary[]>([])
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // 古卷文章详情弹窗状态
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [articleDetail, setArticleDetail] = useState<ArticleDetail | null>(null)
  const [articleLoading, setArticleLoading] = useState(false)
  const [articleError, setArticleError] = useState<string | null>(null)
  const [articleTick, setArticleTick] = useState(0)

  // 飞鸽传书留言弹窗状态
  const [messageOpen, setMessageOpen] = useState(false)

  const wheelLockRef = useRef(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const modalOpen = activeSlug !== null || messageOpen

  const retryAllData = () => {
    setDataLoading(true)
    setDataError(null)
    setReloadTick((n) => n + 1)
  }

  useEffect(() => {
    const ac = new AbortController()
    Promise.all([
      fetchSiteOverview(ac.signal),
      fetchArticles({ page: 1, size: 6 }, ac.signal),
      fetchProjects(ac.signal),
    ])
      .then(([siteRes, articleRes, projectRes]) => {
        if (ac.signal.aborted) return
        setSite(siteRes)
        setArticles(articleRes.records)
        setProjects(projectRes)
        setDataError(null)
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        setDataError(err instanceof ApiError ? err.message : '后端数据加载失败')
      })
      .finally(() => {
        if (!ac.signal.aborted) setDataLoading(false)
      })
    return () => ac.abort()
  }, [reloadTick])

  // 动态同步页面标题
  useEffect(() => {
    if (site?.site.name) {
      document.title = site.site.subtitle ? `${site.site.name} · ${site.site.subtitle}` : site.site.name
    }
  }, [site])

  // 打开某篇古卷文章：事件里先重置状态，由 effect 异步拉取正文并触发后端 Redis 阅读量统计
  const openArticle = (slug: string) => {
    setActiveSlug(slug)
    setArticleLoading(true)
    setArticleError(null)
    setArticleDetail(null)
  }

  const retryArticle = () => {
    if (!activeSlug) return
    setArticleLoading(true)
    setArticleError(null)
    setArticleDetail(null)
    setArticleTick((n) => n + 1)
  }

  useEffect(() => {
    if (!activeSlug) return
    const ac = new AbortController()
    fetchArticleDetail(activeSlug, ac.signal)
      .then((detail) => {
        if (ac.signal.aborted) return
        setArticleDetail(detail)
        setArticles((prev) =>
          prev.map((a) => (a.slug === detail.slug ? { ...a, viewCount: detail.viewCount } : a)),
        )
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        setArticleError(err instanceof ApiError ? err.message : '文章加载失败')
      })
      .finally(() => {
        if (!ac.signal.aborted) setArticleLoading(false)
      })
    return () => ac.abort()
  }, [activeSlug, articleTick])

  const stepModule = (delta: 1 | -1) => {
    setModule((cur) => {
      const n = MODULE_IDS.length
      return MODULE_IDS[(moduleIndex(cur) + delta + n) % n]
    })
  }

  // 把当前模块记到 hash 上
  useEffect(() => {
    const hash = module === 'home' ? '' : `#${module}`
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash || window.location.pathname + window.location.search)
    }
  }, [module])

  // 响应地址栏 hash 变化
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.slice(1)
      setModule(isModuleId(next) ? next : 'home')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // 键盘：← → 切换，1 ~ 5 直达（弹窗打开或聚焦输入框时不抢按键）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen || e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        stepModule(e.key === 'ArrowRight' ? 1 : -1)
      } else if (/^[1-5]$/.test(e.key)) {
        setModule(MODULE_IDS[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  // 滚轮与触屏横滑切换章节（弹窗打开时让位给正文滚动）
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (modalOpen) return
      const dominant = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(dominant) < 28) return
      const now = performance.now()
      if (now - wheelLockRef.current < 650) return
      wheelLockRef.current = now
      stepModule(dominant > 0 ? 1 : -1)
    }
    const onTouchStart = (e: TouchEvent) => {
      if (modalOpen || e.touches.length !== 1) return
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStartRef.current
      touchStartRef.current = null
      if (!start || modalOpen || e.changedTouches.length !== 1) return
      const dx = e.changedTouches[0].clientX - start.x
      const dy = e.changedTouches[0].clientY - start.y
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        stepModule(dx < 0 ? 1 : -1)
      }
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [modalOpen])

  const pickQuality = (q: QualityLevel) => {
    setQuality(q)
    saveQuality(q)
  }

  const handleToggleTheme = () => {
    setTheme(toggleThemeScheme())
  }

  useEffect(() => {
    // 首次挂载同步 theme-color meta，并监听系统昼夜偏好及跨标签页切换
    try {
      const stored = window.localStorage.getItem('color-scheme')
      syncSchemeMeta(stored === 'light' || stored === 'dark' ? stored : null)
    } catch {
      syncSchemeMeta(null)
    }
    return subscribeThemeChanges(setTheme)
  }, [])

  return (
    <main className="home" data-stage>
      <header className="home__brand" data-float="4">
        <span className="home__seal" aria-hidden="true">
          <img src="/favicon.svg?v=2" alt="" className="home__seal-img" width={30} height={30} />
        </span>
        <span className="home__brand-name">{site?.site.nameEn ?? ''}</span>
      </header>

      <div className="home__side" data-float="4">
        <p className="home__hint">← → / 滚轮 切换页面 · 点击日月切换昼夜</p>
        <div className="home__controls">
          <button
            type="button"
            className="home__theme-btn"
            onClick={handleToggleTheme}
            title={theme === 'dark' ? '切换至黎明场景（也可直接点击月亮）' : '切换至黑夜场景（也可直接点击太阳）'}
          >
            <span className="home__theme-opt home__theme-opt--light">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              <span>黎明</span>
              <span className="sr-only">，点击切换为黑夜模式</span>
            </span>
            <span className="home__theme-opt home__theme-opt--dark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span>黑夜</span>
              <span className="sr-only">，点击切换为黎明模式</span>
            </span>
          </button>

          <div className="home__quality" role="group" aria-label="画质档位">
            {(Object.keys(QUALITY_LABELS) as QualityLevel[]).map((q) => (
              <button
                key={q}
                type="button"
                className={cn('home__quality-btn', { 'is-active': quality === q })}
                aria-label={`画质：${QUALITY_LABELS[q]}`}
                aria-pressed={quality === q}
                onClick={() => pickQuality(q)}
              >
                {QUALITY_LABELS[q]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ModulePanel
        active={module}
        fallback={fallback}
        site={site}
        articles={articles}
        projects={projects}
        loading={dataLoading}
        error={dataError}
        onRetry={retryAllData}
        onOpenArticle={openArticle}
        onOpenMessage={() => setMessageOpen(true)}
      />

      {!fallback && (
        <ScrollSheet
          articles={articles}
          loading={dataLoading}
          error={dataError}
          onRetry={retryAllData}
          onOpenArticle={openArticle}
        />
      )}

      <ModuleMenu active={module} onSelect={setModule} />

      <div className="home__shade" />

      {/* 放在最后：它的 effect 最后执行，此时上面的 UI 与古卷 DOM 节点都已就位 */}
      <Suspense fallback={null}>
        <Scene
          module={module}
          quality={quality}
          theme={theme}
          onSelectModule={setModule}
          onToggleTheme={handleToggleTheme}
          onFallbackChange={setFallback}
        />
      </Suspense>

      <ArticleDialog
        open={activeSlug !== null}
        article={articleDetail}
        loading={articleLoading}
        error={articleError}
        onRetry={retryArticle}
        onClose={() => {
          setActiveSlug(null)
          setArticleDetail(null)
          setArticleError(null)
        }}
      />

      <MessageDialog open={messageOpen} onClose={() => setMessageOpen(false)} />
    </main>
  )
}
