/**
 * 主角姿态集合。坐标系：3D 世界米制，原点在人物落脚点，+Y 向上。
 * - HOME_POSE：晴天 / 阴雾 —— 倚石按剑守炉而坐；
 * - FISHING_POSE：雨天 —— 移步河畔青石执竿垂钓，长剑插立身旁；
 * - SNOW_UMBRELLA_POSE：下雪 —— 倚坐覆雪巨石，肩后斜倚红油纸伞，左臂扶长剑赏雪。
 */
type P = [number, number, number]

export const JOINTS = [
  'head',
  'neck',
  'chest',
  'hip',
  'shoulderL',
  'elbowL',
  'handL',
  'shoulderR',
  'elbowR',
  'handR',
  'kneeL',
  'footL',
  'kneeR',
  'footR',
  'hilt',
  'tip',
] as const

export type Joint = (typeof JOINTS)[number]
type PoseInput = Record<Joint, P> & { tilt: number; yaw: number }
export type Pose = Record<`${Joint}${'X' | 'Y' | 'Z'}` | 'tilt' | 'yaw', number>

const build = (p: PoseInput): Pose => {
  const out: Record<string, number> = { tilt: p.tilt, yaw: p.yaw }
  for (const j of JOINTS) {
    const [x, y, z] = p[j]
    out[`${j}X`] = x
    out[`${j}Y`] = y
    out[`${j}Z`] = z
  }
  return out as Pose
}

/**
 * 晴天 / 阴雾：倚石按剑而坐。
 * - 髋部球体恰好落在倚石顶坡面（零穿模、不悬空）；
 * - 双肩从颈侧自然展开，双手一上一下叠握在身前的剑柄之上；
 * - 长剑斜拄于身前泥地。
 */
export const HOME_POSE: Pose = build({
  tilt: 6,
  yaw: -15,
  head: [0.37, 1.38, -0.1],
  neck: [0.42, 1.22, -0.13],
  chest: [0.45, 1.03, -0.14],
  hip: [0.49, 0.76, -0.15],
  shoulderL: [0.47, 1.19, -0.05],
  elbowL: [0.46, 0.96, 0.14],
  handL: [0.224, 0.898, 0.183],
  shoulderR: [0.37, 1.19, -0.21],
  elbowR: [0.14, 1.05, -0.09],
  handR: [0.228, 1.0, 0.16],
  kneeL: [0.16, 0.82, 0.12],
  footL: [-0.08, 0.04, 0.25],
  kneeR: [0.05, 0.67, -0.15],
  footR: [-0.3, 0.04, -0.11],
  hilt: [0.22, 0.82, 0.2],
  tip: [0.18, -0.04, 0.39],
})

/**
 * 雨天：河畔青石执竿垂钓（局部 -Z 为面向河心，yaw=+13° 略向左前开阔水面伸竿）。
 * - 坐在水边扁石上，双腿垂向湿泥浅岸，上身微微前倾；
 * - 左手托住竹竿尾端、右手前握竿身，将细竹钓竿探出水面；
 * - 长剑斜插在右后侧湿泥里。
 */
export const FISHING_POSE: Pose = build({
  tilt: 4,
  yaw: 13,
  head: [0, 0.99, -0.15],
  neck: [0, 0.83, -0.1],
  chest: [0, 0.65, -0.05],
  hip: [0, 0.4, 0.04],
  shoulderL: [-0.1, 0.8, -0.1],
  elbowL: [-0.18, 0.56, -0.24],
  handL: [-0.03, 0.52, -0.44],
  shoulderR: [0.1, 0.8, -0.1],
  elbowR: [0.18, 0.59, -0.28],
  handR: [0.02, 0.61, -0.53],
  kneeL: [-0.14, 0.42, -0.36],
  footL: [-0.15, -0.07, -0.54],
  kneeR: [0.15, 0.44, -0.34],
  footR: [0.16, -0.04, -0.48],
  // 长剑插在左后方岸边，完全避开右飘的红巾与前探的竹钓竿
  hilt: [-0.46, 0.68, 0.16],
  tip: [-0.5, -0.14, 0.12],
})

/**
 * 下雪：倚雪石斜倚红油纸伞赏雪（与 HOME_POSE 同处巨石、延续经典端正修长坐姿）。
 * - 上身端正微前倾稳坐覆雪巨石（不后仰），左膝高曲、右腿舒展长伸踏雪；
 * - 左手自然扶握身前 1.44m 修长古剑剑柄，长剑斜拄雪地，气度沉稳大气；
 * - 右手在肩后握稳漆竹伞柄，红油纸伞向肩后斜倾约 29° 展开，与覆雪斗笠、后飘红巾错落成画。
 */
export const SNOW_UMBRELLA_POSE: Pose = build({
  tilt: 5,
  yaw: -15,
  head: [0.4, 1.38, -0.11],
  neck: [0.44, 1.22, -0.13],
  chest: [0.46, 1.03, -0.14],
  hip: [0.49, 0.76, -0.15],
  // 近侧左臂：肘部贴近高曲左膝，手掌从容扶握修长剑柄
  shoulderL: [0.48, 1.18, -0.05],
  elbowL: [0.37, 0.96, 0.11],
  handL: [0.18, 1.08, 0.21],
  // 远侧右臂：肘部自然外展打开（约 72°），前臂舒展托握漆竹伞柄，与躯干/左臂/伞尾均留出充裕三维净空
  shoulderR: [0.4, 1.18, -0.22],
  elbowR: [0.43, 0.95, -0.4],
  handR: [0.24, 1.15, -0.53],
  // 延续 HOME_POSE 经典长腿坐姿：左膝高曲、右腿长伸
  kneeL: [0.16, 0.86, 0.14],
  footL: [0.06, 0.04, 0.24],
  kneeR: [0.07, 0.65, -0.2],
  footR: [-0.36, 0.04, -0.14],
  // 修长古剑（配合雪天 1.36x 剑身比例达 1.2m 刃长、1.44m 全长）斜拄身前雪地
  hilt: [0.14, 0.99, 0.25],
  tip: [-0.24, -0.06, 0.56],
})
