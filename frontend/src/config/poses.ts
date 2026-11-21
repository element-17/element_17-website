/**
 * 主角唯一的姿态。坐标系：3D 世界米制，原点在站点地面中心，+Y 向上。
 * 其余四个模块围绕同一处篝火营地取景，因此这里只有 home 一套关节坐标。
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
 * Home: 倚石按剑而坐。
 * - 髋部球体恰好落在倚石顶坡面（零穿模、不悬空）；
 * - 双肩从颈侧自然展开，双手一上一下叠握在身前的剑柄之上（护手在左手下方，剑首在右手上方）；
 * - 长剑斜拄于身前泥地，剑柄与头颈/胸腹、剑身与双腿/倚石之间均经三角网格距离校验保持安全间隙。
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
