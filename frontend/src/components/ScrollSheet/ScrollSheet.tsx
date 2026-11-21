import type { ArticleItem } from '../../config/modules'
import './ScrollSheet.scss'

interface Props {
  articles: ArticleItem[]
  onOpenArticle: (article: ArticleItem) => void
}

/**
 * 贴在 3D 古卷表面的 HTML 墨字层。
 * 3D 模型里只画了一张空白古纸，由 SheetProjector 每帧用 CSS matrix3d 严丝合缝投到卷面上：
 * 零 WebGL 文字渲染开销，同时保留浏览器原生清晰排版、悬停高亮与无障碍点击。
 */
export function ScrollSheet({ articles, onOpenArticle }: Props) {
  return (
    <div className="scroll-sheet" data-scroll-sheet aria-label="古卷文章目录">
      <header className="scroll-sheet__head">
        <span className="scroll-sheet__heading">夜灯录 · 随笔目录</span>
        <span className="scroll-sheet__seal" aria-hidden="true">
          藏卷
        </span>
      </header>

      <ul className="scroll-sheet__list">
        {articles.map((art, idx) => (
          <li key={art.id} className="scroll-sheet__item">
            <button
              type="button"
              className="scroll-sheet__btn"
              onClick={() => onOpenArticle(art)}
            >
              <span className="scroll-sheet__num">{String(idx + 1).padStart(2, '0')}</span>
              <span className="scroll-sheet__title">{art.title}</span>
              <span className="scroll-sheet__meta">
                <span className="scroll-sheet__tag">{art.tag}</span>
                <span className="scroll-sheet__date">{art.date}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <footer className="scroll-sheet__foot">择一卷目，轻点展阅</footer>
    </div>
  )
}
