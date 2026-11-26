import type { ModuleId } from './modules'
import type { WeatherKind } from './weather'

/**
 * 机位：相机位置 (px, py, pz) + 注视点 (tx, ty, tz)。
 * 五个模块都围着首页营地与河畔取景；不同天气下，归处与来历会平滑跟随主角（河畔垂钓 / 围炉烤火）。
 * shift  : 画面水平偏移（视口宽度比例，负值 = 主体偏右，给左侧面板让位）
 * shiftY : 画面垂直偏移（视口高度比例，负值 = 主体偏下）
 * par    : 鼠标视差强度（近景要小，否则卷上的文字跟着晃）
 */
export interface Shot {
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
  fov: number
  shift: number
  shiftY: number
  exposure: number
  fire: number
  vig: number
  par: number
}

/** 营地与河畔各件陈设/活动点的地面坐标 */
export const CAMP = {
  hero: { x: 0, z: 0 },
  /** 下雪时主角靠近篝火蹲坐烤火的位置（与倚石留出余量，红巾飘带不穿石） */
  snowHero: { x: -0.92, z: 0.32 },
  /** 下雨时主角移步到近岸水边扁石上垂钓的位置 */
  fishing: { x: -1.15, z: -7.45 },
  fire: { x: -1.75, z: 0.75 },
  /** 藏卷：篝火左前方一张矮几，几上摊开一卷古卷 */
  scroll: { x: -2.85, z: 1.45, yaw: 0.16 },
  /** 铸剑：主角右后方的树桩铁砧与插在地上的剑 */
  anvil: { x: 3.25, z: -1.2, yaw: 0.25 },
  /** 传书：营地左侧靠水的一根挂灯木杆 + 信箱 + 信鸽（避开首页左侧标题区与古卷阴影） */
  post: { x: -6.3, z: -2.2, yaw: 0.42 },
}

/** 矮几桌面高度与卷面尺寸（m）：卷面上的 DOM 文字按这四个角做透视贴合 */
export const SCROLL_TABLE_Y = 0.3
export const SCROLL_PAPER = { w: 1.0, d: 0.46 }

/** 这些圆形区域里不长草、不放碎石，免得穿过桌面、铁砧、河畔钓点或人物 */
export const CLEAR_ZONES: { x: number; z: number; r: number }[] = [
  { x: CAMP.hero.x + 0.5, z: CAMP.hero.z - 0.2, r: 1.15 },
  { x: CAMP.snowHero.x, z: CAMP.snowHero.z, r: 0.9 },
  { x: CAMP.fishing.x, z: CAMP.fishing.z, r: 1.5 },
  { x: CAMP.fire.x, z: CAMP.fire.z, r: 1.25 },
  { x: CAMP.scroll.x, z: CAMP.scroll.z, r: 1.55 },
  { x: CAMP.anvil.x, z: CAMP.anvil.z, r: 1.2 },
  { x: CAMP.post.x, z: CAMP.post.z, r: 0.85 },
]

const base = { shiftY: 0, exposure: 1, fire: 1, vig: 0.4, par: 1 }

/** 卷面中心 */
const P = { x: CAMP.scroll.x, y: SCROLL_TABLE_Y, z: CAMP.scroll.z }

export const SHOTS: Record<ModuleId, Shot> = {
  // 开场：火柴人倚石抱剑而坐，镜头正对着他，视场宽松能看清营地与远村
  home: { ...base, px: 0, py: 1.15, pz: 4.6, tx: 0, ty: 1.15, tz: 0, fov: 36, shift: -0.18, vig: 0.35 },
  // 藏卷：俯身凑到篝火旁的矮几上，古卷占画面右侧一半
  blog: {
    ...base,
    px: P.x + 0.22,
    py: P.y + 1.32,
    pz: P.z + 1.28,
    tx: P.x + 0.02,
    ty: P.y,
    tz: P.z - 0.04,
    fov: 36,
    shift: -0.17,
    exposure: 1.08,
    vig: 0.48,
    par: 0.16,
  },
  // 铸剑：转向主角右后方的铁砧与插剑，铁砧偏左给右侧面板让位
  projects: {
    ...base,
    px: 4.4,
    py: 1.24,
    pz: 2.05,
    tx: 3.1,
    ty: 0.52,
    tz: -1.2,
    fov: 36,
    shift: 0.16,
    exposure: 1.04,
    par: 0.7,
  },
  // 来历：贴近主角，侧前方的半身像，篝火暖光勾亮斗笠与红巾
  about: {
    ...base,
    px: -0.85,
    py: 1.18,
    pz: 2.05,
    tx: 0.28,
    ty: 0.98,
    tz: -0.12,
    fov: 36,
    shift: 0.16,
    vig: 0.45,
    par: 0.6,
  },
  // 传书：回身望向月下河畔，挂灯木杆、纸鸢与信鸽立在水边，乌篷船泊在月光里
  contact: {
    ...base,
    px: -4.65,
    py: 1.25,
    pz: 1.85,
    tx: -6.45,
    ty: 1.42,
    tz: -2.5,
    fov: 36,
    shift: -0.15,
    exposure: 0.96,
    vig: 0.54,
    par: 0.8,
  },
}

/** 不同天气下的机位微调：雨天切到河畔垂钓、篝火熄灭；雪天微移聚焦围炉烤火 */
const WEATHER_OVERRIDES: Partial<Record<WeatherKind, Partial<Record<ModuleId, Partial<Shot>>>>> = {
  cloudy: {
    home: { fire: 0.92, vig: 0.4 },
    blog: { fire: 0.92 },
    projects: { fire: 0.92 },
    about: { fire: 0.92 },
    contact: { fire: 0.92 },
  },
  rain: {
    // 烟雨垂钓：推到近岸取景，右侧清晰呈现执竿钓鱼的主角、水面浮漂涟漪与雨中乌篷船
    home: {
      px: 1.95,
      py: 1.18,
      pz: -4.35,
      tx: -1.25,
      ty: 0.34,
      tz: -8.1,
      fov: 36,
      shift: -0.18,
      exposure: 1.02,
      fire: 0,
      vig: 0.44,
    },
    blog: {
      fire: 0,
      exposure: 1.14,
      vig: 0.5,
    },
    projects: {
      fire: 0,
      exposure: 1.06,
    },
    // 来历：跟到河畔给垂钓中的剑客一个近景侧影
    about: {
      px: 0.72,
      py: 0.9,
      pz: -6.1,
      tx: -1.15,
      ty: 0.42,
      tz: -7.55,
      fov: 36,
      shift: 0.16,
      exposure: 1.04,
      fire: 0,
      vig: 0.46,
      par: 0.55,
    },
    contact: {
      fire: 0,
      exposure: 0.98,
    },
  },
  snow: {
    // 寒江飞雪：同框呈现围炉烤火的剑客、旺燃融雪的篝火与覆雪倚石
    home: {
      px: -0.18,
      py: 1.16,
      pz: 4.55,
      tx: -0.68,
      ty: 0.86,
      tz: 0.18,
      fov: 36,
      shift: -0.18,
      exposure: 1.02,
      fire: 1.18,
      vig: 0.36,
    },
    blog: { fire: 1.15 },
    projects: { fire: 1.15 },
    about: {
      px: -1.85,
      py: 1.02,
      pz: 2.38,
      tx: -0.82,
      ty: 0.72,
      tz: 0.28,
      fov: 36,
      shift: 0.16,
      fire: 1.18,
      vig: 0.44,
      par: 0.6,
    },
    contact: { fire: 1.15 },
  },
}

/**
 * 窄屏（竖屏手机）：主体居中压到画面下半部、视角略放宽，给顶部面板让出背景；
 * 藏卷需要整卷横向铺满屏宽，单独抬高、拉远成接近俯视的机位。
 */
const MOBILE: Partial<Record<ModuleId, Partial<Shot>>> = {
  blog: {
    px: P.x,
    py: P.y + 3.05,
    pz: P.z + 1.4,
    tx: P.x,
    ty: P.y,
    tz: P.z,
    shiftY: -0.2,
  },
}

export const shotFor = (id: ModuleId, narrow: boolean, weather: WeatherKind = 'clear'): Shot => {
  const s = { ...SHOTS[id], ...WEATHER_OVERRIDES[weather]?.[id] }
  if (!narrow) return s
  return { ...s, shift: 0, shiftY: -0.24, fov: s.fov + 4, ...MOBILE[id] }
}
