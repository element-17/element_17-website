/** 与 Spring Boot 后端（docs/api.md）一一对应的类型定义与请求封装 */

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

export interface PageResult<T> {
  records: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface SiteMeta {
  name: string
  nameEn: string
  subtitle: string
  tagline: string
}

export interface ProfileItemVO {
  id: number
  label: string
  meta: string
  copyValue: string | null
  href: string | null
}

export interface SiteOverview {
  site: SiteMeta
  descriptions: {
    blog?: string
    projects?: string
    about?: string
    contact?: string
  }
  aboutItems: ProfileItemVO[]
  contactItems: ProfileItemVO[]
  skills: string[]
}

export interface ArticleSummary {
  id: number
  slug: string
  title: string
  tag: string
  summary: string
  status: string
  pinned: boolean
  viewCount: number
  publishedAt: string | null
  updatedAt: string | null
}

export interface ArticleDetail extends ArticleSummary {
  content: string
  externalUrl: string | null
}

export interface TagCount {
  tag: string
  count: number
}

export interface ProjectItem {
  id: number
  name: string
  meta: string
  description: string
  url: string | null
  repoUrl: string | null
  sortOrder: number
  visible: boolean
}

export interface MessageCreatePayload {
  nickname: string
  email?: string
  content: string
}

export class ApiError extends Error {
  readonly code: number
  readonly status: number

  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      ...init,
    })
  } catch {
    throw new ApiError('无法连接到后端服务，请确认服务已启动', -1, 0)
  }

  let body: ApiResponse<T>
  try {
    body = (await res.json()) as ApiResponse<T>
  } catch {
    throw new ApiError(`服务响应格式异常（HTTP ${res.status}）`, -1, res.status)
  }

  if (!res.ok || body.code !== 0) {
    throw new ApiError(body.message || `请求失败（HTTP ${res.status}）`, body.code ?? -1, res.status)
  }
  return body.data
}

export const fetchSiteOverview = (signal?: AbortSignal) =>
  request<SiteOverview>('/site', { signal })

export const fetchArticles = (
  params: { page?: number; size?: number; tag?: string; keyword?: string } = {},
  signal?: AbortSignal,
) => {
  const sp = new URLSearchParams()
  if (params.page) sp.set('page', String(params.page))
  if (params.size) sp.set('size', String(params.size))
  if (params.tag) sp.set('tag', params.tag)
  if (params.keyword) sp.set('keyword', params.keyword)
  const qs = sp.toString()
  return request<PageResult<ArticleSummary>>(`/articles${qs ? `?${qs}` : ''}`, { signal })
}

export const fetchArticleTags = (signal?: AbortSignal) =>
  request<TagCount[]>('/articles/tags', { signal })

export const fetchArticleDetail = (slug: string, signal?: AbortSignal) =>
  request<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`, { signal })

export const fetchProjects = (signal?: AbortSignal) =>
  request<ProjectItem[]>('/projects', { signal })

export const submitGuestMessage = (payload: MessageCreatePayload) =>
  request<{ id: number }>('/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

/** 把后端 yyyy-MM-dd HH:mm:ss 格式化为古卷用的 yyyy.MM */
export const formatScrollDate = (iso: string | null): string => {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}.${m[2]}` : iso.slice(0, 10)
}
