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
  'elbowL',
  'handL',
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
 * Home: 倚石抱剑而坐。
 * 经由倚石真实三角网格求交校验：髋部球体恰好落在大石顶坡面上（不悬空、不下陷），
 * 双腿、小腿及长剑剑身在完整鼠标视差摆动范围内（lean ∈ [-0.12, 0.12]）与倚石均保持零穿模。
 */
export const HOME_POSE: Pose = build({
  tilt: -18,
  yaw: -15,
  head: [0.32, 1.33, -0.06],
  neck: [0.38, 1.23, -0.1],
  chest: [0.42, 1.04, -0.13],
  hip: [0.49, 0.76, -0.15],
  elbowL: [0.14, 1.05, 0.06],
  handL: [0.34, 1.06, 0.04],
  elbowR: [0.53, 1.03, -0.23],
  handR: [0.37, 1.05, 0.0],
  kneeL: [0.1, 0.85, 0.04],
  footL: [-0.12, 0.04, 0.16],
  kneeR: [0.06, 0.67, -0.17],
  footR: [-0.3, 0.04, -0.14],
  hilt: [0.37, 1.05, 0.0],
  tip: [0.42, -0.01, 0.45],
})
