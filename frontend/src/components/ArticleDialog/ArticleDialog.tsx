import { useEffect, useId, useRef } from 'react'
import { formatScrollDate, type ArticleDetail } from '../../api/client'
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
 * 展卷阅读弹窗：使用原生 <dialog>（showModal + closedby="any"）。
 * 文章正文与实时阅读量来自后端 GET /api/v1/articles/{slug}。
 */
export function ArticleDialog({ open, article, loading, error, onRetry, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
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

  const paragraphs = article
    ? article.content
        .split(/\r?\n\s*\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <dialog
      ref={dialogRef}
      className="article-dialog"
      aria-labelledby={titleId}
      onClose={handleClose}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="article-dialog__inner">
        <header className="article-dialog__header">
          <div className="article-dialog__meta">
            {article && (
              <>
                <span className="article-dialog__tag">{article.tag}</span>
                <span className="article-dialog__date">{formatScrollDate(article.publishedAt)}</span>
                <span className="article-dialog__views">{article.viewCount} 次展阅</span>
              </>
            )}
          </div>
          <form method="dialog">
            <button
              type="submit"
              value="close"
              className="article-dialog__close"
              aria-label="合卷关闭"
              autoFocus
            >
              合卷
            </button>
          </form>
        </header>

        {loading && (
          <div className="article-dialog__state">
            <h2 id={titleId} className="article-dialog__title">
              正在展卷…
            </h2>
          </div>
        )}

        {!loading && error && (
          <div className="article-dialog__state" role="alert">
            <h2 id={titleId} className="article-dialog__title">
              取卷失败
            </h2>
            <p className="article-dialog__error">{error}</p>
            <button type="button" className="article-dialog__retry" onClick={onRetry}>
              重新加载
            </button>
          </div>
        )}

        {!loading && !error && article && (
          <>
            <h2 id={titleId} className="article-dialog__title">
              {article.title}
            </h2>
            <p className="article-dialog__summary">{article.summary}</p>
            <div className="article-dialog__rule" aria-hidden="true" />

            <div className="article-dialog__body">
              {paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

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
          </>
        )}
      </div>
    </dialog>
  )
}
