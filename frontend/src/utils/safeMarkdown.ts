import { Marked } from 'marked'

const marked = new Marked({
  gfm: true,
  breaks: false,
})

const ALLOWED_ELEMENTS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'input',
  'span',
  'sup',
  'sub',
]

const ALLOWED_ATTRS = ['href', 'title', 'alt', 'src', 'class', 'align', 'type', 'checked', 'disabled']

type SanitizerElement = Element & {
  setHTML?: (
    input: string,
    options?: {
      sanitizer?: {
        elements?: string[]
        attributes?: string[]
      }
    },
  ) => void
}

type DomPurifyLike = {
  sanitize: (
    dirty: string,
    cfg?: {
      ALLOWED_TAGS?: string[]
      ALLOWED_ATTR?: string[]
      ALLOW_ARIA_ATTR?: boolean
      ALLOW_DATA_ATTR?: boolean
      KEEP_CONTENT?: boolean
    },
  ) => string
}

let domPurifyPromise: Promise<DomPurifyLike> | null = null

function loadDOMPurify(): Promise<DomPurifyLike> {
  domPurifyPromise ??= import('dompurify').then((mod) => (mod.default ?? mod) as unknown as DomPurifyLike)
  return domPurifyPromise
}

function isSafeUrl(raw: string, allowRelative: boolean): boolean {
  const value = raw.trim()
  if (!value) return false
  if (allowRelative && (value.startsWith('/') || value.startsWith('#') || value.startsWith('./') || value.startsWith('../'))) {
    return !value.startsWith('//')
  }
  try {
    const parsed = new URL(value, window.location.origin)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}

function enhanceSanitizedDom(container: HTMLElement) {
  container.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
    const href = a.getAttribute('href') ?? ''
    if (!isSafeUrl(href, true)) {
      a.removeAttribute('href')
      return
    }
    if (!href.startsWith('#')) {
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
    }
  })

  container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (!isSafeUrl(src, true) || src.trim().toLowerCase().startsWith('mailto:')) {
      img.remove()
      return
    }
    img.loading = 'lazy'
    img.decoding = 'async'
  })

  container.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
    if (input.type !== 'checkbox') {
      input.remove()
      return
    }
    input.disabled = true
  })

  container.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (table.parentElement?.classList.contains('md-table-wrap')) return
    const wrap = document.createElement('div')
    wrap.className = 'md-table-wrap'
    table.replaceWith(wrap)
    wrap.append(table)
  })
}

/**
 * 将 Markdown 解析并通过原生 Sanitizer API（setHTML）安全渲染到非 VDOM 容器。
 * 浏览器不支持 setHTML 时按需代码分割加载 DOMPurify 作为对齐的降级方案。
 */
export async function renderSafeMarkdown(container: HTMLElement, markdown: string, signal?: AbortSignal): Promise<void> {
  const rawHtml = await marked.parse(markdown || '')
  if (signal?.aborted) return

  const target = container as SanitizerElement
  if ('setHTML' in Element.prototype && typeof target.setHTML === 'function') {
    target.setHTML(rawHtml, {
      sanitizer: {
        elements: ALLOWED_ELEMENTS,
        attributes: ALLOWED_ATTRS,
      },
    })
  } else {
    const DOMPurify = await loadDOMPurify()
    if (signal?.aborted) return
    container.innerHTML = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [...ALLOWED_ELEMENTS, '#text'],
      ALLOWED_ATTR: ALLOWED_ATTRS,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      KEEP_CONTENT: false,
    })
  }

  enhanceSanitizedDom(container)
}
