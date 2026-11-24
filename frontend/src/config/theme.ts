export type ThemeScheme = 'light' | 'dark'
export type StoredScheme = ThemeScheme | null

const STORAGE_KEY = 'color-scheme'
const DARK_MQ = '(prefers-color-scheme: dark)'

const readStored = (): StoredScheme => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export const getSystemScheme = (): ThemeScheme =>
  window.matchMedia(DARK_MQ).matches ? 'dark' : 'light'

export const resolveScheme = (stored: StoredScheme = readStored()): ThemeScheme =>
  stored ?? getSystemScheme()

export const syncSchemeMeta = (stored: StoredScheme) => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (meta) {
    meta.content = stored ?? 'light dark'
  }
  const resolved = resolveScheme(stored)
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeColor) {
    themeColor.content = resolved === 'dark' ? '#05040f' : '#e8c4b0'
  }
}

/**
 * 遵循两态主题切换规范：
 * - 目标主题 = 当前渲染主题的相反值（而非系统默认值的相反值）
 * - 目标与当前系统偏好不同 -> 持久化该字面值
 * - 目标与当前系统偏好相同 -> 清除持久化键，恢复跟随系统
 * - 系统偏好变化时绝不自动删除已存储的手动覆盖值
 */
export const toggleThemeScheme = (): ThemeScheme => {
  const currentRendered = resolveScheme()
  const target: ThemeScheme = currentRendered === 'dark' ? 'light' : 'dark'
  const system = getSystemScheme()
  const nextStored: StoredScheme = target === system ? null : target

  try {
    if (nextStored === null) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, nextStored)
    }
  } catch {
    // 隐私模式或禁用存储时仍保持当前会话切换生效
  }

  syncSchemeMeta(nextStored)
  return target
}

/** 订阅系统偏好变化与跨标签页 storage 同步 */
export const subscribeThemeChanges = (onChange: (scheme: ThemeScheme) => void): (() => void) => {
  const mq = window.matchMedia(DARK_MQ)

  const handleMediaChange = () => {
    const stored = readStored()
    syncSchemeMeta(stored)
    onChange(resolveScheme(stored))
  }

  const handleStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return
    const stored = readStored()
    syncSchemeMeta(stored)
    onChange(resolveScheme(stored))
  }

  mq.addEventListener('change', handleMediaChange)
  window.addEventListener('storage', handleStorage)
  return () => {
    mq.removeEventListener('change', handleMediaChange)
    window.removeEventListener('storage', handleStorage)
  }
}
