/** 画质档位：控制分辨率、阴影、倒影、粒子与着色器复杂度 */
export type QualityLevel = 'low' | 'mid' | 'high'

export interface QualityPreset {
  /** 渲染像素比上限 */
  pixelRatio: number
  /** 月光阴影贴图边长；0 表示关闭实时阴影 */
  shadowMapSize: number
  /** 实际绘制的草叶数量 */
  grassBlades: number
  /** 实际绘制的芦苇数量 */
  reeds: number
  /** 浮尘微光粒子数量 */
  motes: number
  /** 水雾 / 山雾数量 */
  mists: number
  /** 星星绘制比例（0 ~ 1） */
  stars: number
  /** 辉光后期（月、火、灯、残霞的光晕）；低画质关闭 */
  bloom: boolean
  /** 河面实时倒影贴图相对画布的比例；0 表示关闭二次场景渲染，改用低开销程序化倒影 */
  reflection: number
  /** 倒影中跳过细碎陈设（芦苇、草、碎石）并隔帧刷新，减轻中画质 GPU 压力 */
  reflectionLite: boolean
  /** 简化水面与天空云层的噪声层数 */
  liteShaders: boolean
  /** 雨滴丝数量 */
  rainDrops: number
  /** 雪花粒子数量 */
  snowFlakes: number
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    pixelRatio: 0.75,
    shadowMapSize: 0,
    grassBlades: 70,
    reeds: 80,
    motes: 16,
    mists: 5,
    stars: 0.45,
    bloom: false,
    reflection: 0,
    reflectionLite: true,
    liteShaders: true,
    rainDrops: 360,
    snowFlakes: 280,
  },
  mid: {
    pixelRatio: 1.25,
    shadowMapSize: 1024,
    grassBlades: 200,
    reeds: 180,
    motes: 45,
    mists: 20,
    stars: 0.75,
    bloom: true,
    reflection: 0.35,
    reflectionLite: true,
    liteShaders: false,
    rainDrops: 950,
    snowFlakes: 780,
  },
  high: {
    pixelRatio: 1.75,
    shadowMapSize: 2048,
    grassBlades: 320,
    reeds: 280,
    motes: 70,
    mists: 32,
    stars: 1,
    bloom: true,
    reflection: 0.6,
    reflectionLite: false,
    liteShaders: false,
    rainDrops: 1800,
    snowFlakes: 1500,
  },
}

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: '低',
  mid: '中',
  high: '高',
}

const STORAGE_KEY = 'element17.quality'

export const loadSavedQuality = (): QualityLevel | null => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'low' || v === 'mid' || v === 'high' ? v : null
  } catch {
    return null
  }
}

export const saveQuality = (q: QualityLevel) => {
  try {
    localStorage.setItem(STORAGE_KEY, q)
  } catch {
    /* 隐私模式下忽略 */
  }
}

/** 首次访问时按设备性能估一档：触屏 / 小屏 / 核心少 -> 低，次之 -> 中 */
export const autoQuality = (): QualityLevel => {
  const cores = navigator.hardwareConcurrency ?? 4
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 500
  if (coarse || smallScreen || cores <= 4) return 'low'
  if (cores <= 8) return 'mid'
  return 'high'
}
