import { useEffect, useLayoutEffect, useRef } from 'react'
import cn from 'classnames'
import { MODULES, type ModuleId } from '../../config/modules'
import './ModuleMenu.scss'

interface Props {
  active: ModuleId
  onSelect: (id: ModuleId) => void
}

/** 章节式入口菜单：一条会滑动的光带标记当前选中项 */
export function ModuleMenu({ active, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)

  const place = (id: ModuleId) => {
    const list = listRef.current
    const indicator = indicatorRef.current
    const btn = list?.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!indicator || !btn) return
    // 只用 transform 移动 / 拉伸，避免触发布局
    indicator.style.transform = `translate3d(${btn.offsetLeft}px,0,0) scaleX(${btn.offsetWidth})`
  }

  useLayoutEffect(() => {
    place(active)
  }, [active])

  useEffect(() => {
    const onResize = () => place(active)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active])

  return (
    <nav className="menu" aria-label="模块导航">
      <div className="menu__float" data-float="5">
        <div className="menu__list" ref={listRef}>
          <span className="menu__indicator" ref={indicatorRef} />
          {MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              data-id={m.id}
              className={cn('menu__item', { 'is-active': m.id === active })}
              aria-label={`第 ${Number(m.index) + 1} 章：${m.label} ${m.en}`}
              aria-current={m.id === active ? 'page' : undefined}
              onClick={() => onSelect(m.id)}
            >
              <span className="menu__index">{m.index}</span>
              <span className="menu__label">{m.label}</span>
              <span className="menu__en">{m.en}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
