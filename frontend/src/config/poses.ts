/**
 * 主角唯一的姿态。坐标系：3D 世界米制，原点在站点地面中心，+Y 向上。
 * 其余四个站点是纯风景，不再有火柴人，因此这里只有 home 一套关节坐标。
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

/** Home: 倚石抱剑而坐。石头顶面最高点约 (0.71, 0.87, -0.18)，髋部落在其左侧坡面上（表面 ~0.72）。
 *  剑拄在身前地上：柄在右手，剑尖点地 (0.62,0,0.28)，剑身在大腿外侧、石头坡脚之前，不碰肢体与石面。 */
export const HOME_POSE: Pose = build({
  tilt: -18,
  yaw: -15,
  head: [0.32, 1.28, -0.08],
  neck: [0.38, 1.18, -0.12],
  chest: [0.42, 0.99, -0.15],
  hip: [0.5, 0.72, -0.18],
  elbowL: [0.14, 1.0, 0.05],
  handL: [0.34, 1.02, 0.02],
  elbowR: [0.54, 0.98, -0.25],
  handR: [0.38, 1.0, -0.05],
  kneeL: [0.12, 0.82, -0.05],
  footL: [-0.08, 0.01, 0.08],
  kneeR: [0.22, 0.72, -0.35],
  footR: [-0.18, 0.01, -0.5],
  hilt: [0.38, 1.0, -0.05],
  tip: [0.62, -0.02, 0.28],
})
