import { useId, useRef, useState } from 'react'
import cn from 'classnames'
import { formatObservedTime } from '../../api/weather'
import {
  NENU_LOCATION,
  WEATHER_KINDS,
  WEATHER_META,
  type LiveWeather,
  type WeatherKind,
  type WeatherMode,
} from '../../config/weather'
import './WeatherWidget.scss'

interface Props {
  liveWeather: LiveWeather | null
  loading: boolean
  error: string | null
  mode: WeatherMode
  effectiveWeather: WeatherKind
  onChangeMode: (mode: WeatherMode) => void
  onRefresh: () => void
}

let supportsDisplayTransition: boolean | undefined

/** 按真实计算样式探测浏览器是否真正支持离散 display 过渡（规避 Firefox 仅解析不执行的问题） */
function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition
  if (typeof window === 'undefined' || !window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false
  }
  const probe = document.createElement('div')
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;'
  document.body.appendChild(probe)
  void getComputedStyle(probe).display
  probe.style.display = 'none'
  supportsDisplayTransition = getComputedStyle(probe).display === 'block'
  probe.remove()
  return supportsDisplayTransition
}

function supportsTopLayerExit(): boolean {
  return typeof window !== 'undefined' && Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay()
}

function hasNativePopover(): boolean {
  return typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover')
}

async function closeTopLayer(element: HTMLElement | null) {
  if (!element) return
  if (!supportsTopLayerExit()) {
    element.setAttribute('data-closing', '')
    const animations = element.getAnimations?.({ subtree: true }) ?? []
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => window.setTimeout(r, 400)),
      ])
    }
    if (!element.hasAttribute('data-closing')) return
    element.removeAttribute('data-closing')
  }
  if (typeof element.hidePopover === 'function') {
    try {
      element.hidePopover()
    } catch {
      /* 已关闭时忽略 */
    }
  }
}

function WeatherIcon({ kind, size = 14 }: { kind: WeatherKind; size?: number }) {
  if (kind === 'rain') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M8 19v2M12 17v4M16 19v2" />
      </svg>
    )
  }
  if (kind === 'snow') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07l14.14-14.14" />
      </svg>
    )
  }
  if (kind === 'cloudy') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

/**
 * 东北师范大学实时气象控件 + 原生 Popover 气象面板：
 * - 使用 Popover API (`popover="auto"`) 与 CSS Anchor Positioning (`position-area`) 自动避让视口边缘；
 * - 实时展示东北师大实况气象，同时支持一键切换 实况 / 晴 / 阴 / 雨 / 雪 体验对应 3D 场景效果。
 */
export function WeatherWidget({
  liveWeather,
  loading,
  error,
  mode,
  effectiveWeather,
  onChangeMode,
  onRefresh,
}: Props) {
  const popoverId = useId()
  const popoverRef = useRef<HTMLDivElement>(null)
  const [fallbackOpen, setFallbackOpen] = useState(false)

  const nativePopover = hasNativePopover()
  const activeMeta = WEATHER_META[effectiveWeather]
  const isManual = mode !== 'live'
  const tempText = liveWeather ? `${Math.round(liveWeather.temperature)}°C` : loading ? '…' : '--'
  const pillLabel = isManual
    ? `${activeMeta.label}预览`
    : liveWeather
      ? `${liveWeather.label} ${tempText}`
      : loading
        ? '获取中'
        : '实况离线'

  const handleTriggerClick = () => {
    if (!nativePopover) {
      setFallbackOpen((v) => !v)
    }
  }

  const handleClose = () => {
    if (!nativePopover) {
      setFallbackOpen(false)
      return
    }
    void closeTopLayer(popoverRef.current)
  }

  return (
    <div className="weather-widget">
      <button
        type="button"
        className={cn('weather-widget__trigger', { 'is-preview': isManual })}
        popoverTarget={nativePopover ? popoverId : undefined}
        onClick={handleTriggerClick}
        aria-label={`${NENU_LOCATION.name}实时天气：${pillLabel}，点击查看详情与切换天气效果`}
        title={`${NENU_LOCATION.name}天气（点击展开实况与场景天气切换）`}
      >
        <span className="weather-widget__icon">
          <WeatherIcon kind={effectiveWeather} size={14} />
        </span>
        <span className="weather-widget__place">{NENU_LOCATION.shortName}</span>
        <span className="weather-widget__sep" aria-hidden="true">
          ·
        </span>
        <span className="weather-widget__summary">{pillLabel}</span>
        <span className="weather-widget__compact-temp">
          {isManual ? activeMeta.shortLabel : liveWeather ? `${Math.round(liveWeather.temperature)}°` : activeMeta.shortLabel}
        </span>
      </button>

      <div
        id={popoverId}
        ref={popoverRef}
        {...(nativePopover ? { popover: 'auto' as const } : {})}
        className={cn('weather-popover', { ':popover-open': !nativePopover && fallbackOpen })}
        data-weather-popover
      >
        <div className="weather-popover__header">
          <div className="weather-popover__title-group">
            <h2 className="weather-popover__title">{NENU_LOCATION.name}</h2>
            <p className="weather-popover__campus">{NENU_LOCATION.campus}</p>
          </div>
          <div className="weather-popover__actions">
            <button
              type="button"
              className={cn('weather-popover__icon-btn', { 'is-spinning': loading })}
              onClick={onRefresh}
              disabled={loading}
              aria-label="刷新东北师范大学实时天气"
              title="刷新实时天气"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
            <button
              type="button"
              className="weather-popover__icon-btn"
              onClick={handleClose}
              aria-label="关闭天气面板"
              title="关闭"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="weather-popover__live" role="status" aria-live="polite">
          {liveWeather ? (
            <>
              <div className="weather-popover__live-main">
                <span className="weather-popover__live-icon">
                  <WeatherIcon kind={liveWeather.kind} size={26} />
                </span>
                <div className="weather-popover__live-reading">
                  <span className="weather-popover__temp">{liveWeather.temperature.toFixed(1)}°C</span>
                  <span className="weather-popover__cond">
                    {liveWeather.label} · {liveWeather.isDay ? '昼' : '夜'}
                  </span>
                </div>
                <span className="weather-popover__time">
                  {formatObservedTime(liveWeather.observedAt, liveWeather.fetchedAt)} 实况
                </span>
              </div>

              <dl className="weather-popover__metrics">
                <div className="weather-popover__metric">
                  <dt>体感</dt>
                  <dd>{liveWeather.apparentTemperature.toFixed(1)}°C</dd>
                </div>
                <div className="weather-popover__metric">
                  <dt>湿度</dt>
                  <dd>{Math.round(liveWeather.humidity)}%</dd>
                </div>
                <div className="weather-popover__metric">
                  <dt>风速</dt>
                  <dd>{liveWeather.windSpeed.toFixed(1)} km/h</dd>
                </div>
              </dl>
              {(liveWeather.precipitation > 0 || liveWeather.snowfall > 0) && (
                <p className="weather-popover__precip">
                  {liveWeather.snowfall > 0
                    ? `当前降雪 ${liveWeather.snowfall.toFixed(1)} cm`
                    : `当前降水 ${liveWeather.precipitation.toFixed(1)} mm`}
                </p>
              )}
            </>
          ) : error ? (
            <div className="weather-popover__error">
              <p>{error}</p>
              <button type="button" className="weather-popover__retry" onClick={onRefresh}>
                重新获取
              </button>
            </div>
          ) : (
            <p className="weather-popover__loading">正在连接气象接口获取东北师大实时天气…</p>
          )}
        </div>

        <div className="weather-popover__scene-bar">
          <span className="weather-popover__scene-dot" data-weather={effectiveWeather} aria-hidden="true" />
          <span className="weather-popover__scene-text">{activeMeta.sceneSummary}</span>
        </div>

        <div className="weather-popover__mode">
          <span className="weather-popover__mode-label">场景天气</span>
          <div className="weather-popover__chips" role="group" aria-label="场景天气模式切换">
            <button
              type="button"
              className={cn('weather-popover__chip', { 'is-active': mode === 'live' })}
              aria-pressed={mode === 'live'}
              onClick={() => onChangeMode('live')}
            >
              实况
            </button>
            {WEATHER_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={cn('weather-popover__chip', { 'is-active': mode === kind })}
                aria-pressed={mode === kind}
                onClick={() => onChangeMode(kind)}
              >
                {WEATHER_META[kind].shortLabel}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
