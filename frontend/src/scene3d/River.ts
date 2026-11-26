import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import type { QualityPreset } from '../config/quality'
import { NOISE_GLSL } from './glsl'
import { DETAIL_LAYER } from './merge'

/**
 * 河：主角所在的近岸与村落所在的对岸之间隔着一条四十来米宽的河。
 * 这个文件给出两条水线的解析式，地形、水面着色器、芦苇和石块都按同一组公式摆放。
 */

/** 水面高度：比岸上的平地低 0.4m */
export const WATER_Y = -0.4
/** 河床最深处 */
const BED_Y = -2.6
/** 水线处的岸坡（每米落差）；往岸上 BANK_RUN 米内逐渐抬平到地面 */
const BANK_SLOPE = 0.2
const BANK_RUN = 4
/** 对岸岬角的尖端：x 比它小的地方，对岸向远处退开，露出一片通到山脚的开阔水面（正好在月亮下方） */
const CAPE_X = -24

/** 近岸（主角这一侧）的水线：z 比它大是岸 */
export const nearShore = (x: number) => -9.4 + 1.3 * Math.sin(x * 0.09 + 0.5) + 0.7 * Math.sin(x * 0.23 + 1.7)

/** 对岸（村落一侧）的水线：z 比它小是岸 */
export const farShore = (x: number) =>
  -50 + 2.2 * Math.sin(x * 0.05 + 2) + 1.1 * Math.sin(x * 0.13 + 0.4) - 3 * Math.max(CAPE_X - x, 0) ** 1.3

/** 与上面两个函数逐项对应的 GLSL 版本，水面着色器用它算浅滩 */
const SHORE_GLSL = /* glsl */ `
  float nearShore(float x) {
    return -9.4 + 1.3 * sin(x * 0.09 + 0.5) + 0.7 * sin(x * 0.23 + 1.7);
  }
  float farShore(float x) {
    float k = max(${CAPE_X.toFixed(1)} - x, 0.0);
    return -50.0 + 2.2 * sin(x * 0.05 + 2.0) + 1.1 * sin(x * 0.13 + 0.4) - 3.0 * pow(k, 1.3);
  }
`

/** 到最近水线的带符号距离（m）：正值在岸上，负值在水里 */
export const shoreDistance = (x: number, z: number) => {
  const near = z - nearShore(x)
  // 岬角一侧的水线几乎沿 z 走，按水线斜率折算成垂直距离
  const slope = farShore(x + 0.5) - farShore(x - 0.5)
  const far = (farShore(x) - z) / Math.sqrt(1 + slope * slope)
  return Math.max(near, far)
}

/** 地面高度：岸上是 0，靠近水线缓缓落到水面，水下继续斜到河床 */
export const groundHeight = (x: number, z: number) => {
  const d = shoreDistance(x, z)
  if (d >= BANK_RUN) return 0
  if (d >= 0) return WATER_Y * (1 - d / BANK_RUN) ** 2
  return Math.max(BED_Y, WATER_Y + BANK_SLOPE * d)
}

/** 一条轴上的不等距刻度：[[起点, 步长], ..., [终点, 0]]，近处密、远处疏 */
const axis = (stops: [number, number][]) => {
  const out: number[] = []
  for (let i = 0; i < stops.length - 1; i++) {
    const [from, step] = stops[i]
    const to = stops[i + 1][0]
    for (let v = from; v < to - 1e-6; v += step) out.push(v)
  }
  out.push(stops[stops.length - 1][0])
  return out
}

/**
 * 两岸与河床连成的一整块地形。营地与近岸水线附近网格密，远处稀。
 * uv 直接取世界坐标（每 4m 铺一张贴图）；顶点色记录「湿度」：水线上下的泥滩更暗。
 */
export const buildTerrain = () => {
  const xs = axis([
    [-620, 80],
    [-180, 18],
    [-46, 2.0],
    [46, 18],
    [180, 80],
    [620, 0],
  ])
  const zs = axis([
    [-640, 80],
    [-190, 14],
    [-120, 5],
    [-58, 1.0],
    [-44, 4.5],
    [-13, 0.7],
    [-4, 1.4],
    [14, 10],
    [60, 80],
    [590, 0],
  ])
  const pos: number[] = []
  const uv: number[] = []
  const color: number[] = []
  for (const z of zs) {
    for (const x of xs) {
      pos.push(x, groundHeight(x, z), z)
      uv.push(x / 4, z / 4)
      const d = shoreDistance(x, z)
      const wet = 1 - THREE.MathUtils.smoothstep(d, -0.3, 1.4)
      const shade = 1 - 0.55 * wet
      color.push(shade, shade, shade)
    }
  }
  const cols = xs.length
  const index: number[] = []
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i
      const b = a + 1
      const c = a + cols
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

const vertexShader = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = textureMatrix * vec4(position, 1.0);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  uniform float uTime;
  uniform vec3 uMoonPos;
  uniform vec3 uMoonColor;
  uniform vec2 uSunDir;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uUseReflector;
  uniform float uLite;
  uniform float uDawn;
  uniform float uRain;
  uniform float uSnow;
  varying vec4 vUv;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  ${SHORE_GLSL}

  // 水往 +x 流：波纹整体顺流平移，并且沿流向被拉长
  float waveHeight(vec2 p, float detail) {
    float t = uTime;
    if (uLite > 0.5) {
      float h = fbm2(p * vec2(0.24, 0.62) - vec2(t * 0.16, t * 0.02));
      h += 0.35 * vnoise(p * vec2(0.95, 2.3) - vec2(t * 0.42, -t * 0.07));
      return h;
    }
    float h = fbm(p * vec2(0.22, 0.6) - vec2(t * 0.16, t * 0.02));
    h += 0.4 * vnoise(p * vec2(0.9, 2.3) - vec2(t * 0.42, -t * 0.07));
    h += detail * 0.16 * vnoise(p * vec2(3.1, 6.4) - vec2(t * 0.8, t * 0.21));
    return h;
  }

  // 雨滴击打水面产生的程序化同心涟漪（两层错开网格，近中景清晰自然）
  float rainRipples(vec2 p, float t) {
    float acc = 0.0;
    for (int k = 0; k < 2; k++) {
      float scale = k == 0 ? 1.15 : 1.78;
      vec2 q = p * scale + vec2(float(k) * 7.3, float(k) * 4.1);
      vec2 cell = floor(q);
      vec2 f = fract(q);
      float rnd = hash21(cell);
      float rnd2 = hash21(cell + vec2(17.1, 31.7));
      float cyc = fract(t * (0.95 + 0.55 * rnd) + rnd2);
      vec2 center = vec2(0.22 + 0.56 * rnd, 0.22 + 0.56 * rnd2);
      float d = length(f - center);
      float rad = cyc * 0.44;
      float ring = smoothstep(0.055, 0.0, abs(d - rad));
      float fade = (1.0 - cyc) * smoothstep(0.0, 0.08, cyc);
      acc += ring * fade;
    }
    return clamp(acc, 0.0, 1.0);
  }

  // 低画质程序化倒影：不跑二次场景渲染，直接按反射方向合成黑夜暮色 / 黎明晨光水影
  vec3 analyticReflection(vec3 R, vec2 grad, vec3 moonDir) {
    float h = max(R.y, 0.0);
    // 贴近真实平面反射的深紫夜水色阶
    vec3 nightSky = mix(vec3(0.085, 0.048, 0.155), vec3(0.042, 0.025, 0.105), smoothstep(0.0, 0.22, h));
    nightSky = mix(nightSky, vec3(0.015, 0.011, 0.045), smoothstep(0.18, 0.65, h));
    float az = max(dot(normalize(R.xz + 1e-5), uSunDir), 0.0);
    nightSky += vec3(0.65, 0.22, 0.34) * pow(az, 3.0) * exp(-h * 7.5) * 0.42 * (1.0 - uRain * 0.7);
    nightSky += vec3(0.95, 0.50, 0.28) * pow(az, 10.0) * exp(-h * 15.0) * 0.35 * (1.0 - uRain * 0.7);
    float mh = max(dot(R, moonDir), 0.0);
    nightSky += vec3(0.36, 0.32, 0.70) * (pow(mh, 44.0) * 0.42 + pow(mh, 10.0) * 0.07) * (1.0 - uRain * 0.65);

    // 黎明晨光水面反射
    vec3 dawnSky = mix(vec3(0.84, 0.68, 0.58), vec3(0.50, 0.62, 0.78), smoothstep(0.0, 0.26, h));
    dawnSky = mix(dawnSky, vec3(0.26, 0.44, 0.66), smoothstep(0.22, 0.7, h));
    dawnSky += vec3(0.96, 0.80, 0.54) * (pow(mh, 38.0) * 0.44 + pow(mh, 9.0) * 0.14) * (1.0 - uRain * 0.75);

    vec3 sky = mix(nightSky, dawnSky, uDawn);
    sky = mix(sky, mix(vec3(0.07, 0.09, 0.15), vec3(0.42, 0.48, 0.56), uDawn), uRain * 0.55);
    sky = mix(sky, mix(vec3(0.14, 0.17, 0.28), vec3(0.68, 0.74, 0.84), uDawn), uSnow * 0.45);

    // 远山与对岸剪影压暗贴近水面的反射带
    float ridge = smoothstep(0.012, 0.095, h + 0.02 * sin(vWorld.x * 0.11));
    sky *= mix(mix(0.34, 0.68, uDawn), 1.0, ridge);
    // 波纹横切出的明暗水带
    float band = 0.72 + 0.28 * sin(vWorld.z * 2.4 + grad.y * 2.2 - uTime * 1.1);
    sky *= band;
    // 船头灯与对岸窗灯/篝火拖出的细碎暖影
    float px = vWorld.x + grad.x * 0.35;
    float shimmer = pow(0.5 + 0.5 * sin(vWorld.z * 4.2 + grad.y * 4.5 - uTime * 2.4), 2.0);
    float lights =
      exp(-pow((px + 10.5) * 0.75, 2.0)) * smoothstep(-34.0, -24.0, vWorld.z) * 1.15 +
      exp(-pow((px + 13.5) * 0.55, 2.0)) * 0.55 +
      exp(-pow((px - 1.5) * 0.6, 2.0)) * 0.7 +
      exp(-pow((px - 10.0) * 0.48, 2.0)) * 0.95 +
      exp(-pow((px - 22.0) * 0.55, 2.0)) * 0.55;
    sky += vec3(1.0, 0.62, 0.26) * lights * shimmer * mix(0.62, 0.12, uDawn);
    return sky;
  }

  void main() {
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;

    // 水深：两条水线里离得近的那条说了算
    float slope = farShore(vWorld.x + 0.5) - farShore(vWorld.x - 0.5);
    float fromNear = nearShore(vWorld.x) - vWorld.z;
    float fromFar = (vWorld.z - farShore(vWorld.x)) / sqrt(1.0 + slope * slope);
    float depth = min(fromNear, fromFar) * ${BANK_SLOPE.toFixed(2)};
    float alpha = smoothstep(0.0, 0.07, depth);
    if (alpha < 0.004) discard;
    // 浅水里波纹平缓
    float calm = mix(0.3, 1.0, smoothstep(0.0, 0.5, depth));

    vec2 p = vWorld.xz;
    vec2 grad;
    if (uLite > 0.5) {
      float a1 = p.x * 0.42 + p.y * 1.65 - uTime * 0.85;
      float a2 = p.x * 0.95 - p.y * 2.85 - uTime * 1.35;
      grad = vec2(
        0.55 * cos(a1) * 0.42 + 0.35 * cos(a2) * 0.95,
        0.55 * cos(a1) * 1.65 - 0.35 * cos(a2) * 2.85
      ) * calm * 0.55;
    } else {
      float detail = 1.0 - smoothstep(25.0, 90.0, dist);
      float e = 0.12 + dist * 0.004;
      float h0 = waveHeight(p, detail);
      grad = vec2(waveHeight(p + vec2(e, 0.0), detail) - h0, waveHeight(p + vec2(0.0, e), detail) - h0) / e;
      float gust = mix(0.22, 1.3, smoothstep(0.36, 0.66, fbm(p * 0.045 + vec2(-uTime * 0.012, 4.0))));
      grad *= calm * gust;
    }

    // 雨天水波更碎、雪天水面稍静
    grad *= (1.0 + uRain * 0.45 - uSnow * 0.22);

    vec3 n = normalize(vec3(-grad.x * 0.03, 1.0, -grad.y * 0.03));
    vec3 moonDir = normalize(uMoonPos - vWorld);

    vec3 refl;
    if (uUseReflector > 0.5) {
      vec2 viewDir = normalize(vWorld.xz - cameraPosition.xz);
      float along = dot(grad, viewDir);
      float across = dot(grad, vec2(-viewDir.y, viewDir.x));
      vec2 uv = vUv.xy / vUv.w + vec2(across * 0.22, along) * 0.07;
      refl = texture2D(tDiffuse, uv).rgb;
    } else {
      refl = analyticReflection(reflect(-V, n), grad, moonDir);
    }

    float fresnel = 0.08 + 0.92 * pow(1.0 - max(dot(V, n), 0.0), 3.5);
    vec3 body = mix(uShallow, color, smoothstep(0.0, 0.9, depth));
    vec3 col = mix(body, refl, fresnel);

    // 月光/朝阳碎金（阴雨时大幅收敛）
    vec3 ns = normalize(vec3(-grad.x * 0.085, 1.0, -grad.y * 0.085));
    float md = max(dot(reflect(-V, ns), moonDir), 0.0);
    float sparkle = uLite > 0.5
      ? 0.45 + 0.55 * sin(p.x * 3.2 + p.y * 9.0 - uTime * 2.2)
      : 0.3 + 0.7 * smoothstep(0.32, 0.7, vnoise(p * vec2(4.0, 11.0) - vec2(uTime * 1.1, uTime * 0.35)));
    col += uMoonColor * (pow(md, 600.0) * 1.7 * sparkle + pow(md, 90.0) * 0.045) * calm * (1.0 - uRain * 0.72);

    // 雨滴水面涟漪环（近中景可见）
    if (uRain > 0.02) {
      float nearFade = 1.0 - smoothstep(10.0, 38.0, dist);
      float rip = rainRipples(p, uTime) * nearFade * uRain;
      vec3 ripCol = mix(vec3(0.58, 0.66, 0.86), vec3(0.86, 0.91, 0.97), uDawn);
      col = mix(col, ripCol, rip * 0.42);
    }

    // 水线上一道断断续续的浮沫；雪天沿浅滩覆一层薄霜冰边
    float foamNoise = uLite > 0.5
      ? 0.5 + 0.5 * sin(p.x * 2.4 + uTime * 0.4)
      : vnoise(p * 2.6 + vec2(uTime * 0.25, 0.0));
    float foam = (1.0 - smoothstep(0.0, 0.05, depth)) * (0.35 + 0.65 * foamNoise);
    col = mix(col, uFoam, foam * 0.3);

    if (uSnow > 0.02) {
      float iceRim = (1.0 - smoothstep(0.0, 0.16, depth)) * (0.45 + 0.55 * foamNoise) * uSnow;
      vec3 iceCol = mix(vec3(0.64, 0.72, 0.88), vec3(0.92, 0.96, 1.0), uDawn);
      col = mix(col, iceCol, iceRim * 0.58);
    }

    col = mix(col, uFogColor, 1.0 - exp(-pow(dist * uFogDensity, 2.0)));

    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** 河面：中/高画质走真实平面倒影，低画质切程序化倒影（省去整遍二次渲染） */
export class River {
  readonly mesh: Reflector
  private material: THREE.ShaderMaterial
  private useReflector = true
  private liteReflection = false
  private frame = 0
  private forceNext = true
  private lastCamPos = new THREE.Vector3(Infinity, Infinity, Infinity)
  private lastDawn = -1
  private lastRain = -1
  private lastSnow = -1
  private nightDeep = new THREE.Color(0x0a0818)
  private dawnDeep = new THREE.Color(0x324e70)
  private rainNightDeep = new THREE.Color(0x0b101d)
  private rainDawnDeep = new THREE.Color(0x3d4b5e)
  private snowNightDeep = new THREE.Color(0x11182c)
  private snowDawnDeep = new THREE.Color(0x4c627e)
  private nightShallow = new THREE.Color(0x231c3a)
  private dawnShallow = new THREE.Color(0x597691)
  private nightFoam = new THREE.Color(0x8f84b8)
  private dawnFoam = new THREE.Color(0xede0d6)
  private nightSparkle = new THREE.Color(0xd9d2ff)
  private dawnSparkle = new THREE.Color(0xffdfa8)
  private nightMoonPos: THREE.Vector3
  private tmpColor = new THREE.Color()

  constructor(
    moonPos: THREE.Vector3,
    sunDir: THREE.Vector3,
    fogColor: THREE.ColorRepresentation,
    fogDensity: number,
  ) {
    this.nightMoonPos = moonPos.clone()
    this.mesh = new Reflector(new THREE.PlaneGeometry(1300, 1300), {
      color: 0x0a0818,
      textureWidth: 512,
      textureHeight: 512,
      multisample: 0,
      shader: {
        name: 'RiverShader',
        uniforms: {
          color: { value: null },
          tDiffuse: { value: null },
          textureMatrix: { value: null },
          uTime: { value: 0 },
          uMoonPos: { value: moonPos.clone() },
          uMoonColor: { value: new THREE.Color(0xd9d2ff) },
          uSunDir: { value: new THREE.Vector2(sunDir.x, sunDir.z).normalize() },
          uShallow: { value: new THREE.Color(0x231c3a) },
          uFoam: { value: new THREE.Color(0x8f84b8) },
          uFogColor: { value: new THREE.Color(fogColor) },
          uFogDensity: { value: fogDensity },
          uUseReflector: { value: 1 },
          uLite: { value: 0 },
          uDawn: { value: 0 },
          uRain: { value: 0 },
          uSnow: { value: 0 },
        },
        vertexShader,
        fragmentShader,
      },
    })
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.set(0, WATER_Y, -20)
    this.material = this.mesh.material as THREE.ShaderMaterial
    this.material.transparent = true
    this.mesh.renderOrder = -0.5

    const baseBeforeRender = this.mesh.onBeforeRender
    this.mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      if (!this.useReflector) return
      const reflCam = this.mesh.getReflectionCamera(camera)
      if (this.liteReflection) reflCam.layers.disable(DETAIL_LAYER)
      else reflCam.layers.enable(DETAIL_LAYER)

      const moved = camera.position.distanceToSquared(this.lastCamPos) > 1e-4
      this.frame++
      if (this.liteReflection && !this.forceNext && !moved && this.frame % 2 === 1) return
      this.forceNext = false
      this.lastCamPos.copy(camera.position)
      baseBeforeRender.call(this.mesh, renderer, scene, camera, geometry, material, group)
    }
  }

  applyQuality({ reflection, reflectionLite, liteShaders }: QualityPreset) {
    this.useReflector = reflection > 0
    this.liteReflection = reflectionLite
    this.material.uniforms.uUseReflector.value = this.useReflector ? 1 : 0
    this.material.uniforms.uLite.value = liteShaders ? 1 : 0
    this.forceNext = true
  }

  /** 倒影贴图的分辨率（px）；关闭实时倒影时缩到极小释放显存 */
  setSize(width: number, height: number) {
    const w = this.useReflector ? Math.max(1, Math.round(width)) : 4
    const h = this.useReflector ? Math.max(1, Math.round(height)) : 4
    this.mesh.getRenderTarget().setSize(w, h)
    this.forceNext = true
  }

  setAtmosphere(
    dawn: number,
    dawnSunPos: THREE.Vector3,
    fogColor: THREE.Color,
    fogDensity: number,
    rain = 0,
    snow = 0,
  ) {
    if (
      Math.abs(dawn - this.lastDawn) > 1e-4 ||
      Math.abs(rain - this.lastRain) > 1e-3 ||
      Math.abs(snow - this.lastSnow) > 1e-3
    ) {
      this.lastDawn = dawn
      this.lastRain = rain
      this.lastSnow = snow
      this.forceNext = true
    }
    const u = this.material.uniforms
    u.uDawn.value = dawn
    u.uRain.value = rain
    u.uSnow.value = snow

    const deep = u.color.value as THREE.Color
    deep.copy(this.nightDeep).lerp(this.dawnDeep, dawn)
    this.tmpColor.copy(this.rainNightDeep).lerp(this.rainDawnDeep, dawn)
    deep.lerp(this.tmpColor, rain * 0.75)
    this.tmpColor.copy(this.snowNightDeep).lerp(this.snowDawnDeep, dawn)
    deep.lerp(this.tmpColor, snow * 0.7)

    ;(u.uShallow.value as THREE.Color).copy(this.nightShallow).lerp(this.dawnShallow, dawn)
    ;(u.uFoam.value as THREE.Color).copy(this.nightFoam).lerp(this.dawnFoam, dawn)
    ;(u.uMoonColor.value as THREE.Color).copy(this.nightSparkle).lerp(this.dawnSparkle, dawn)
    ;(u.uMoonPos.value as THREE.Vector3).copy(this.nightMoonPos).lerp(dawnSunPos, dawn)
    ;(u.uFogColor.value as THREE.Color).copy(fogColor)
    u.uFogDensity.value = fogDensity
  }

  update(time: number) {
    this.material.uniforms.uTime.value = time
  }

  dispose() {
    this.mesh.dispose()
  }
}
