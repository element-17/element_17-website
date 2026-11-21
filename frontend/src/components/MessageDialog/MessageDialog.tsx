import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiError, submitGuestMessage } from '../../api/client'
import './MessageDialog.scss'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * 飞鸽传书留言弹窗：直连后端 POST /api/v1/messages（带 Redis IP 防刷限流）。
 * 遵循原生 <dialog> 与 :user-invalid 交互后校验实践。
 */
export function MessageDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const titleId = useId()
  const nickId = useId()
  const nickErrId = useId()
  const emailId = useId()
  const emailHintId = useId()
  const emailErrId = useId()
  const contentId = useId()
  const contentHintId = useId()
  const contentErrId = useId()

  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

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

  // 同步原生 :user-invalid 状态到 aria-invalid 与动态 aria-describedby
  const syncFieldAria = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const invalid = el.matches(':user-invalid')
    el.setAttribute('aria-invalid', invalid ? 'true' : 'false')
    const errId = el.dataset.error
    if (!errId) return
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errId)
    if (invalid) ids.push(errId)
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '))
    else el.removeAttribute('aria-describedby')
  }

  const handleClose = () => {
    const dialog = dialogRef.current
    if (dialog) dialog.returnValue = ''
    setFeedback(null)
    onClose()
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = formRef.current
    if (!form) return

    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(':invalid')
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
        if (!el.validity.valid) {
          el.setAttribute('aria-invalid', 'true')
          const errId = el.dataset.error
          if (errId) {
            const ids = (el.getAttribute('aria-describedby') || '')
              .split(/\s+/)
              .filter((id) => id && id !== errId)
            ids.push(errId)
            el.setAttribute('aria-describedby', ids.join(' '))
          }
        }
      })
      form.reportValidity()
      firstInvalid?.focus()
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      await submitGuestMessage({
        nickname: nickname.trim(),
        email: email.trim() || undefined,
        content: content.trim(),
      })
      setNickname('')
      setEmail('')
      setContent('')
      form.reset()
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((el) => {
        el.setAttribute('aria-invalid', 'false')
        const errId = el.dataset.error
        if (errId) {
          const ids = (el.getAttribute('aria-describedby') || '')
            .split(/\s+/)
            .filter((id) => id && id !== errId)
          if (ids.length) el.setAttribute('aria-describedby', ids.join(' '))
          else el.removeAttribute('aria-describedby')
        }
      })
      setFeedback({ kind: 'ok', text: '飞鸽已启程，多谢阁下传书。' })
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '传书发送失败，请稍后重试'
      setFeedback({ kind: 'err', text: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="msg-dialog"
      aria-labelledby={titleId}
      onClose={handleClose}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="msg-dialog__inner">
        <header className="msg-dialog__header">
          <h2 id={titleId} className="msg-dialog__title">
            飞鸽传书
          </h2>
          <form method="dialog">
            <button type="submit" value="close" className="msg-dialog__close" aria-label="关闭传书窗口">
              收笺
            </button>
          </form>
        </header>

        <form
          ref={formRef}
          className="msg-dialog__form"
          action="/api/v1/messages"
          method="POST"
          aria-labelledby={titleId}
          onSubmit={handleSubmit}
        >
          <div className="msg-dialog__field">
            <label htmlFor={nickId} className="msg-dialog__label">
              阁下名号 <span aria-hidden="true">*</span>
            </label>
            <input
              id={nickId}
              name="nickname"
              type="text"
              className="msg-dialog__input"
              required
              minLength={1}
              maxLength={64}
              autoComplete="name"
              enterKeyHint="next"
              aria-invalid="false"
              data-error={nickErrId}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value)
                syncFieldAria(e.currentTarget)
              }}
              onBlur={(e) => syncFieldAria(e.currentTarget)}
            />
            <p id={nickErrId} className="msg-dialog__err">
              <span role="img" aria-label="错误">
                ⚠
              </span>{' '}
              请填写称呼（1 ~ 64 字符）。
            </p>
          </div>

          <div className="msg-dialog__field">
            <label htmlFor={emailId} className="msg-dialog__label">
              回信邮箱（选填）
            </label>
            <span id={emailHintId} className="msg-dialog__hint">
              格式示例：you@example.com，仅用于站长回信
            </span>
            <input
              id={emailId}
              name="email"
              type="email"
              className="msg-dialog__input"
              maxLength={128}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              aria-invalid="false"
              aria-describedby={emailHintId}
              data-error={emailErrId}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                syncFieldAria(e.currentTarget)
              }}
              onBlur={(e) => syncFieldAria(e.currentTarget)}
            />
            <p id={emailErrId} className="msg-dialog__err">
              <span role="img" aria-label="错误">
                ⚠
              </span>{' '}
              请输入有效的邮箱格式（如 you@example.com）。
            </p>
          </div>

          <div className="msg-dialog__field">
            <label htmlFor={contentId} className="msg-dialog__label">
              书信正文 <span aria-hidden="true">*</span>
            </label>
            <span id={contentHintId} className="msg-dialog__hint">
              2 ~ 1000 字符
            </span>
            <textarea
              id={contentId}
              name="content"
              rows={4}
              className="msg-dialog__textarea"
              required
              minLength={2}
              maxLength={1000}
              aria-invalid="false"
              aria-describedby={contentHintId}
              data-error={contentErrId}
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                syncFieldAria(e.currentTarget)
              }}
              onBlur={(e) => syncFieldAria(e.currentTarget)}
            />
            <p id={contentErrId} className="msg-dialog__err">
              <span role="img" aria-label="错误">
                ⚠
              </span>{' '}
              请写下至少 2 个字的留言内容。
            </p>
          </div>

          <div className="msg-dialog__actions">
            <p
              className={`msg-dialog__status${feedback ? ` msg-dialog__status--${feedback.kind}` : ''}`}
              role="status"
            >
              {feedback?.text ?? ''}
            </p>
            <button type="submit" className="msg-dialog__submit" disabled={submitting}>
              {submitting ? '放飞中…' : '放飞传书'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
