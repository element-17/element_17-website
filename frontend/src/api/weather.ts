import {
  NENU_LOCATION,
  classifyWmoWeather,
  type LiveWeather,
  type WeatherKind,
} from '../config/weather'

const CACHE_KEY = 'element17.nenu.weather.v1'
/** 本地缓存 5 分钟：既避免刷新抖动，又保证接近实时 */
const CACHE_TTL_MS = 5 * 60 * 1000
/** 自动轮询周期：每 10 分钟静默刷新一次 */
export const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000

interface OpenMeteoResponse {
  current?: {
    time?: string
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    weather_code?: number
    precipitation?: number
    rain?: number
    snowfall?: number
    cloud_cover?: number
    wind_speed_10m?: number
    is_day?: number
  }
}

interface WttrResponse {
  current_condition?: Array<{
    temp_C?: string
    FeelsLikeC?: string
    humidity?: string
    windspeedKmph?: string
    precipMM?: string
    cloudcover?: string
    weatherCode?: string
    localObsDateTime?: string
    weatherDesc?: Array<{ value?: string }>
  }>
}

/** 读取未过期的本地实况缓存（用于首屏立即可用） */
export function readCachedNenuWeather(): LiveWeather | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LiveWeather
    if (
      typeof parsed?.fetchedAt !== 'number' ||
      Date.now() - parsed.fetchedAt > CACHE_TTL_MS ||
      typeof parsed.temperature !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeCachedNenuWeather(data: LiveWeather) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {
    /* 忽略存储受限场景 */
  }
}

function combineSignalWithTimeout(external?: AbortSignal, timeoutMs = 8000): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onAbort, { once: true })
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  }
}

async function fetchFromOpenMeteo(signal?: AbortSignal): Promise<LiveWeather> {
  const { latitude, longitude, timezone } = NENU_LOCATION
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'weather_code',
      'precipitation',
      'rain',
      'snowfall',
      'cloud_cover',
      'wind_speed_10m',
      'is_day',
    ].join(','),
    timezone,
  })
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`
  const { signal: combined, cleanup } = combineSignalWithTimeout(signal, 8000)
  try {
    const res = await fetch(url, { signal: combined, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
    const json = (await res.json()) as OpenMeteoResponse
    const cur = json.current
    if (!cur || typeof cur.temperature_2m !== 'number') {
      throw new Error('Open-Meteo 响应缺少实时天气字段')
    }
    const wmoCode = typeof cur.weather_code === 'number' ? cur.weather_code : 0
    const rain = typeof cur.rain === 'number' ? cur.rain : 0
    const snowfall = typeof cur.snowfall === 'number' ? cur.snowfall : 0
    const classified = classifyWmoWeather(wmoCode, rain, snowfall)

    return {
      kind: classified.kind,
      label: classified.label,
      wmoCode,
      temperature: cur.temperature_2m,
      apparentTemperature: typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : cur.temperature_2m,
      humidity: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : 50,
      windSpeed: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : 0,
      precipitation: typeof cur.precipitation === 'number' ? cur.precipitation : 0,
      snowfall,
      cloudCover: typeof cur.cloud_cover === 'number' ? cur.cloud_cover : 0,
      isDay: cur.is_day !== 0,
      isThunder: classified.isThunder,
      observedAt: cur.time ?? new Date().toISOString(),
      fetchedAt: Date.now(),
      source: 'open-meteo',
    }
  } finally {
    cleanup()
  }
}

function classifyWttrDesc(desc: string, codeNum: number): { kind: WeatherKind; label: string; isThunder: boolean } {
  const lower = desc.toLowerCase()
  const isThunder = lower.includes('thunder') || codeNum === 200 || codeNum >= 386
  if (lower.includes('snow') || lower.includes('blizzard') || lower.includes('sleet') || lower.includes('ice')) {
    return { kind: 'snow', label: lower.includes('heavy') ? '大雪' : '降雪', isThunder }
  }
  if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower') || isThunder) {
    return { kind: 'rain', label: isThunder ? '雷阵雨' : lower.includes('heavy') ? '大雨' : '降雨', isThunder }
  }
  if (lower.includes('fog') || lower.includes('mist') || lower.includes('haze')) {
    return { kind: 'cloudy', label: '有雾', isThunder: false }
  }
  if (lower.includes('cloud') || lower.includes('overcast')) {
    return { kind: 'cloudy', label: lower.includes('overcast') ? '阴' : '多云', isThunder: false }
  }
  return { kind: 'clear', label: '晴朗', isThunder: false }
}

async function fetchFromWttr(signal?: AbortSignal): Promise<LiveWeather> {
  const { latitude, longitude } = NENU_LOCATION
  const url = `https://wttr.in/${latitude},${longitude}?format=j1`
  const { signal: combined, cleanup } = combineSignalWithTimeout(signal, 8000)
  try {
    const res = await fetch(url, { signal: combined, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`wttr.in HTTP ${res.status}`)
    const json = (await res.json()) as WttrResponse
    const cur = json.current_condition?.[0]
    if (!cur) throw new Error('wttr.in 响应缺少实时天气字段')
    const temp = Number(cur.temp_C)
    if (!Number.isFinite(temp)) throw new Error('wttr.in 温度解析失败')
    const feels = Number(cur.FeelsLikeC)
    const humidity = Number(cur.humidity)
    const windSpeed = Number(cur.windspeedKmph)
    const precip = Number(cur.precipMM)
    const cloudCover = Number(cur.cloudcover)
    const desc = cur.weatherDesc?.[0]?.value ?? ''
    const codeNum = Number(cur.weatherCode) || 0
    const classified = classifyWttrDesc(desc, codeNum)
    const hour = new Date().getHours()

    return {
      kind: classified.kind,
      label: classified.label,
      wmoCode: -1,
      temperature: temp,
      apparentTemperature: Number.isFinite(feels) ? feels : temp,
      humidity: Number.isFinite(humidity) ? humidity : 50,
      windSpeed: Number.isFinite(windSpeed) ? windSpeed : 0,
      precipitation: Number.isFinite(precip) ? precip : 0,
      snowfall: classified.kind === 'snow' && Number.isFinite(precip) ? precip * 0.1 : 0,
      cloudCover: Number.isFinite(cloudCover) ? cloudCover : 0,
      isDay: hour >= 6 && hour < 18,
      isThunder: classified.isThunder,
      observedAt: cur.localObsDateTime ?? new Date().toISOString(),
      fetchedAt: Date.now(),
      source: 'wttr',
    }
  } finally {
    cleanup()
  }
}

/**
 * 实时获取东北师范大学天气：
 * - 优先使用 Open-Meteo（原生 CORS，按学校精确经纬度返回实时气象）；
 * - 主源异常时自动降级到 wttr.in；
 * - 成功后写入短时缓存供首屏复用。
 */
export async function fetchNenuWeather(options?: {
  force?: boolean
  signal?: AbortSignal
}): Promise<LiveWeather> {
  if (!options?.force) {
    const cached = readCachedNenuWeather()
    if (cached) return cached
  }
  try {
    const data = await fetchFromOpenMeteo(options?.signal)
    writeCachedNenuWeather(data)
    return data
  } catch (primaryErr) {
    if (options?.signal?.aborted) throw primaryErr
    try {
      const fallback = await fetchFromWttr(options?.signal)
      writeCachedNenuWeather(fallback)
      return fallback
    } catch {
      throw new Error('东北师大实时天气获取失败，请检查网络后重试')
    }
  }
}

/** 把观测时间格式化为简洁的 HH:mm */
export function formatObservedTime(observedAt: string, fetchedAt: number): string {
  const m = observedAt.match(/(\d{2}:\d{2})/)
  if (m) return m[1]
  const d = new Date(fetchedAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
