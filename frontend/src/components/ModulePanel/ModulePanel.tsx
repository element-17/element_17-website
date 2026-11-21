import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import cn from 'classnames'
import gsap from 'gsap'
import {
  MODULES,
  SITE,
  moduleIndex,
  type ArticleItem,
  type InfoItem,
  type ModuleDef,
  type ModuleId,
} from '../../config/modules'
import './ModulePanel.scss'

interface Props {
  active: ModuleId
  fallback?: boolean
  onOpenArticle: (article: ArticleItem) => void
}

let lastAnnouncement = ''

function legacyCopy(text: string): boolean {
  const field = Object.assign(document.createElement('textarea'), { value: text })
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0'
  document.body.append(field)
  field.select()
  try {
    return document.execCommand('copy')
  } finally {
    field.remove()
  }
}

/** 遵循现代剪贴板与无障碍实践的复制按钮：不禁用按钮、状态播报与视觉反馈共用独立 live region */
function CopyAction({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [tip, setTip] = useState('')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  const onCopy = async () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    let ok: boolean
    try {
      await navigator.clipboard.writeText(value)
      ok = true
    } catch {
      ok = legacyCopy(value)
    }
    let message = ok ? '已复制' : '复制失败'
    if (message === lastAnnouncement) message += '\u00A0'
    lastAnnouncement = message

    setStatus(ok ? 'copied' : 'failed')
    setTip('')
    requestAnimationFrame(() => setTip(message))
    timerRef.current = window.setTimeout(() => {
      setStatus('idle')
      setTip('')
    }, 2000)
  }

  return (
    <span className="panel__copy">
      <button
        type="button"
        className="panel__copy-btn"
        aria-label={`复制 ${label}：${value}`}
        data-copied={status === 'copied' ? '' : undefined}
        data-failed={status === 'failed' ? '' : undefined}
        onClick={onCopy}
      >
        <span className="panel__copy-text">{value}</span>
        <span className="panel__copy-icon" aria-hidden="true">
          {status === 'copied' ? '✓' : '❐'}
        </span>
      </button>
      <span className="panel__copy-tip" role="status" data-visible={tip ? '' : undefined}>
        {tip}
      </span>
    </span>
  )
}

function InfoRow({ it }: { it: InfoItem }) {
  if (it.copyValue) {
    return (
      <li className="panel__item" data-line>
        <span className="panel__item-label">{it.label}</span>
        <CopyAction label={it.label} value={it.copyValue} />
      </li>
    )
  }
  if (it.href) {
    return (
      <li className="panel__item" data-line>
        <span className="panel__item-label">{it.label}</span>
        <a
          className="panel__item-link"
          href={it.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {it.meta ?? it.href} ↗
        </a>
      </li>
    )
  }
  return (
    <li className="panel__item" data-line>
      <span className="panel__item-label">{it.label}</span>
      {it.meta && <span className="panel__item-meta">{it.meta}</span>}
    </li>
  )
}

function PanelBody({
  m,
  fallback,
  onOpenArticle,
}: {
  m: ModuleDef
  fallback: boolean
  onOpenArticle: (article: ArticleItem) => void
}) {
  if (m.id === 'home') {
    return (
      <>
        <p className="panel__kicker" data-line>
          {SITE.nameEn}
        </p>
        <h1 className="panel__title panel__title--hero" data-line>
          {SITE.name}
        </h1>
        <p className="panel__rule" data-line />
        <p className="panel__subtitle" data-line>
          {SITE.subtitle}
        </p>
        <p className="panel__desc" data-line>
          {m.desc}
        </p>
      </>
    )
  }

  return (
    <>
      <p className="panel__kicker" data-line>
        CHAPTER {m.index}
      </p>
      <h2 className="panel__title" data-line>
        {m.label}
        <span className="panel__title-en">{m.en}</span>
      </h2>
      <p className="panel__rule" data-line />
      <p className="panel__desc" data-line>
        {m.desc}
      </p>

      {/* 藏卷：WebGL 正常时文章贴在右侧 3D 古卷上；兜底模式则在面板里直接展示可点列表 */}
      {m.articles && !fallback && (
        <p className="panel__cue" data-line>
          <span className="panel__cue-dot" aria-hidden="true" />
          <span className="panel__cue-desktop">炉畔古卷已展，轻点右侧卷目展阅</span>
          <span className="panel__cue-mobile">炉畔古卷已展，轻点下方卷目展阅</span>
        </p>
      )}
      {m.articles && fallback && (
        <ul className="panel__items">
          {m.articles.map((art) => (
            <li key={art.id} className="panel__item" data-line>
              <button type="button" className="panel__article-btn" onClick={() => onOpenArticle(art)}>
                <span className="panel__item-label">{art.title}</span>
                <span className="panel__item-meta">
                  {art.tag} · {art.date}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {m.projects && (
        <ul className="panel__projects">
          {m.projects.map((proj) => (
            <li key={proj.name} className="panel__project" data-line>
              <div className="panel__project-top">
                {proj.url ? (
                  <a
                    className="panel__project-name panel__project-name--link"
                    href={proj.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {proj.name} ↗
                  </a>
                ) : (
                  <span className="panel__project-name">{proj.name}</span>
                )}
                <span className="panel__item-meta">{proj.meta}</span>
              </div>
              <p className="panel__project-desc">{proj.desc}</p>
            </li>
          ))}
        </ul>
      )}

      {m.items && (
        <ul className="panel__items">
          {m.items.map((it) => (
            <InfoRow key={it.label} it={it} />
          ))}
        </ul>
      )}

      {m.tags && (
        <ul className="panel__tags">
          {m.tags.map((t) => (
            <li key={t} className="panel__tag" data-line>
              {t}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * 各模块的标题 / 信息面板。
 * 所有面板常驻 DOM，切换时旧面板轻柔退场、新面板错峰入场；遵循 prefers-reduced-motion。
 */
export function ModulePanel({ active, fallback = false, onOpenArticle }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<ModuleId | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const prev = prevRef.current
    prevRef.current = active
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dir = prev === null ? 1 : moduleIndex(active) > moduleIndex(prev) ? 1 : -1
    const first = prev === null

    root.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
      const lines = panel.querySelectorAll<HTMLElement>('[data-line]')
      if (panel.dataset.panel === active) {
        gsap.fromTo(
          lines,
          { autoAlpha: 0, x: reduceMotion ? 0 : dir * 48 },
          {
            autoAlpha: 1,
            x: 0,
            duration: reduceMotion ? 0.25 : 0.72,
            ease: 'expo.out',
            stagger: reduceMotion ? 0 : 0.06,
            delay: first ? (reduceMotion ? 0.1 : 0.65) : reduceMotion ? 0.05 : 0.28,
            overwrite: true,
          },
        )
      } else if (first) {
        gsap.set(lines, { autoAlpha: 0 })
      } else {
        gsap.to(lines, {
          autoAlpha: 0,
          x: reduceMotion ? 0 : -dir * 32,
          duration: reduceMotion ? 0.18 : 0.26,
          ease: 'power2.in',
          stagger: reduceMotion ? 0 : 0.015,
          overwrite: true,
        })
      }
    })
  }, [active, fallback])

  return (
    <div className="panels" ref={rootRef}>
      <div className="panels__float" data-float="9">
        {MODULES.map((m) => (
          <section
            key={m.id}
            data-panel={m.id}
            className={cn('panel', `panel--${m.side}`, `panel--${m.id}`, {
              'is-active': m.id === active,
            })}
            aria-hidden={m.id !== active}
            inert={m.id !== active || undefined}
          >
            <PanelBody m={m} fallback={fallback} onOpenArticle={onOpenArticle} />
          </section>
        ))}
      </div>
    </div>
  )
}
