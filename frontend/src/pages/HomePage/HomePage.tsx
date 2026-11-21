import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import cn from 'classnames'
import { ArticleDialog } from '../../components/ArticleDialog/ArticleDialog'
import { ModuleMenu } from '../../components/ModuleMenu/ModuleMenu'
import { ModulePanel } from '../../components/ModulePanel/ModulePanel'
import { ScrollSheet } from '../../components/ScrollSheet/ScrollSheet'
import {
  MODULES,
  MODULE_IDS,
  SITE,
  isModuleId,
  moduleIndex,
  type ArticleItem,
  type ModuleId,
} from '../../config/modules'
import {
  QUALITY_LABELS,
  autoQuality,
  loadSavedQuality,
  saveQuality,
  type QualityLevel,
} from '../../config/quality'
import './HomePage.scss'

// three 体积较大，拆成独立 chunk，首帧由「入夜」加载提示兜住
const Scene = lazy(() => import('../../components/Scene/Scene').then((m) => ({ default: m.Scene })))

const BLOG_ARTICLES = MODULES.find((m) => m.id === 'blog')?.articles ?? []

const initialModule = (): ModuleId => {
  const hash = window.location.hash.slice(1)
  return isModuleId(hash) ? hash : 'home'
}

const initialQuality = (): QualityLevel => loadSavedQuality() ?? autoQuality()

export function HomePage() {
  const [module, setModule] = useState<ModuleId>(initialModule)
  const [quality, setQuality] = useState<QualityLevel>(initialQuality)
  const [ready, setReady] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [article, setArticle] = useState<ArticleItem | null>(null)
  const wheelLockRef = useRef(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

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

  // 键盘：← → 切换，1 ~ 5 直达（阅读弹窗打开时不抢键盘）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (article || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        stepModule(e.key === 'ArrowRight' ? 1 : -1)
      } else if (/^[1-5]$/.test(e.key)) {
        setModule(MODULE_IDS[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [article])

  // 滚轮与触屏横滑切换章节（阅读弹窗打开时让位给正文滚动）
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (article) return
      const dominant = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(dominant) < 28) return
      const now = performance.now()
      if (now - wheelLockRef.current < 650) return
      wheelLockRef.current = now
      stepModule(dominant > 0 ? 1 : -1)
    }
    const onTouchStart = (e: TouchEvent) => {
      if (article || e.touches.length !== 1) return
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStartRef.current
      touchStartRef.current = null
      if (!start || article || e.changedTouches.length !== 1) return
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
  }, [article])

  const pickQuality = (q: QualityLevel) => {
    setQuality(q)
    saveQuality(q)
  }

  return (
    <main className="home" data-stage>
      <header className="home__brand" data-float="4">
        <span className="home__seal">{SITE.name.slice(0, 1)}</span>
        <span className="home__brand-name">{SITE.nameEn}</span>
      </header>

      <div className="home__side" data-float="4">
        <p className="home__hint">← → / 滚轮 切换章节</p>
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

      <ModulePanel active={module} fallback={fallback} onOpenArticle={setArticle} />
      {!fallback && BLOG_ARTICLES.length > 0 && (
        <ScrollSheet articles={BLOG_ARTICLES} onOpenArticle={setArticle} />
      )}
      <ModuleMenu active={module} onSelect={setModule} />

      <div className="home__shade" />

      {/* 放在最后：它的 effect 最后执行，此时上面的 UI 与古卷 DOM 节点都已就位 */}
      <Suspense fallback={null}>
        <Scene
          module={module}
          quality={quality}
          onReady={() => setReady(true)}
          onSelectModule={setModule}
          onFallbackChange={setFallback}
        />
      </Suspense>

      <ArticleDialog article={article} onClose={() => setArticle(null)} />

      {/* WebGL 首帧前的极简加载提示，就绪后淡出 */}
      <div className={cn('home__boot', { 'is-done': ready })} aria-hidden="true">
        <span className="home__boot-text">入夜</span>
      </div>
    </main>
  )
}
