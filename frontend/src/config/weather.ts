/** 场景适配的天气大类（晴天 / 阴雾 / 雨天 / 下雪） */
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow'

/** 用户可选的天气模式：live 跟随东北师大实时天气，其余为手动切换演示 */
export type WeatherMode = 'live' | WeatherKind

/** 东北师范大学（人民大街/自由校区，吉林长春）地理坐标 */
export const NENU_LOCATION = {
  name: '东北师范大学',
  shortName: '东北师大',
  campus: '吉林长春 · 人民大街校区',
  latitude: 43.8586,
  longitude: 125.3246,
  timezone: 'Asia/Shanghai',
} as const

export interface LiveWeather {
  /** 映射到 3D 场景的天气大类 */
  kind: WeatherKind
  /** 中文实时天气描述（如 晴朗 / 多云 / 小雨 / 中雪） */
  label: string
  /** WMO 天气代码（备用源无代码时为 -1） */
  wmoCode: number
  /** 当前气温（°C） */
  temperature: number
  /** 体感温度（°C） */
  apparentTemperature: number
  /** 相对湿度（%） */
  humidity: number
  /** 10m 风速（km/h） */
  windSpeed: number
  /** 当前降水量（mm） */
  precipitation: number
  /** 当前降雪量（cm） */
  snowfall: number
  /** 云量（%） */
  cloudCover: number
  /** 是否处于白天 */
  isDay: boolean
  /** 是否有雷电 */
  isThunder: boolean
  /** 气象观测时间（原始字符串） */
  observedAt: string
  /** 前端拉取时间戳（ms） */
  fetchedAt: number
  /** 数据源标识 */
  source: 'open-meteo' | 'wttr'
}

export interface WeatherMeta {
  id: WeatherKind
  label: string
  shortLabel: string
  sceneSummary: string
}

export const WEATHER_KINDS: WeatherKind[] = ['clear', 'cloudy', 'rain', 'snow']

export const WEATHER_META: Record<WeatherKind, WeatherMeta> = {
  clear: {
    id: 'clear',
    label: '晴天',
    shortLabel: '晴',
    sceneSummary: '清朗微风 · 剑客倚石守炉，篝火安燃',
  },
  cloudy: {
    id: 'cloudy',
    label: '阴雾',
    shortLabel: '阴',
    sceneSummary: '云霭低垂 · 河雾渐浓，篝火微明',
  },
  rain: {
    id: 'rain',
    label: '雨天',
    shortLabel: '雨',
    sceneSummary: '烟雨垂钓 · 篝火熄灭，剑客移步河畔垂钓',
  },
  snow: {
    id: 'snow',
    label: '下雪',
    shortLabel: '雪',
    sceneSummary: '寒江飞雪 · 积雪覆岸，剑客撑红伞立雪',
  },
}

/** 根据 WMO 天气代码与降水/降雪字段归类到场景天气并给出中文描述 */
export function classifyWmoWeather(
  code: number,
  rainMm = 0,
  snowfallCm = 0,
): { kind: WeatherKind; label: string; isThunder: boolean } {
  switch (code) {
    case 0:
      return { kind: 'clear', label: '晴朗', isThunder: false }
    case 1:
      return { kind: 'clear', label: '大部晴朗', isThunder: false }
    case 2:
      return { kind: 'cloudy', label: '多云', isThunder: false }
    case 3:
      return { kind: 'cloudy', label: '阴', isThunder: false }
    case 45:
      return { kind: 'cloudy', label: '有雾', isThunder: false }
    case 48:
      return { kind: 'cloudy', label: '冻雾', isThunder: false }
    case 51:
      return { kind: 'rain', label: '毛毛雨', isThunder: false }
    case 53:
      return { kind: 'rain', label: '细雨', isThunder: false }
    case 55:
      return { kind: 'rain', label: '密细雨', isThunder: false }
    case 56:
    case 57:
      return { kind: 'rain', label: '冻毛毛雨', isThunder: false }
    case 61:
      return { kind: 'rain', label: '小雨', isThunder: false }
    case 63:
      return { kind: 'rain', label: '中雨', isThunder: false }
    case 65:
      return { kind: 'rain', label: '大雨', isThunder: false }
    case 66:
    case 67:
      return { kind: 'rain', label: '冻雨', isThunder: false }
    case 71:
      return { kind: 'snow', label: '小雪', isThunder: false }
    case 73:
      return { kind: 'snow', label: '中雪', isThunder: false }
    case 75:
      return { kind: 'snow', label: '大雪', isThunder: false }
    case 77:
      return { kind: 'snow', label: '米雪', isThunder: false }
    case 80:
      return { kind: 'rain', label: '小阵雨', isThunder: false }
    case 81:
      return { kind: 'rain', label: '阵雨', isThunder: false }
    case 82:
      return { kind: 'rain', label: '强阵雨', isThunder: false }
    case 85:
      return { kind: 'snow', label: '小阵雪', isThunder: false }
    case 86:
      return { kind: 'snow', label: '强阵雪', isThunder: false }
    case 95:
      return { kind: 'rain', label: '雷阵雨', isThunder: true }
    case 96:
    case 99:
      return { kind: 'rain', label: '雷雨伴冰雹', isThunder: true }
    default:
      if (snowfallCm > 0) return { kind: 'snow', label: '降雪', isThunder: false }
      if (rainMm > 0) return { kind: 'rain', label: '降雨', isThunder: false }
      return { kind: 'clear', label: '晴', isThunder: false }
  }
}

const MODE_STORAGE_KEY = 'element17.weather.mode'

export function loadSavedWeatherMode(): WeatherMode {
  try {
    const raw = window.localStorage.getItem(MODE_STORAGE_KEY)
    if (raw === 'live' || raw === 'clear' || raw === 'cloudy' || raw === 'rain' || raw === 'snow') {
      return raw
    }
  } catch {
    /* 忽略隐私模式异常 */
  }
  return 'live'
}

export function saveWeatherMode(mode: WeatherMode) {
  try {
    if (mode === 'live') window.localStorage.removeItem(MODE_STORAGE_KEY)
    else window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    /* 忽略隐私模式异常 */
  }
}
