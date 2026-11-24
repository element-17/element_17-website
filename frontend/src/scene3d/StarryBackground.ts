import * as THREE from 'three'
import type { QualityPreset } from '../config/quality'
import { seededRandom } from '../config/random'
import { NOISE_GLSL } from './glsl'
import { makeMoonTexture, makeRadialTexture } from './textures'
import { loadTexture } from './textureLoader'

const STAR_COUNT = 1600
const BAND_COUNT = 1400
const TOTAL_STARS = STAR_COUNT + BAND_COUNT

export interface CelestialTarget {
  center: THREE.Vector3
  radius: number
}

/** 昼夜天穹：黑夜（暗紫暮色 + 星河 + 明月）与黎明（清朗破晓蓝 + 暖金晨霞 + 朝阳）平滑过渡 */
export class StarryBackground {
  readonly group = new THREE.Group()
  private starMaterial: THREE.ShaderMaterial
  private domeMaterial: THREE.ShaderMaterial
  private stars: THREE.Points
  private moonSprite: THREE.Sprite
  private moonGlow: THREE.Sprite
  private sunSprite: THREE.Sprite
  private sunGlow: THREE.Sprite
  private moonBasePos: THREE.Vector3
  private sunBasePos: THREE.Vector3
  private dawn = 0

  constructor(
    moonDir: THREE.Vector3,
    moonDistance: number,
    sunDir: THREE.Vector3,
    dawnSunDir: THREE.Vector3,
    horizon: THREE.ColorRepresentation,
  ) {
    // ---------- 天穹：黑夜与黎明通过 uDawn (0 ~ 1) 无缝融合 ----------
    this.domeMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x05040f) },
        uUpper: { value: new THREE.Color(0x150d33) },
        uMid: { value: new THREE.Color(0x2d1547) },
        uHorizon: { value: new THREE.Color(horizon) },
        uGlow: { value: new THREE.Color(0xd4506a) },
        uGlowCore: { value: new THREE.Color(0xff9a55) },
        uMoonDir: { value: moonDir.clone() },
        uSunDir: { value: new THREE.Vector2(sunDir.x, sunDir.z).normalize() },
        uDawnSunDir: { value: dawnSunDir.clone() },
        uDawn: { value: 0 },
        uTime: { value: 0 },
        uLite: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uUpper;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uGlow;
        uniform vec3 uGlowCore;
        uniform vec3 uMoonDir;
        uniform vec2 uSunDir;
        uniform vec3 uDawnSunDir;
        uniform float uDawn;
        uniform float uTime;
        uniform float uLite;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);

          // 黑夜天色
          vec3 nightCol = mix(uHorizon, uMid, smoothstep(0.0, 0.13, h));
          nightCol = mix(nightCol, uUpper, smoothstep(0.08, 0.4, h));
          nightCol = mix(nightCol, uZenith, smoothstep(0.3, 0.85, h));

          // 残霞：只在日落方位贴着地平线的一条
          float az = max(dot(normalize(d.xz + 1e-5), uSunDir), 0.0);
          float sunset = pow(az, 3.0);
          nightCol += uGlow * sunset * exp(-h * 8.0) * 0.55;
          nightCol += uGlowCore * pow(az, 12.0) * exp(-h * 18.0) * 0.6;

          // 月亮周围的大气散射
          float m = max(dot(d, uMoonDir), 0.0);
          float moonHalo = pow(m, 60.0) * 0.32 + pow(m, 10.0) * 0.06;
          nightCol += vec3(0.42, 0.38, 0.78) * moonHalo;

          // 白天晴空万里：清透湛蓝天顶 -> 明亮天蓝 -> 柔和淡天青地平线（舒适清爽不晃眼）
          vec3 dawnHorizon = vec3(0.76, 0.87, 0.96);
          vec3 dawnMid = vec3(0.50, 0.74, 0.94);
          vec3 dawnUpper = vec3(0.24, 0.54, 0.88);
          vec3 dawnZenith = vec3(0.11, 0.36, 0.76);
          vec3 dawnCol = mix(dawnHorizon, dawnMid, smoothstep(0.0, 0.16, h));
          dawnCol = mix(dawnCol, dawnUpper, smoothstep(0.12, 0.44, h));
          dawnCol = mix(dawnCol, dawnZenith, smoothstep(0.36, 0.86, h));

          // 柔和日晕：克制散射，保留晴朗暖意但不刺眼泛白
          float s = max(dot(d, uDawnSunDir), 0.0);
          dawnCol += vec3(0.98, 0.92, 0.78) * (pow(s, 72.0) * 0.16 + pow(s, 14.0) * 0.05);

          vec3 col = mix(nightCol, dawnCol, uDawn);

          // 云层：低画质只跑 1 次噪声，极大幅度压缩全屏片元开销
          vec2 uv = d.xz / (h + 0.16);
          float wide = uLite > 0.5
            ? vnoise(uv * vec2(0.65, 1.25) + vec2(uTime * 0.004, 0.0))
            : fbm(uv * vec2(0.55, 1.1) + vec2(uTime * 0.004, 0.0));
          float fine = uLite > 0.5
            ? 0.5 + 0.5 * sin(uv.x * 2.1 + uv.y * 1.4 + uTime * 0.02)
            : fbm(uv * 2.6 + vec2(uTime * 0.007, 3.7));
          float cover = smoothstep(0.46, 0.74, wide * 0.72 + fine * 0.28);
          cover *= smoothstep(0.015, 0.09, h) * (1.0 - smoothstep(0.45, 0.9, h) * 0.7);

          // 暗夜云体
          vec3 nightCloud = vec3(0.035, 0.024, 0.07);
          nightCloud += uGlow * sunset * exp(-h * 4.0) * (0.5 + fine * 0.7);
          nightCloud += uGlowCore * pow(az, 8.0) * exp(-h * 9.0) * 0.45;
          nightCloud += vec3(0.30, 0.28, 0.55) * pow(m, 5.0) * 0.55 * fine;

          // 晴空白云：柔和云底浅蓝影 + 干净洁白云顶
          vec3 dawnCloud = mix(vec3(0.76, 0.83, 0.92), vec3(0.95, 0.97, 0.99), smoothstep(0.25, 0.85, fine));
          dawnCloud += vec3(0.06, 0.05, 0.03) * pow(s, 6.0);

          vec3 cloud = mix(nightCloud, dawnCloud, uDawn);
          col = mix(col, cloud, cover * mix(0.82, 0.42, uDawn));

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 18), this.domeMaterial)
    dome.renderOrder = -4
    this.group.add(dome)

    // ---------- 星 ----------
    const rand = seededRandom(7)
    const positions = new Float32Array(TOTAL_STARS * 3)
    const sizes = new Float32Array(TOTAL_STARS)
    const phases = new Float32Array(TOTAL_STARS)
    const v = new THREE.Vector3()
    const bandNormal = new THREE.Vector3(0.45, 0.55, -0.7).normalize()
    const bandU = new THREE.Vector3(0, 1, 0).cross(bandNormal).normalize()
    const bandV = bandNormal.clone().cross(bandU).normalize()

    let n = 0
    while (n < TOTAL_STARS) {
      if (n % 2 === 0 && n < STAR_COUNT * 2) {
        v.set(rand() * 2 - 1, rand(), rand() * 2 - 1)
        if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue
        sizes[n] = rand() < 0.93 ? 1 + rand() * 1.4 : 2.6 + rand() * 1.8
      } else {
        const a = rand() * Math.PI * 2
        const spread = (rand() + rand() + rand() - 1.5) * 0.22
        v.copy(bandU).multiplyScalar(Math.cos(a)).addScaledVector(bandV, Math.sin(a)).addScaledVector(bandNormal, spread)
        if (v.y < 0.03) continue
        sizes[n] = 0.7 + rand() * 0.9
      }
      v.normalize().multiplyScalar(520)
      if (v.y < 12) continue
      positions.set([v.x, v.y, v.z], n * 3)
      phases[n] = rand() * 10
      n++
    }

    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))

    this.starMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSize;
        attribute float aPhase;
        varying float vAlpha;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          float twinkle = 0.62 + 0.38 * sin(uTime * (0.5 + fract(aPhase) * 1.8) + aPhase * 6.2831);
          vAlpha = twinkle * smoothstep(0.04, 0.24, normalize(position).y);
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vec3(0.9, 0.88, 1.0) * a * vAlpha * uOpacity, 1.0);
        }
      `,
    })
    const stars = new THREE.Points(starGeo, this.starMaterial)
    stars.frustumCulled = false
    stars.renderOrder = -3
    this.stars = stars
    this.group.add(stars)

    // ---------- 月（黑夜可点击切换至黎明） ----------
    this.moonBasePos = moonDir.clone().multiplyScalar(moonDistance)
    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTexture([
          [0, 'rgba(205,200,255,0.3)'],
          [0.25, 'rgba(160,140,240,0.09)'],
          [1, 'rgba(130,110,220,0)'],
        ]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        transparent: true,
      }),
    )
    this.moonGlow.position.copy(this.moonBasePos)
    this.moonGlow.scale.setScalar(120)
    this.moonGlow.renderOrder = -2
    this.group.add(this.moonGlow)

    const moonMat = new THREE.SpriteMaterial({
      map: makeMoonTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    this.moonSprite = new THREE.Sprite(moonMat)
    this.moonSprite.position.copy(this.moonBasePos)
    this.moonSprite.scale.setScalar(26)
    this.moonSprite.renderOrder = -1
    this.group.add(this.moonSprite)

    void loadTexture('moon.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
    }).then((tex) => {
      if (!tex) return
      moonMat.map = tex
      moonMat.needsUpdate = true
    })

    // ---------- 黎明朝阳（白天可点击切换回黑夜） ----------
    this.sunBasePos = dawnSunDir.clone().multiplyScalar(moonDistance)
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTexture([
          [0, 'rgba(255,238,184,0.34)'],
          [0.32, 'rgba(255,212,132,0.14)'],
          [0.65, 'rgba(255,196,112,0.04)'],
          [1, 'rgba(255,190,104,0)'],
        ]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        transparent: true,
        opacity: 0,
      }),
    )
    this.sunGlow.position.copy(this.sunBasePos)
    this.sunGlow.scale.setScalar(84)
    this.sunGlow.renderOrder = -2
    this.sunGlow.visible = false
    this.group.add(this.sunGlow)

    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTexture([
          [0, 'rgba(255,251,232,1)'],
          [0.38, 'rgba(255,228,144,0.98)'],
          [0.5, 'rgba(255,186,88,0.88)'],
          [0.62, 'rgba(255,168,78,0.22)'],
          [1, 'rgba(255,160,72,0)'],
        ]),
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        opacity: 0,
      }),
    )
    this.sunSprite.position.copy(this.sunBasePos)
    this.sunSprite.scale.setScalar(38)
    this.sunSprite.renderOrder = -1
    this.sunSprite.visible = false
    this.group.add(this.sunSprite)
  }

  /** 0 = 黑夜，1 = 黎明 */
  setDawn(dawn: number) {
    this.dawn = dawn
    this.domeMaterial.uniforms.uDawn.value = dawn

    const starOpacity = Math.max(0, 1 - dawn * 2.2)
    this.starMaterial.uniforms.uOpacity.value = starOpacity
    this.stars.visible = starOpacity > 0.01

    // 月亮淡出并轻微西沉
    const moonAlpha = THREE.MathUtils.clamp(1 - dawn * 1.75, 0, 1)
    this.moonSprite.visible = moonAlpha > 0.01
    this.moonGlow.visible = moonAlpha > 0.01
    this.moonSprite.material.opacity = moonAlpha
    this.moonGlow.material.opacity = moonAlpha
    const moonOffsetY = -dawn * 26
    this.moonSprite.position.set(this.moonBasePos.x, this.moonBasePos.y + moonOffsetY, this.moonBasePos.z)
    this.moonGlow.position.copy(this.moonSprite.position)

    // 朝阳自地平线柔和升起并点亮
    const sunAlpha = THREE.MathUtils.clamp((dawn - 0.15) * 1.45, 0, 1)
    this.sunSprite.visible = sunAlpha > 0.01
    this.sunGlow.visible = sunAlpha > 0.01
    this.sunSprite.material.opacity = sunAlpha
    this.sunGlow.material.opacity = sunAlpha
    const sunOffsetY = -(1 - dawn) * 28
    this.sunSprite.position.set(this.sunBasePos.x, this.sunBasePos.y + sunOffsetY, this.sunBasePos.z)
    this.sunGlow.position.copy(this.sunSprite.position)
  }

  /** 返回当前可见天体（月亮或朝阳）的点击拾取球体 */
  getCelestialTarget(): CelestialTarget {
    if (this.dawn < 0.5) {
      return { center: this.moonSprite.position, radius: 22 }
    }
    return { center: this.sunSprite.position, radius: 26 }
  }

  applyQuality({ liteShaders, stars }: QualityPreset) {
    this.domeMaterial.uniforms.uLite.value = liteShaders ? 1 : 0
    this.stars.geometry.setDrawRange(0, Math.round(TOTAL_STARS * stars))
  }

  setPixelRatio(ratio: number) {
    this.starMaterial.uniforms.uPixelRatio.value = ratio
  }

  update(time: number) {
    this.starMaterial.uniforms.uTime.value = time
    this.domeMaterial.uniforms.uTime.value = time
  }
}
