import { useEffect, useId, useRef } from 'react'
import { formatScrollDate, type ArticleDetail } from '../../api/client'
import { renderSafeMarkdown } from '../../utils/safeMarkdown'
import './ArticleDialog.scss'

interface Props {
  open: boolean
  article: ArticleDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
}

/**
 * 随笔阅读弹窗：使用原生 <dialog>（showModal + closedby="any"）。
 * 支持安全 Markdown（GFM）解析渲染，正文由独立 ref 容器承载以便使用原生 setHTML()。
 */
export function ArticleDialog({ open, article, loading, error, onRetry, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  // 每次切换文章回到顶部
  useEffect(() => {
    if (article && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [article])

  // 将文章 Markdown 安全渲染到非 VDOM 管理的正文容器
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (!article) {
      el.replaceChildren()
      return
    }
    const ac = new AbortController()
    void renderSafeMarkdown(el, article.content, ac.signal)
    return () => ac.abort()
  }, [article])

  // Safari 等尚未支持 closedby="any" 的浏览器：按包围盒判定点击遮罩外关闭
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return
    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }
    let pressedOutside = false
    const onDown = (e: PointerEvent) => {
      pressedOutside = outside(e)
    }
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && outside(e) && dialog.open) dialog.close()
    }
    dialog.addEventListener('pointerdown', onDown)
    dialog.addEventListener('pointerup', onUp)
    return () => {
      dialog.removeEventListener('pointerdown', onDown)
      dialog.removeEventListener('pointerup', onUp)
    }
  }, [])

  const handleClose = () => {
    const dialog = dialogRef.current
    if (dialog) dialog.returnValue = ''
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="article-dialog"
      aria-labelledby={titleId}
      onClose={handleClose}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <header className="article-dialog__header">
        <div className="article-dialog__meta">
          {article && (
            <>
              <span className="article-dialog__tag">{article.tag}</span>
              <span className="article-dialog__date">{formatScrollDate(article.publishedAt)}</span>
              <span className="article-dialog__views">{article.viewCount} 次阅读</span>
            </>
          )}
        </div>
        <form method="dialog">
          <button
            type="submit"
            value="close"
            className="article-dialog__close"
            aria-label="关闭文章"
            autoFocus
          >
            关闭
          </button>
        </form>
      </header>

      <div className="article-dialog__scroll" ref={scrollRef}>
        <div className="article-dialog__inner">
          {loading && (
            <div className="article-dialog__state">
              <h2 id={titleId} className="article-dialog__title">
                加载中…
              </h2>
            </div>
          )}

          {!loading && error && (
            <div className="article-dialog__state" role="alert">
              <h2 id={titleId} className="article-dialog__title">
                加载失败
              </h2>
              <p className="article-dialog__error">{error}</p>
              <button type="button" className="article-dialog__retry" onClick={onRetry}>
                重新加载
              </button>
            </div>
          )}

          {!loading && !error && article && (
            <article className="article-dialog__article">
              <h2 id={titleId} className="article-dialog__title">
                {article.title}
              </h2>
              {article.summary && <p className="article-dialog__summary">{article.summary}</p>}
              <div className="article-dialog__rule" aria-hidden="true" />

              <div ref={bodyRef} className="article-dialog__body md-prose" />

              {article.externalUrl && (
                <footer className="article-dialog__footer">
                  <a
                    className="article-dialog__link"
                    href={article.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    前往原站阅读全文 →
                  </a>
                </footer>
              )}
            </article>
          )}
        </div>
      </div>
    </dialog>
  )
}
