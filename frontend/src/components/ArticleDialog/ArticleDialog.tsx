import { useEffect, useId, useRef } from 'react'
import type { ArticleItem } from '../../config/modules'
import './ArticleDialog.scss'

interface Props {
  article: ArticleItem | null
  onClose: () => void
}

/**
 * 展卷阅读弹窗：使用原生 <dialog>（showModal + closedby="any"）。
 * 焦点管理、顶层渲染、Esc 与移动端返回手势全部交给浏览器原生实现。
 */
export function ArticleDialog({ article, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (article && !dialog.open) {
      dialog.showModal()
    } else if (!article && dialog.open) {
      dialog.close()
    }
  }, [article])

  // Safari 等尚未支持 closedby="any" 的浏览器：按包围盒判定点击遮罩外关闭（避开拖选文字误触）
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
      {article && (
        <div className="article-dialog__inner">
          <header className="article-dialog__header">
            <div className="article-dialog__meta">
              <span className="article-dialog__tag">{article.tag}</span>
              <span className="article-dialog__date">{article.date}</span>
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

          <h2 id={titleId} className="article-dialog__title">
            {article.title}
          </h2>
          <p className="article-dialog__summary">{article.summary}</p>
          <div className="article-dialog__rule" aria-hidden="true" />

          <div className="article-dialog__body">
            {article.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          {article.url && (
            <footer className="article-dialog__footer">
              <a
                className="article-dialog__link"
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                前往原站阅读全文 →
              </a>
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}
