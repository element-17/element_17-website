import { formatScrollDate, type ArticleSummary } from '../../api/client'
import './ScrollSheet.scss'

interface Props {
  articles: ArticleSummary[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenArticle: (slug: string) => void
}

/**
 * 贴在 3D 古卷表面的 HTML 墨字层（实时渲染后端 GET /api/v1/articles 数据）。
 * 3D 模型里只画一张空白古纸，由 SheetProjector 每帧通过 CSS matrix3d 贴到卷面上。
 */
export function ScrollSheet({ articles, loading, error, onRetry, onOpenArticle }: Props) {
  return (
    <div className="scroll-sheet" data-scroll-sheet aria-label="随笔目录">
      <header className="scroll-sheet__head">
        <span className="scroll-sheet__heading">随笔目录</span>
        <span className="scroll-sheet__seal" aria-hidden="true">
          随笔
        </span>
      </header>

      {loading && <p className="scroll-sheet__state">加载中…</p>}

      {!loading && error && (
        <div className="scroll-sheet__state scroll-sheet__state--error" role="alert">
          <span>{error}</span>
          <button type="button" className="scroll-sheet__retry" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <p className="scroll-sheet__state">暂无文章。</p>
      )}

      {!loading && !error && articles.length > 0 && (
        <ul className="scroll-sheet__list">
          {articles.slice(0, 4).map((art, idx) => (
            <li key={art.id} className="scroll-sheet__item">
              <button
                type="button"
                className="scroll-sheet__btn"
                onClick={() => onOpenArticle(art.slug)}
              >
                <span className="scroll-sheet__num">{String(idx + 1).padStart(2, '0')}</span>
                <span className="scroll-sheet__title">{art.title}</span>
                <span className="scroll-sheet__meta">
                  <span className="scroll-sheet__tag">{art.tag}</span>
                  <span className="scroll-sheet__views">{art.viewCount} 次阅读</span>
                  <span className="scroll-sheet__date">{formatScrollDate(art.publishedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="scroll-sheet__foot">
        {articles.length > 0 ? '点击标题阅读全文' : 'element_17 · 随笔'}
      </footer>
    </div>
  )
}
