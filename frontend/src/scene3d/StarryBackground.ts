import * as THREE from 'three'
import type { QualityPreset } from '../config/quality'
import { seededRandom } from '../config/random'
import { NOISE_GLSL } from './glsl'
import { makeMoonTexture, makeRadialTexture } from './textures'
import { loadTexture } from './textureLoader'

const STAR_COUNT = 1600
const BAND_COUNT = 1400
const TOTAL_STARS = STAR_COUNT + BAND_COUNT

/** 暮色夜空：暗紫渐变天穹 + 残霞 + 云层 + 闪烁星点 + 星带 + 明月 */
export class StarryBackground {
  readonly group = new THREE.Group()
  private starMaterial: THREE.ShaderMaterial
  private domeMaterial: THREE.ShaderMaterial
  private stars: THREE.Points

  constructor(moonDir: THREE.Vector3, moonDistance: number, sunDir: THREE.Vector3, horizon: THREE.ColorRepresentation) {
    // ---------- 天穹：黄昏入夜，天顶靛黑 -> 暗紫 -> 地平线一抹残霞 ----------
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
        uniform float uTime;
        uniform float uLite;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.13, h));
          col = mix(col, uUpper, smoothstep(0.08, 0.4, h));
          col = mix(col, uZenith, smoothstep(0.3, 0.85, h));

          // 残霞：只在日落方位贴着地平线的一条
          float az = max(dot(normalize(d.xz + 1e-5), uSunDir), 0.0);
          float sunset = pow(az, 3.0);
          col += uGlow * sunset * exp(-h * 8.0) * 0.55;
          col += uGlowCore * pow(az, 12.0) * exp(-h * 18.0) * 0.6;

          // 月亮周围的大气散射
          float m = max(dot(d, uMoonDir), 0.0);
          float moonHalo = pow(m, 60.0) * 0.32 + pow(m, 10.0) * 0.06;
          col += vec3(0.42, 0.38, 0.78) * moonHalo;

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
          // 云体比天空暗，云底被残霞和月光勾亮
          vec3 cloud = vec3(0.035, 0.024, 0.07);
          cloud += uGlow * sunset * exp(-h * 4.0) * (0.5 + fine * 0.7);
          cloud += uGlowCore * pow(az, 8.0) * exp(-h * 9.0) * 0.45;
          cloud += vec3(0.30, 0.28, 0.55) * pow(m, 5.0) * 0.55 * fine;
          col = mix(col, cloud, cover * 0.82);

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
    // 星带所在大圆的法线
    const bandNormal = new THREE.Vector3(0.45, 0.55, -0.7).normalize()
    const bandU = new THREE.Vector3(0, 1, 0).cross(bandNormal).normalize()
    const bandV = bandNormal.clone().cross(bandU).normalize()

    let n = 0
    while (n < TOTAL_STARS) {
      // 交替生成散星与星带，低画质截断 drawRange 时两边都能保留
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
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
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
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vec3(0.9, 0.88, 1.0) * a * vAlpha, 1.0);
        }
      `,
    })
    const stars = new THREE.Points(starGeo, this.starMaterial)
    stars.frustumCulled = false
    stars.renderOrder = -3
    this.stars = stars
    this.group.add(stars)

    // ---------- 月 ----------
    const moonPos = moonDir.clone().multiplyScalar(moonDistance)
    const glow = new THREE.Sprite(
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
      }),
    )
    glow.position.copy(moonPos)
    glow.scale.setScalar(120)
    glow.renderOrder = -2
    this.group.add(glow)

    // 用 Sprite 而不是 CircleGeometry：Sprite 永远正对相机，圆盘不会被斜着看成椭圆。
    const moonMat = new THREE.SpriteMaterial({
      map: makeMoonTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
    const moon = new THREE.Sprite(moonMat)
    moon.position.copy(moonPos)
    moon.scale.setScalar(26)
    moon.renderOrder = -1
    this.group.add(moon)

    // 月面贴图：拿到就换（图已是圆形裁切好的 PNG），拿不到就用程序生成的那张
    void loadTexture('moon.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
    }).then((tex) => {
      if (!tex) return
      moonMat.map = tex
      moonMat.needsUpdate = true
    })
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
