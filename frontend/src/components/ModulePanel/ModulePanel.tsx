import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import cn from 'classnames'
import gsap from 'gsap'
import {
  formatScrollDate,
  type ArticleSummary,
  type ProfileItemVO,
  type ProjectItem,
  type SiteOverview,
} from '../../api/client'
import { MODULES, moduleIndex, type ModuleDef, type ModuleId } from '../../config/modules'
import './ModulePanel.scss'

interface Props {
  active: ModuleId
  fallback?: boolean
  site: SiteOverview | null
  articles: ArticleSummary[]
  projects: ProjectItem[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenArticle: (slug: string) => void
  onOpenMessage: () => void
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

/** 遵循现代剪贴板与无障碍实践的复制按钮 */
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

function ProfileRow({ it }: { it: ProfileItemVO }) {
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
        <a className="panel__item-link" href={it.href} target="_blank" rel="noopener noreferrer">
          {it.meta} ↗
        </a>
      </li>
    )
  }
  return (
    <li className="panel__item" data-line>
      <span className="panel__item-label">{it.label}</span>
      <span className="panel__item-meta">{it.meta}</span>
    </li>
  )
}

function PanelBody({
  m,
  fallback,
  site,
  articles,
  projects,
  loading,
  error,
  onRetry,
  onOpenArticle,
  onOpenMessage,
}: {
  m: ModuleDef
  fallback: boolean
  site: SiteOverview | null
  articles: ArticleSummary[]
  projects: ProjectItem[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenArticle: (slug: string) => void
  onOpenMessage: () => void
}) {
  if (m.id === 'home') {
    return (
      <>
        <p className="panel__kicker" data-line>
          {site?.site.nameEn ?? (loading ? 'LOADING' : 'OFFLINE')}
        </p>
        <h1 className="panel__title panel__title--hero" data-line>
          {site?.site.name ?? (loading ? '入夜载卷中' : '服务未连接')}
        </h1>
        <p className="panel__rule" data-line />
        {site ? (
          <>
            <p className="panel__subtitle" data-line>
              {site.site.subtitle}
            </p>
            <p className="panel__desc" data-line>
              {site.site.tagline}
            </p>
          </>
        ) : error ? (
          <div className="panel__status" data-line role="alert">
            <span>{error}</span>
            <button type="button" className="panel__retry" onClick={onRetry}>
              重试连接
            </button>
          </div>
        ) : (
          <p className="panel__desc" data-line>
            正在连接后端接口…
          </p>
        )}
      </>
    )
  }

  const desc = site?.descriptions[m.id] ?? ''

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

      {desc && (
        <p className="panel__desc" data-line>
          {desc}
        </p>
      )}

      {!loading && error && (
        <div className="panel__status" data-line role="alert">
          <span>{error}</span>
          <button type="button" className="panel__retry" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {/* 藏卷：WebGL 正常时文章贴在右侧 3D 古卷上；无 WebGL 兜底模式则在面板里展示实时列表 */}
      {m.id === 'blog' && !fallback && !error && (
        <p className="panel__cue" data-line>
          <span className="panel__cue-dot" aria-hidden="true" />
          <span className="panel__cue-desktop">炉畔古卷已展，轻点右侧卷目展阅</span>
          <span className="panel__cue-mobile">炉畔古卷已展，轻点下方卷目展阅</span>
        </p>
      )}
      {m.id === 'blog' && fallback && !error && (
        <ul className="panel__items">
          {articles.map((art) => (
            <li key={art.id} className="panel__item" data-line>
              <button type="button" className="panel__article-btn" onClick={() => onOpenArticle(art.slug)}>
                <span className="panel__item-label">{art.title}</span>
                <span className="panel__item-meta">
                  {art.tag} · {art.viewCount} 阅 · {formatScrollDate(art.publishedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 铸剑：实时作品 + 技能标签 */}
      {m.id === 'projects' && !error && (
        <>
          {projects.length > 0 && (
            <ul className="panel__projects">
              {projects.map((proj) => {
                const link = proj.url || proj.repoUrl
                return (
                  <li key={proj.id} className="panel__project" data-line>
                    <div className="panel__project-top">
                      {link ? (
                        <a
                          className="panel__project-name panel__project-name--link"
                          href={link}
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
                    <p className="panel__project-desc">{proj.description}</p>
                  </li>
                )
              })}
            </ul>
          )}
          {site && site.skills.length > 0 && (
            <ul className="panel__tags">
              {site.skills.map((t) => (
                <li key={t} className="panel__tag" data-line>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* 来历：实时个人条目 */}
      {m.id === 'about' && site && site.aboutItems.length > 0 && (
        <ul className="panel__items">
          {site.aboutItems.map((it) => (
            <ProfileRow key={it.id} it={it} />
          ))}
        </ul>
      )}

      {/* 传书：实时联系方式 + 飞鸽传书留言入口 */}
      {m.id === 'contact' && (
        <>
          {site && site.contactItems.length > 0 && (
            <ul className="panel__items">
              {site.contactItems.map((it) => (
                <ProfileRow key={it.id} it={it} />
              ))}
            </ul>
          )}
          <div className="panel__cta-wrap" data-line>
            <button type="button" className="panel__cta" onClick={onOpenMessage}>
              提笔传书 · 访客留言
            </button>
          </div>
        </>
      )}
    </>
  )
}

/**
 * 各模块的标题 / 信息面板（全部内容来自后端 API，异步就绪后自动显隐入场）。
 */
export function ModulePanel({
  active,
  fallback = false,
  site,
  articles,
  projects,
  loading,
  error,
  onRetry,
  onOpenArticle,
  onOpenMessage,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const prevRef = useRef<ModuleId | null>(null)
  const dataKey = `${Boolean(site)}-${articles.length}-${projects.length}-${loading}-${Boolean(error)}`

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const prev = prevRef.current
    const moduleChanged = prev !== active
    prevRef.current = active
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dir = prev === null ? 1 : moduleIndex(active) > moduleIndex(prev) ? 1 : -1
    const first = prev === null

    root.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
      const lines = panel.querySelectorAll<HTMLElement>('[data-line]')
      if (panel.dataset.panel === active) {
        if (moduleChanged) {
          gsap.fromTo(
            lines,
            { autoAlpha: 0, x: reduceMotion ? 0 : dir * 48 },
            {
              autoAlpha: 1,
              x: 0,
              duration: reduceMotion ? 0.25 : 0.72,
              ease: 'expo.out',
              stagger: reduceMotion ? 0 : 0.06,
              delay: first ? (reduceMotion ? 0.1 : 0.45) : reduceMotion ? 0.05 : 0.28,
              overwrite: true,
            },
          )
        } else {
          // 异步数据到达：杀掉可能仍在等待 delay 的旧入场补间，确保当前模块所有行可靠显现
          gsap.killTweensOf(lines)
          gsap.set(lines, { visibility: 'visible' })
          gsap.to(lines, {
            opacity: 1,
            x: 0,
            duration: reduceMotion ? 0.15 : 0.35,
            ease: 'power2.out',
          })
        }
      } else if (first || !moduleChanged) {
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
  }, [active, fallback, dataKey])

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
            <PanelBody
              m={m}
              fallback={fallback}
              site={site}
              articles={articles}
              projects={projects}
              loading={loading}
              error={error}
              onRetry={onRetry}
              onOpenArticle={onOpenArticle}
              onOpenMessage={onOpenMessage}
            />
          </section>
        ))}
      </div>
    </div>
  )
}
