/**
 * 主角姿态集合。坐标系：3D 世界米制，原点在人物落脚点，+Y 向上。
 * - HOME_POSE：晴天 / 阴雾 —— 倚石按剑守炉而坐；
 * - FISHING_POSE：雨天 —— 移步河畔青石执竿垂钓，长剑插立身旁；
 * - SNOW_WARM_POSE：下雪 —— 蹲跪篝火旁伸手烤火暖身，长剑斜插身侧。
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
 * 下雪：围炉烤火（局部 -Z 朝向篝火，yaw=+117° 对准 CAMP.fire）。
 * - 左腿蹲立、右膝轻点雪地，上身微俯，双手前伸向火光取暖；
 * - 长剑斜插在身侧偏前的雪地里，剑身与剑柄清晰可见。
 */
export const SNOW_WARM_POSE: Pose = build({
  tilt: 5,
  yaw: 117,
  head: [0, 1.0, -0.15],
  neck: [0, 0.85, -0.08],
  chest: [0, 0.69, 0.0],
  hip: [0, 0.46, 0.14],
  shoulderL: [-0.1, 0.82, -0.07],
  elbowL: [-0.17, 0.6, -0.26],
  handL: [-0.08, 0.62, -0.51],
  shoulderR: [0.1, 0.82, -0.07],
  elbowR: [0.17, 0.6, -0.26],
  handR: [0.08, 0.63, -0.51],
  kneeL: [-0.15, 0.5, -0.26],
  footL: [-0.16, 0.04, -0.18],
  kneeR: [0.16, 0.06, -0.06],
  footR: [0.14, 0.05, 0.36],
  hilt: [-0.46, 0.76, -0.18],
  tip: [-0.52, -0.08, -0.24],
})
