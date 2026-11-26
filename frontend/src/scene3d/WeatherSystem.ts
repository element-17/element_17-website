import * as THREE from 'three'
import type { QualityPreset } from '../config/quality'
import { seededRandom } from '../config/random'
import { CAMP } from '../config/shots'
import type { WeatherKind } from '../config/weather'
import { markDetail } from './merge'
import { groundHeight } from './River'

const MAX_RAIN = 1800
const MAX_SNOW = 1500
const SPLASH_COUNT = 44

export interface WeatherState {
  kind: WeatherKind
  cloudy: number
  rain: number
  snow: number
  cloudiness: number
  wind: number
  thunderFlash: number
}

interface Targets {
  cloudy: number
  rain: number
  snow: number
  cloudiness: number
  wind: number
}

const TARGETS: Record<WeatherKind, Targets> = {
  clear: { cloudy: 0, rain: 0, snow: 0, cloudiness: 0.14, wind: 1.0 },
  cloudy: { cloudy: 1, rain: 0, snow: 0, cloudiness: 0.78, wind: 1.25 },
  rain: { cloudy: 0.5, rain: 1, snow: 0, cloudiness: 0.96, wind: 1.95 },
  snow: { cloudy: 0.4, rain: 0, snow: 1, cloudiness: 0.86, wind: 1.45 },
}

/**
 * 3D 天气粒子与气象状态机：
 * - GPU 驱动的雨丝（LineSegments + 循环包围盒，0 CPU 逐帧循环）；
 * - GPU 驱动的飘雪（Points + 柔和圆雪片片元着色器 + 双频随风回旋）；
 * - 地面雨滴水花圈（InstancedMesh + 着色器异步扩散）；
 * - 所有粒子归入 DETAIL_LAYER，避免低/中画质河面倒影重复绘制。
 */
export class WeatherSystem {
  readonly group = new THREE.Group()
  readonly state: WeatherState

  private kind: WeatherKind
  private hasThunder = false
  private reduceMotion: boolean
  private windBoost = 1
  private transition: {
    from: Targets
    to: Targets
    start: number
    duration: number
  } | null = null

  private rainMesh: THREE.LineSegments
  private rainMat: THREE.ShaderMaterial
  private rainCount = MAX_RAIN

  private snowMesh: THREE.Points
  private snowMat: THREE.ShaderMaterial
  private snowCount = MAX_SNOW

  private splashes: THREE.InstancedMesh
  private splashMat: THREE.ShaderMaterial

  private nextThunderAt = 12
  private thunderStart = -10

  private anchor = new THREE.Vector3()
  private rainNightCol = new THREE.Color(0xb8c8f2)
  private rainDawnCol = new THREE.Color(0xdbe6f4)
  private snowNightCol = new THREE.Color(0xe6eeff)
  private snowDawnCol = new THREE.Color(0xffffff)

  constructor(initialKind: WeatherKind, reduceMotion = false) {
    this.kind = initialKind
    this.reduceMotion = reduceMotion
    const init = TARGETS[initialKind]
    this.state = {
      kind: initialKind,
      cloudy: init.cloudy,
      rain: init.rain,
      snow: init.snow,
      cloudiness: init.cloudiness,
      wind: init.wind,
      thunderFlash: 0,
    }

    const rand = seededRandom(2026)

    // ---------- 1. 雨丝（每滴 2 个顶点：尾 + 尖，GPU 围绕相机焦点循环下落） ----------
    const rainPos = new Float32Array(MAX_RAIN * 2 * 3)
    const rainSpeed = new Float32Array(MAX_RAIN * 2)
    const rainLen = new Float32Array(MAX_RAIN * 2)
    const rainPhase = new Float32Array(MAX_RAIN * 2)
    const rainTip = new Float32Array(MAX_RAIN * 2)

    for (let i = 0; i < MAX_RAIN; i++) {
      const x = (rand() - 0.5) * 26
      const y = rand() * 14
      const z = (rand() - 0.5) * 26
      const spd = 11.5 + rand() * 5.5
      const len = 0.42 + rand() * 0.34
      const ph = rand() * 20
      for (let v = 0; v < 2; v++) {
        const idx = i * 2 + v
        rainPos[idx * 3] = x
        rainPos[idx * 3 + 1] = y
        rainPos[idx * 3 + 2] = z
        rainSpeed[idx] = spd
        rainLen[idx] = len
        rainPhase[idx] = ph
        rainTip[idx] = v
      }
    }

    const rainGeo = new THREE.BufferGeometry()
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
    rainGeo.setAttribute('aSpeed', new THREE.BufferAttribute(rainSpeed, 1))
    rainGeo.setAttribute('aLen', new THREE.BufferAttribute(rainLen, 1))
    rainGeo.setAttribute('aPhase', new THREE.BufferAttribute(rainPhase, 1))
    rainGeo.setAttribute('aTip', new THREE.BufferAttribute(rainTip, 1))

    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: init.rain },
        uAnchor: { value: new THREE.Vector3() },
        uColor: { value: this.rainNightCol.clone() },
        uWind: { value: 1 },
        uMotionScale: { value: reduceMotion ? 0.35 : 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAnchor;
        uniform float uWind;
        uniform float uMotionScale;
        attribute float aSpeed;
        attribute float aLen;
        attribute float aPhase;
        attribute float aTip;
        varying float vAlpha;
        void main() {
          vec3 box = vec3(26.0, 14.0, 26.0);
          float t = uTime * uMotionScale;
          vec3 p = position;
          p.y -= t * aSpeed + aPhase * 1.7;
          p.x -= t * (1.7 + 0.65 * uWind);
          p.z -= t * 0.35;

          vec3 rel = mod(p - uAnchor + box * 0.5, box) - box * 0.5;
          vec3 world = uAnchor + rel;
          world.y = max(world.y, -0.55);

          vec3 streakDir = normalize(vec3(-0.15 * uWind, -1.0, -0.03));
          world += streakDir * (aTip * aLen);

          float yNorm = (rel.y + box.y * 0.5) / box.y;
          float edgeFade = smoothstep(0.0, 0.14, yNorm) * smoothstep(1.0, 0.84, yNorm);
          float distFade = 1.0 - smoothstep(10.0, 15.5, length(rel.xz));
          vAlpha = edgeFade * distFade * mix(0.28, 0.95, aTip);

          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float a = vAlpha * uOpacity * 0.52;
          if (a < 0.008) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    })

    this.rainMesh = new THREE.LineSegments(rainGeo, this.rainMat)
    this.rainMesh.frustumCulled = false
    this.rainMesh.visible = init.rain > 0.01
    markDetail(this.rainMesh)
    this.group.add(this.rainMesh)

    // ---------- 2. 飘雪（Points + 柔和雪片片元着色器 + 双频随风回旋） ----------
    const snowPos = new Float32Array(MAX_SNOW * 3)
    const snowSpeed = new Float32Array(MAX_SNOW)
    const snowSize = new Float32Array(MAX_SNOW)
    const snowPhase = new Float32Array(MAX_SNOW)

    for (let i = 0; i < MAX_SNOW; i++) {
      snowPos[i * 3] = (rand() - 0.5) * 26
      snowPos[i * 3 + 1] = rand() * 13
      snowPos[i * 3 + 2] = (rand() - 0.5) * 26
      snowSpeed[i] = 0.62 + rand() * 0.72
      snowSize[i] = 3.2 + rand() * 4.4
      snowPhase[i] = rand() * 12
    }

    const snowGeo = new THREE.BufferGeometry()
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
    snowGeo.setAttribute('aSpeed', new THREE.BufferAttribute(snowSpeed, 1))
    snowGeo.setAttribute('aSize', new THREE.BufferAttribute(snowSize, 1))
    snowGeo.setAttribute('aPhase', new THREE.BufferAttribute(snowPhase, 1))

    this.snowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: init.snow },
        uPixelRatio: { value: 1 },
        uAnchor: { value: new THREE.Vector3() },
        uColor: { value: this.snowNightCol.clone() },
        uMotionScale: { value: reduceMotion ? 0.3 : 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        uniform vec3 uAnchor;
        uniform float uMotionScale;
        attribute float aSpeed;
        attribute float aSize;
        attribute float aPhase;
        varying float vAlpha;
        void main() {
          vec3 box = vec3(26.0, 13.0, 26.0);
          float t = uTime * uMotionScale;
          vec3 p = position;
          p.y -= t * aSpeed + aPhase * 0.9;
          p.x += sin(t * 0.75 + aPhase * 2.1) * 0.65 - t * 0.28;
          p.z += cos(t * 0.6 + aPhase * 1.7) * 0.5;

          vec3 rel = mod(p - uAnchor + box * 0.5, box) - box * 0.5;
          vec3 world = uAnchor + rel;

          vec4 mv = viewMatrix * vec4(world, 1.0);
          float depth = max(2.0, -mv.z);
          gl_PointSize = clamp(aSize * uPixelRatio * (13.0 / depth), 2.0, 16.0 * uPixelRatio);

          float yNorm = (rel.y + box.y * 0.5) / box.y;
          float edgeFade = smoothstep(0.0, 0.14, yNorm) * smoothstep(1.0, 0.86, yNorm);
          float distFade = 1.0 - smoothstep(10.5, 15.0, length(rel.xz));
          vAlpha = edgeFade * distFade;

          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.08, d);
          float a = core * core * vAlpha * uOpacity * 0.88;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    })

    this.snowMesh = new THREE.Points(snowGeo, this.snowMat)
    this.snowMesh.frustumCulled = false
    this.snowMesh.visible = init.snow > 0.01
    markDetail(this.snowMesh)
    this.group.add(this.snowMesh)

    // ---------- 3. 河岸湿滩细微雨滴水花圈（避开坐石与藏卷案几） ----------
    const splashGeo = new THREE.PlaneGeometry(0.24, 0.24)
    splashGeo.rotateX(-Math.PI / 2)
    const phases = new Float32Array(SPLASH_COUNT)
    const dummy = new THREE.Object3D()

    this.splashMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: init.rain },
        uColor: { value: new THREE.Color(0xc8d8f8) },
      },
      vertexShader: /* glsl */ `
        attribute float aSplashPhase;
        varying vec2 vUv;
        varying float vPhase;
        void main() {
          vUv = uv;
          vPhase = aSplashPhase;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vPhase;
        void main() {
          float cycle = fract(uTime * 1.55 + vPhase);
          float r = length(vUv - 0.5) * 2.0;
          float target = cycle * 0.9;
          float ring = smoothstep(0.11, 0.0, abs(r - target));
          float fade = (1.0 - cycle) * smoothstep(0.0, 0.08, cycle);
          float a = ring * fade * uOpacity * 0.24;
          if (a < 0.008) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    })

    const splashes = new THREE.InstancedMesh(splashGeo, this.splashMat, SPLASH_COUNT)
    let placed = 0
    let guard = 0
    while (placed < SPLASH_COUNT && guard++ < 600) {
      const cx = CAMP.fishing.x + (rand() - 0.5) * 8.5
      const cz = CAMP.fishing.z - 0.2 - rand() * 3.8
      // 避开垂钓青石底座本身
      if (Math.hypot(cx - CAMP.fishing.x, cz - CAMP.fishing.z) < 1.05) continue
      const gy = Math.max(groundHeight(cx, cz), -0.39) + 0.014
      dummy.position.set(cx, gy, cz)
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      const s = 0.7 + rand() * 0.65
      dummy.scale.set(s, 1, s)
      dummy.updateMatrix()
      splashes.setMatrixAt(placed, dummy.matrix)
      phases[placed] = rand()
      placed++
    }
    splashGeo.setAttribute('aSplashPhase', new THREE.InstancedBufferAttribute(phases, 1))
    splashes.instanceMatrix.needsUpdate = true
    splashes.frustumCulled = false
    splashes.visible = init.rain > 0.01
    markDetail(splashes)
    this.splashes = splashes
    this.group.add(splashes)
  }

  setWeather(kind: WeatherKind, options?: { thunder?: boolean; windSpeed?: number }) {
    const prevKind = this.kind
    this.kind = kind
    this.state.kind = kind
    this.hasThunder = Boolean(options?.thunder && kind === 'rain')
    const kmh = options?.windSpeed ?? 8
    this.windBoost = THREE.MathUtils.clamp(0.85 + kmh / 24, 0.85, 1.65)

    if (kind !== prevKind) {
      const target = TARGETS[kind]
      if (this.reduceMotion) {
        this.transition = null
        this.state.cloudy = target.cloudy
        this.state.rain = target.rain
        this.state.snow = target.snow
        this.state.cloudiness = target.cloudiness
        this.state.wind = target.wind * this.windBoost
      } else {
        this.transition = {
          from: {
            cloudy: this.state.cloudy,
            rain: this.state.rain,
            snow: this.state.snow,
            cloudiness: this.state.cloudiness,
            wind: this.state.wind / this.windBoost,
          },
          to: target,
          start: performance.now(),
          duration: 0.9,
        }
      }
    }
  }

  applyQuality(preset: QualityPreset) {
    this.rainCount = Math.min(preset.rainDrops, MAX_RAIN)
    this.rainMesh.geometry.setDrawRange(0, this.rainCount * 2)
    this.snowCount = Math.min(preset.snowFlakes, MAX_SNOW)
    this.snowMesh.geometry.setDrawRange(0, this.snowCount)
    this.splashes.count = Math.max(12, Math.round(SPLASH_COUNT * (preset.rainDrops / MAX_RAIN)))
  }

  setPixelRatio(ratio: number) {
    this.snowMat.uniforms.uPixelRatio.value = ratio
  }

  update(time: number, dt: number, dawn: number, focusPoint: THREE.Vector3) {
    const s = this.state
    // 按真实耗时推进天气过渡：低帧率下同样在 0.9s 内彻底落定，避免残余雨丝拖进雪景
    if (this.transition) {
      const tr = this.transition
      const raw = Math.min(1, (performance.now() - tr.start) / 1000 / tr.duration)
      const ease = raw < 0.5 ? 4 * raw * raw * raw : 1 - (-2 * raw + 2) ** 3 / 2
      s.cloudy = tr.from.cloudy + (tr.to.cloudy - tr.from.cloudy) * ease
      // 降水/降雪在切离时前段更快收尾
      const outEase = Math.min(1, raw * 1.45)
      s.rain = tr.to.rain < tr.from.rain
        ? tr.from.rain + (tr.to.rain - tr.from.rain) * outEase
        : tr.from.rain + (tr.to.rain - tr.from.rain) * ease
      s.snow = tr.to.snow < tr.from.snow
        ? tr.from.snow + (tr.to.snow - tr.from.snow) * outEase
        : tr.from.snow + (tr.to.snow - tr.from.snow) * ease
      s.cloudiness = tr.from.cloudiness + (tr.to.cloudiness - tr.from.cloudiness) * ease
      s.wind = (tr.from.wind + (tr.to.wind - tr.from.wind) * ease) * this.windBoost
      if (raw >= 1) {
        s.cloudy = tr.to.cloudy
        s.rain = tr.to.rain
        s.snow = tr.to.snow
        s.cloudiness = tr.to.cloudiness
        s.wind = tr.to.wind * this.windBoost
        this.transition = null
      }
    } else {
      const targetWind = TARGETS[this.kind].wind * this.windBoost
      s.wind += (targetWind - s.wind) * Math.min(1, dt * 3)
    }

    // 柔和远雷天光（仅在真实雷阵雨且未开启减少动态效果时偶尔轻闪，单次缓亮缓灭，严守安全阈值）
    if (this.hasThunder && !this.reduceMotion && s.rain > 0.65) {
      if (time >= this.nextThunderAt) {
        this.thunderStart = time
        this.nextThunderAt = time + 11 + ((Math.sin(time * 7.3) + 1) * 5.5)
      }
      const elapsed = time - this.thunderStart
      if (elapsed >= 0 && elapsed < 0.75) {
        s.thunderFlash = Math.sin((elapsed / 0.75) * Math.PI) * 0.45
      } else {
        s.thunderFlash = 0
      }
    } else {
      s.thunderFlash = 0
    }

    this.anchor.set(focusPoint.x, 4.5, focusPoint.z)

    // 雨丝更新
    const rainVis = s.rain > 0.015
    this.rainMesh.visible = rainVis
    if (rainVis) {
      this.rainMat.uniforms.uTime.value = time
      this.rainMat.uniforms.uOpacity.value = s.rain
      this.rainMat.uniforms.uWind.value = s.wind
      ;(this.rainMat.uniforms.uAnchor.value as THREE.Vector3).copy(this.anchor)
      ;(this.rainMat.uniforms.uColor.value as THREE.Color).copy(this.rainNightCol).lerp(this.rainDawnCol, dawn)
    }

    // 地面水花圈更新（黎明时略收轻以免发白）
    this.splashes.visible = rainVis && !this.reduceMotion
    if (this.splashes.visible) {
      this.splashMat.uniforms.uTime.value = time
      this.splashMat.uniforms.uOpacity.value = s.rain * (1 - dawn * 0.45)
    }

    // 飘雪更新
    const snowVis = s.snow > 0.015
    this.snowMesh.visible = snowVis
    if (snowVis) {
      this.snowMat.uniforms.uTime.value = time
      this.snowMat.uniforms.uOpacity.value = s.snow
      ;(this.snowMat.uniforms.uAnchor.value as THREE.Vector3).copy(this.anchor)
      ;(this.snowMat.uniforms.uColor.value as THREE.Color).copy(this.snowNightCol).lerp(this.snowDawnCol, dawn)
    }
  }
}
