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

/** 昼夜与气象天穹：黑夜 / 黎明 × 晴 / 阴 / 雨 / 雪平滑融合 */
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
  private cloudiness = 0.14
  private rain = 0
  private snow = 0

  constructor(
    moonDir: THREE.Vector3,
    moonDistance: number,
    sunDir: THREE.Vector3,
    dawnSunDir: THREE.Vector3,
    horizon: THREE.ColorRepresentation,
  ) {
    // ---------- 天穹：黑夜与黎明通过 uDawn (0 ~ 1) 与气象参数无缝融合 ----------
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
        uCloudiness: { value: 0.14 },
        uRain: { value: 0 },
        uSnow: { value: 0 },
        uThunder: { value: 0 },
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
        uniform float uCloudiness;
        uniform float uRain;
        uniform float uSnow;
        uniform float uThunder;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);

          // 黑夜天色
          vec3 nightCol = mix(uHorizon, uMid, smoothstep(0.0, 0.13, h));
          nightCol = mix(nightCol, uUpper, smoothstep(0.08, 0.4, h));
          nightCol = mix(nightCol, uZenith, smoothstep(0.3, 0.85, h));

          // 残霞：晴时浓郁，阴雨雪时减弱
          float clearSky = 1.0 - clamp(uCloudiness * 0.82, 0.0, 0.85);
          float az = max(dot(normalize(d.xz + 1e-5), uSunDir), 0.0);
          float sunset = pow(az, 3.0);
          nightCol += uGlow * sunset * exp(-h * 8.0) * 0.55 * clearSky;
          nightCol += uGlowCore * pow(az, 12.0) * exp(-h * 18.0) * 0.6 * clearSky;

          // 月亮周围的大气散射
          float m = max(dot(d, uMoonDir), 0.0);
          float moonHalo = pow(m, 60.0) * 0.32 + pow(m, 10.0) * 0.06;
          nightCol += vec3(0.42, 0.38, 0.78) * moonHalo * (1.0 - uRain * 0.68);

          // 雨夜转冷青灰、雪夜带一层通透寒蓝
          vec3 rainNightSky = mix(vec3(0.10, 0.12, 0.20), vec3(0.03, 0.04, 0.09), smoothstep(0.0, 0.65, h));
          vec3 snowNightSky = mix(vec3(0.22, 0.25, 0.38), vec3(0.08, 0.10, 0.20), smoothstep(0.0, 0.7, h));
          nightCol = mix(nightCol, rainNightSky, uRain * 0.78);
          nightCol = mix(nightCol, snowNightSky, uSnow * 0.72);

          // 黎明天色
          vec3 dawnHorizon = vec3(0.88, 0.68, 0.54);
          vec3 dawnMid = vec3(0.70, 0.54, 0.65);
          vec3 dawnUpper = vec3(0.30, 0.46, 0.72);
          vec3 dawnZenith = vec3(0.14, 0.28, 0.55);
          vec3 dawnCol = mix(dawnHorizon, dawnMid, smoothstep(0.0, 0.14, h));
          dawnCol = mix(dawnCol, dawnUpper, smoothstep(0.10, 0.38, h));
          dawnCol = mix(dawnCol, dawnZenith, smoothstep(0.30, 0.82, h));

          // 朝阳晨晖
          float s = max(dot(d, uDawnSunDir), 0.0);
          float sunAz = max(dot(normalize(d.xz + 1e-5), normalize(uDawnSunDir.xz + 1e-5)), 0.0);
          dawnCol += vec3(0.92, 0.50, 0.34) * pow(sunAz, 2.4) * exp(-h * 5.8) * 0.30 * clearSky;
          dawnCol += vec3(0.96, 0.76, 0.48) * (pow(s, 56.0) * 0.40 + pow(s, 9.0) * 0.12) * (1.0 - uRain * 0.75);

          // 雨天黎明转烟雨银灰、雪天黎明转凛冽霜白
          vec3 rainDawnSky = mix(vec3(0.56, 0.61, 0.68), vec3(0.34, 0.40, 0.50), smoothstep(0.0, 0.75, h));
          vec3 snowDawnSky = mix(vec3(0.82, 0.86, 0.92), vec3(0.58, 0.67, 0.80), smoothstep(0.0, 0.78, h));
          dawnCol = mix(dawnCol, rainDawnSky, uRain * 0.82);
          dawnCol = mix(dawnCol, snowDawnSky, uSnow * 0.75);

          vec3 col = mix(nightCol, dawnCol, uDawn);

          // 云层：云量随天气动态增厚，雨雪时云速稍快
          vec2 uv = d.xz / (h + 0.16);
          float drift = uTime * (0.004 + uRain * 0.007 + uSnow * 0.003);
          float wide = uLite > 0.5
            ? vnoise(uv * vec2(0.65, 1.25) + vec2(drift, 0.0))
            : fbm(uv * vec2(0.55, 1.1) + vec2(drift, 0.0));
          float fine = uLite > 0.5
            ? 0.5 + 0.5 * sin(uv.x * 2.1 + uv.y * 1.4 + uTime * 0.02)
            : fbm(uv * 2.6 + vec2(drift * 1.6, 3.7));
          float edgeLo = mix(0.56, 0.22, uCloudiness);
          float edgeHi = mix(0.82, 0.56, uCloudiness);
          float cover = smoothstep(edgeLo, edgeHi, wide * 0.72 + fine * 0.28);
          cover *= smoothstep(0.015, 0.09, h) * (1.0 - smoothstep(0.45, 0.92, h) * mix(0.7, 0.22, uCloudiness));

          // 暗夜云体
          vec3 nightCloud = vec3(0.035, 0.024, 0.07);
          nightCloud = mix(nightCloud, vec3(0.06, 0.075, 0.12), uRain);
          nightCloud = mix(nightCloud, vec3(0.18, 0.22, 0.34), uSnow);
          nightCloud += uGlow * sunset * exp(-h * 4.0) * (0.5 + fine * 0.7) * clearSky;
          nightCloud += uGlowCore * pow(az, 8.0) * exp(-h * 9.0) * 0.45 * clearSky;
          nightCloud += vec3(0.30, 0.28, 0.55) * pow(m, 5.0) * 0.55 * fine * (1.0 - uRain * 0.65);

          // 黎明朝霞云体
          vec3 dawnCloud = vec3(0.78, 0.71, 0.74);
          dawnCloud = mix(dawnCloud, vec3(0.42, 0.47, 0.55), uRain);
          dawnCloud = mix(dawnCloud, vec3(0.84, 0.88, 0.94), uSnow);
          dawnCloud += vec3(0.24, 0.14, 0.08) * (0.4 + fine * 0.6) * pow(sunAz, 1.5) * clearSky;
          dawnCloud += vec3(0.26, 0.20, 0.12) * pow(s, 4.5) * 0.55 * clearSky;

          vec3 cloud = mix(nightCloud, dawnCloud, uDawn);
          cloud += vec3(0.42, 0.50, 0.72) * uThunder * (0.35 + 0.65 * fine);

          float cloudMix = cover * mix(0.82, 0.62, uDawn) * mix(0.75, 1.0, uCloudiness);
          col = mix(col, cloud, clamp(cloudMix, 0.0, 0.94));

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
          [0, 'rgba(255,210,136,0.34)'],
          [0.28, 'rgba(255,164,92,0.16)'],
          [0.6, 'rgba(242,120,76,0.05)'],
          [1, 'rgba(235,104,64,0)'],
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
    this.sunGlow.scale.setScalar(108)
    this.sunGlow.renderOrder = -2
    this.sunGlow.visible = false
    this.group.add(this.sunGlow)

    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTexture([
          [0, 'rgba(255,249,228,1)'],
          [0.35, 'rgba(255,220,142,0.98)'],
          [0.48, 'rgba(252,166,86,0.90)'],
          [0.62, 'rgba(240,120,72,0.24)'],
          [1, 'rgba(235,104,60,0)'],
        ]),
        transparent: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        opacity: 0,
      }),
    )
    this.sunSprite.position.copy(this.sunBasePos)
    this.sunSprite.scale.setScalar(44)
    this.sunSprite.renderOrder = -1
    this.sunSprite.visible = false
    this.group.add(this.sunSprite)
  }

  /** 0 = 黑夜，1 = 黎明 */
  setDawn(dawn: number) {
    this.dawn = dawn
    this.domeMaterial.uniforms.uDawn.value = dawn
    this.syncCelestials()
  }

  /** 同步云量、雨雪与远雷闪光 */
  setWeather(cloudiness: number, rain: number, snow: number, thunder = 0) {
    this.cloudiness = cloudiness
    this.rain = rain
    this.snow = snow
    this.domeMaterial.uniforms.uCloudiness.value = cloudiness
    this.domeMaterial.uniforms.uRain.value = rain
    this.domeMaterial.uniforms.uSnow.value = snow
    this.domeMaterial.uniforms.uThunder.value = thunder
    this.syncCelestials()
  }

  private syncCelestials() {
    const dawn = this.dawn
    const veil = 1 - THREE.MathUtils.clamp(this.cloudiness * 0.65 + this.rain * 0.22 + this.snow * 0.14, 0, 0.78)
    const starOpacity = Math.max(0, 1 - dawn * 2.2) * Math.max(0, 1 - this.cloudiness * 0.92)
    this.starMaterial.uniforms.uOpacity.value = starOpacity
    this.stars.visible = starOpacity > 0.01

    // 月亮淡出并轻微西沉（阴雨雪天透出朦胧月晕，仍保留可辨识度与点击交互）
    const moonAlpha = THREE.MathUtils.clamp(1 - dawn * 1.75, 0, 1) * veil
    this.moonSprite.visible = moonAlpha > 0.01
    this.moonGlow.visible = moonAlpha > 0.01
    this.moonSprite.material.opacity = moonAlpha
    this.moonGlow.material.opacity = moonAlpha * (1 + this.snow * 0.25)
    const moonOffsetY = -dawn * 26
    this.moonSprite.position.set(this.moonBasePos.x, this.moonBasePos.y + moonOffsetY, this.moonBasePos.z)
    this.moonGlow.position.copy(this.moonSprite.position)

    // 朝阳自地平线柔和升起并点亮
    const sunAlpha = THREE.MathUtils.clamp((dawn - 0.15) * 1.45, 0, 1) * veil
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
