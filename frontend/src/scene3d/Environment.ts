import * as THREE from 'three'
import { CAMP, CLEAR_ZONES } from '../config/shots'
import type { QualityPreset } from '../config/quality'
import { seededRandom } from '../config/random'
import { markDetail, mergeStatic } from './merge'
import { River, WATER_Y, buildTerrain, groundHeight, nearShore, shoreDistance } from './River'
import { makeRadialTexture } from './textures'
import { loadTexture, tiled } from './textureLoader'
import type { WeatherState } from './WeatherSystem'

/** 月亮方向：方位 200°、仰角 11°（低角度月光 -> 长影 + 轮廓光） */
export const MOON_DIR = new THREE.Vector3(-0.336, 0.191, -0.922).normalize()
/** 月亮盘离原点的距离：不是无穷远，镜头移动时月亮有轻微视差 */
export const MOON_DISTANCE = 400
/** 日落方位：太阳刚沉到地平线下，残霞在主角身后偏右 */
export const SUN_DIR = new THREE.Vector3(0.47, 0.06, -0.88).normalize()
/** 黎明朝阳方向：河面与远山正中上方，桌面与移动端均清晰可见、便于点击 */
export const DAWN_SUN_DIR = new THREE.Vector3(-0.14, 0.2, -0.97).normalize()
/** 暮霭：远景都褪进这层暗紫里 */
export const FOG_COLOR = 0x2c1b47
export const FOG_DENSITY = 0.0032
/** 黎明晨雾：初版暖杏晨霭微降一档明度，柔和不发白 */
export const DAWN_FOG_COLOR = 0xd2b7b7
export const DAWN_FOG_DENSITY = 0.00182

/** 营地以原点为中心，远山圆环也以原点为圆心 */
const RANGE_CX = 0
const GRASS_BLADES = 320
const REED_BLADES = 280
const MOTES = 70

/** 同一位置得到同一结果的“噪声”，保证几何体接缝处不开裂 */
const ridge = (angle: number, y: number, seed = 0) =>
  1 +
  0.1 * Math.sin(angle * 3 + 1.3 + y * 0.21 + seed) +
  0.07 * Math.sin(angle * 7 + y * 0.63 + 0.4 + seed * 2.1) +
  0.04 * Math.sin(angle * 13 + y * 1.7 + seed * 3.7)

const roughen = (geo: THREE.BufferGeometry, seed: number, amount = 1) => {
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const k = 1 + (ridge(Math.atan2(z, x), y, seed) - 1) * amount
    pos.setXYZ(i, x * k, y, z * k)
  }
  geo.computeVertexNormals()
  return geo
}

/**
 * 一圈山脊：环带中线隆起成山，轮廓用折返正弦叠出尖峰（绕一圈首尾相接）。
 * 山脚埋在地面与水面以下，露出来的只有被雾托着的山体。
 */
const ridgeBand = (radius: number, width: number, height: number, seed: number) => {
  const AROUND = 240
  const ACROSS = 6
  const BASE = -26
  const crest = (a: number) =>
    0.28 * (1 - Math.abs(Math.sin(a * 3.5 + seed))) +
    0.24 * (1 - Math.abs(Math.sin(a * 8 + seed * 2.1))) +
    0.2 * (1 - Math.abs(Math.sin(a * 17.5 + seed * 3.7))) +
    0.14 * (1 - Math.abs(Math.sin(a * 37 + seed * 5.3))) +
    0.09 * (1 - Math.abs(Math.sin(a * 79.5 + seed * 1.9))) +
    0.05 * (1 - Math.abs(Math.sin(a * 163 + seed * 4.4)))
  const pos: number[] = []
  const index: number[] = []
  for (let i = 0; i <= AROUND; i++) {
    const a = (i / AROUND) * Math.PI * 2
    const top = height * (0.25 + 0.75 * crest(a))
    for (let j = 0; j <= ACROSS; j++) {
      const t = j / ACROSS
      const r = radius + (t - 0.5) * width * (1 + 0.2 * Math.sin(a * 3 + seed))
      const profile = Math.sin(Math.PI * t) ** 1.4
      const fold =
        1 +
        (0.1 * Math.sin(a * 61 + t * 9 + seed) + 0.07 * Math.sin(a * 139 - t * 13 + seed * 2.3) + 0.04 * Math.sin(a * 283 + t * 21)) *
          Math.sin(Math.PI * t)
      pos.push(Math.cos(a) * r, BASE + (top - BASE) * profile * fold, Math.sin(a) * r)
    }
  }
  const row = ACROSS + 1
  for (let i = 0; i < AROUND; i++) {
    for (let j = 0; j < ACROSS; j++) {
      const p = i * row + j
      index.push(p, p + 1, p + row, p + 1, p + row + 1, p + row)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

const inClearZone = (x: number, z: number) =>
  CLEAR_ZONES.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)

/** 场景环境：河两岸的地形、河面、芦苇、碎石、枯树、野草、三层远山、水雾，以及月光/残霞与雨雪覆层 */
export class Environment {
  readonly group = new THREE.Group()
  private mists: { sprite: THREE.Sprite; speed: number; baseOpacity: number }[] = []
  private motes: THREE.Points
  private moteMat: THREE.PointsMaterial
  private moteBase: Float32Array
  private moteCount = MOTES
  private moon: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private dusk: THREE.DirectionalLight
  private ridgeMat: THREE.MeshStandardMaterial
  private groundMat: THREE.MeshStandardMaterial
  private rockMat: THREE.MeshStandardMaterial
  private hasGroundTex = false
  private hasRockTex = false
  private grassMat: THREE.MeshStandardMaterial
  private reedMat: THREE.MeshStandardMaterial
  private grass: THREE.InstancedMesh
  private reeds: THREE.InstancedMesh
  private clubs: THREE.InstancedMesh
  private river: River
  private moonLightPos = MOON_DIR.clone().multiplyScalar(45)
  private dawnLightPos = DAWN_SUN_DIR.clone().multiplyScalar(45)
  private dawnSunPos = DAWN_SUN_DIR.clone().multiplyScalar(MOON_DISTANCE)
  private tmpColor = new THREE.Color()
  private tmpColor2 = new THREE.Color()
  private dawnMistTint = new THREE.Color(0xfff1e0)
  private rainMistTint = new THREE.Color(0xb8c6de)
  private snowMistTint = new THREE.Color(0xe6f0ff)

  /** 芦苇摆动与风力（顶点着色器用） */
  private reedUniforms = { uTime: { value: 0 }, uWind: { value: 1 } }
  /** 地面/岩石积雪与湿润着色器统一变量 */
  private surfaceUniforms = {
    uSnow: { value: 0 },
    uRain: { value: 0 },
    uDawn: { value: 0 },
    uFirePos: { value: new THREE.Vector2(CAMP.fire.x, CAMP.fire.z) },
  }

  /** 实际生成成功的实例数 */
  private grassBuilt = GRASS_BLADES
  private reedsBuilt = REED_BLADES
  private clubsBuilt = 0

  /** 运行时切换画质：阴影、倒影、草叶、芦苇、浮尘、雾团即时生效 */
  applyQuality(preset: QualityPreset) {
    const { shadowMapSize, grassBlades, reeds, motes, mists } = preset
    this.moon.castShadow = shadowMapSize > 0
    if (shadowMapSize > 0 && this.moon.shadow.mapSize.x !== shadowMapSize) {
      this.moon.shadow.mapSize.set(shadowMapSize, shadowMapSize)
      this.moon.shadow.map?.dispose()
      this.moon.shadow.map = null
    }
    this.grass.count = Math.min(grassBlades, this.grassBuilt)
    const rCount = Math.min(reeds, this.reedsBuilt)
    this.reeds.count = rCount
    this.clubs.count = Math.min(Math.ceil(rCount / 3), this.clubsBuilt)
    this.moteCount = Math.min(motes, MOTES)
    this.motes.geometry.setDrawRange(0, this.moteCount)
    for (let i = 0; i < this.mists.length; i++) {
      this.mists[i].sprite.visible = i < mists
    }
    this.river.applyQuality(preset)
  }

  /** 倒影贴图跟着画布尺寸与画质走 */
  setReflectionSize(width: number, height: number) {
    this.river.setSize(width, height)
  }

  dispose() {
    this.river.dispose()
  }

  private injectSurfaceWeather(mat: THREE.MeshStandardMaterial, fireMelt = true) {
    const u = this.surfaceUniforms
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSnow = u.uSnow
      shader.uniforms.uRain = u.uRain
      shader.uniforms.uDawn = u.uDawn
      shader.uniforms.uFirePos = u.uFirePos
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec3 vWeatherWorldPos;
          varying vec3 vWeatherWorldNorm;
        `,
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          #include <project_vertex>
          {
            vec4 wPos = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              wPos = instanceMatrix * wPos;
            #endif
            wPos = modelMatrix * wPos;
            vWeatherWorldPos = wPos.xyz;
            vWeatherWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
          }
        `,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform float uSnow;
          uniform float uRain;
          uniform float uDawn;
          uniform vec2 uFirePos;
          varying vec3 vWeatherWorldPos;
          varying vec3 vWeatherWorldNorm;
        `,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          #include <color_fragment>
          if (uSnow > 0.005) {
            float up = smoothstep(0.36, 0.80, vWeatherWorldNorm.y);
            float patchN = 0.5 + 0.5 * sin(vWeatherWorldPos.x * 0.65 + cos(vWeatherWorldPos.z * 0.58) * 1.45);
            float melt = ${fireMelt ? 'smoothstep(0.95, 2.35, length(vWeatherWorldPos.xz - uFirePos))' : '1.0'};
            float aboveWater = smoothstep(-0.36, -0.06, vWeatherWorldPos.y);
            float mask = clamp(uSnow * up * melt * aboveWater * (0.76 + 0.24 * patchN), 0.0, 0.90);
            vec3 snowCol = mix(vec3(0.58, 0.66, 0.82), vec3(0.90, 0.94, 0.99), uDawn);
            diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, mask);
          }
          if (uRain > 0.005) {
            diffuseColor.rgb *= mix(1.0, 0.72, uRain);
          }
        `,
        )
    }
  }

  constructor() {
    const rand = seededRandom(31)

    // ---------- 光 ----------
    const moon = new THREE.DirectionalLight(0xbdb6ff, 2.6)
    moon.position.copy(MOON_DIR).multiplyScalar(45)
    moon.castShadow = true
    moon.shadow.mapSize.set(2048, 2048)
    // 覆盖营地与近岸垂钓区（z 延伸至 -9）
    moon.shadow.camera.left = -10.5
    moon.shadow.camera.right = 10.5
    moon.shadow.camera.top = 10.5
    moon.shadow.camera.bottom = -10.5
    moon.shadow.camera.near = 10
    moon.shadow.camera.far = 85
    moon.shadow.bias = -0.0006
    moon.shadow.normalBias = 0.03
    this.moon = moon
    this.group.add(moon, moon.target)

    // 天光：背光面带一点暮色的紫，黎明转为清朗天蓝与暖地反射
    this.hemi = new THREE.HemisphereLight(0x6a55b0, 0x140b1c, 1.05)
    this.group.add(this.hemi)

    // 残霞/晨晖：低角度暖色轮廓光，不投影
    const dusk = new THREE.DirectionalLight(0xff8a66, 0.85)
    dusk.position.copy(SUN_DIR).multiplyScalar(40)
    this.dusk = dusk
    this.group.add(dusk, dusk.target)

    // ---------- 地形：近岸、河床、对岸连成一整块 ----------
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3d3a56,
      metalness: 0,
      roughness: 1,
      vertexColors: true,
    })
    this.injectSurfaceWeather(groundMat, true)
    this.groundMat = groundMat
    const terrain = new THREE.Mesh(buildTerrain(), groundMat)
    terrain.receiveShadow = true
    this.group.add(terrain)

    // 石头的材质：碎石、倚石、河畔垂钓石、水边石块共用
    const rock = new THREE.MeshStandardMaterial({
      color: 0x3d3a56,
      metalness: 0.02,
      roughness: 0.95,
      flatShading: false,
    })
    this.injectSurfaceWeather(rock, true)
    this.rockMat = rock

    // 贴图异步加载：拿到就换上，拿不到保持纯色，不阻塞首帧
    void loadTexture('rock.jpg', tiled(3, 2)).then((tex) => {
      if (!tex) return
      rock.map = tex
      rock.bumpMap = tex
      rock.bumpScale = 1.6
      this.hasRockTex = true
      this.syncSurfaceAlbedo()
      rock.needsUpdate = true
    })
    void loadTexture('ground.jpg', tiled(1, 1)).then((tex) => {
      if (!tex) return
      groundMat.map = tex
      groundMat.bumpMap = tex
      groundMat.bumpScale = 2.2
      this.hasGroundTex = true
      this.syncSurfaceAlbedo()
      groundMat.needsUpdate = true
    })

    // ---------- 河面 ----------
    this.river = new River(MOON_DIR.clone().multiplyScalar(MOON_DISTANCE), SUN_DIR, FOG_COLOR, FOG_DENSITY)
    this.group.add(this.river.mesh)

    // ---------- 静态石头与枯树（放进独立组里合并，大幅压低 draw call） ----------
    const staticDecor = new THREE.Group()

    const stoneGeo = new THREE.IcosahedronGeometry(1, 0)
    const stones: [number, number, number, number][] = [
      [4.2, -1.6, 0.5, 0.4],
      [4.7, -0.6, 0.32, 1.2],
      [-4.4, -2.8, 0.65, 2.2],
      [-2.2, 3.0, 0.28, 0.7],
      [1.5, 3.4, 0.36, 3.1],
      [4.6, 2.2, 0.5, 1.9],
      [-4.8, 0.8, 0.42, 2.7],
      [0.9, -4.2, 0.6, 0.2],
      [-0.6, 2.1, 0.14, 1.1],
    ]
    for (const [x, z, s0, r] of stones) {
      if (inClearZone(x, z)) continue
      const s = s0 * 0.5
      const m = new THREE.Mesh(stoneGeo, rock)
      m.position.set(x, groundHeight(x, z) + s * 0.32, z)
      m.scale.set(s, s * 0.7, s * 0.85)
      m.rotation.set(r, r * 1.7, r * 0.6)
      m.castShadow = true
      m.receiveShadow = true
      markDetail(m)
      staticDecor.add(m)
    }

    // 营地周边的零星碎石
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2
      const r = 3.2 + rand() * 5.0
      const sx = Math.cos(a) * r
      const sz = Math.sin(a) * r * 0.8
      if (inClearZone(sx, sz) || shoreDistance(sx, sz) < 1.0) continue
      const s = 0.09 + rand() * 0.14
      const m = new THREE.Mesh(stoneGeo, rock)
      m.position.set(sx, groundHeight(sx, sz) + s * 0.32, sz)
      m.scale.set(s, s * 0.7, s * 0.85)
      m.rotation.set(rand() * 3, rand() * 6.28, rand() * 2)
      m.castShadow = true
      m.receiveShadow = true
      markDetail(m)
      staticDecor.add(m)
    }

    // 倚石：大石供主角晴/阴倚靠（留在默认层，确保倒影里可见）
    const boulderGeo = new THREE.DodecahedronGeometry(1, 0)
    const boulder = new THREE.Mesh(roughen(boulderGeo, 9, 0.7), rock)
    boulder.scale.set(0.75, 0.95, 0.8)
    boulder.rotation.set(0.3, 1.2, 0.1)
    boulder.position.set(0.65, -0.05, -0.3)
    boulder.castShadow = true
    boulder.receiveShadow = true
    staticDecor.add(boulder)

    // 河畔垂钓青石：自然扁平巨石半嵌在水线边，雨天供火柴人坐着执竿垂钓（保留在默认层进倒影）
    const fishRockGeo = new THREE.DodecahedronGeometry(1, 0)
    const fishRock = new THREE.Mesh(roughen(fishRockGeo, 17, 0.55), rock)
    const fBaseY = groundHeight(CAMP.fishing.x, CAMP.fishing.z)
    fishRock.scale.set(0.58, 0.34, 0.54)
    fishRock.position.set(CAMP.fishing.x, fBaseY + 0.14, CAMP.fishing.z + 0.04)
    fishRock.rotation.set(0.08, 0.65, -0.05)
    fishRock.castShadow = true
    fishRock.receiveShadow = true
    staticDecor.add(fishRock)

    // 垂钓青石旁一块小踏脚石，让垂钓姿态脚掌自然贴石不悬空
    const stepRock = new THREE.Mesh(stoneGeo, rock)
    stepRock.position.set(CAMP.fishing.x + 0.12, fBaseY - 0.05, CAMP.fishing.z - 0.48)
    stepRock.scale.set(0.32, 0.14, 0.28)
    stepRock.rotation.set(0.1, 0.8, 0.05)
    stepRock.receiveShadow = true
    staticDecor.add(stepRock)

    // 枯树：铁砧右后方，向水面探出的斜干
    staticDecor.add(this.buildTree(rand))

    // 水边的石块：半浸在浅水里
    for (let i = 0; i < 12; i++) {
      const x = -28 + rand() * 56
      const z = nearShore(x) - 0.3 - rand() * 3.0
      if (inClearZone(x, z)) continue
      const s = 0.16 + rand() * 0.3
      const m = new THREE.Mesh(stoneGeo, rock)
      m.position.set(x, WATER_Y - s * 0.12, z)
      m.scale.set(s, s * 0.55, s * 0.8)
      m.rotation.set(rand() * 3, rand() * 6.28, rand() * 2)
      m.castShadow = true
      m.receiveShadow = true
      markDetail(m)
      staticDecor.add(m)
    }

    mergeStatic(staticDecor)
    this.group.add(staticDecor)

    // ---------- 野草 ----------
    const GRASS_MIN_SHORE = 2.6
    const bladeGeo = new THREE.ConeGeometry(0.014, 1, 3)
    bladeGeo.translate(0, 0.5, 0)
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x4a5a78,
      metalness: 0,
      roughness: 0.98,
    })
    this.grassMat = grassMat
    const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_BLADES)
    const onDryLand = (x: number, z: number) =>
      shoreDistance(x, z) >= GRASS_MIN_SHORE && groundHeight(x, z) > WATER_Y + 0.05
    const clumps: [number, number][] = []
    let guard = 0
    while (clumps.length < 56 && guard++ < 4000) {
      const x = -16 + rand() * 32
      const z = -7.2 + rand() * 12.5
      if (inClearZone(x, z) || !onDryLand(x, z)) continue
      clumps.push([x, z])
    }
    const dummy = new THREE.Object3D()
    const mats: THREE.Matrix4[] = []
    for (const [cx, cz] of clumps) {
      const blades = 4 + Math.floor(rand() * 5)
      for (let b = 0; b < blades; b++) {
        const bx = cx + (rand() - 0.5) * 0.24
        const bz = cz + (rand() - 0.5) * 0.24
        if (inClearZone(bx, bz) || !onDryLand(bx, bz)) continue
        dummy.position.set(bx, groundHeight(bx, bz), bz)
        dummy.rotation.set((rand() - 0.5) * 0.7, rand() * 6.28, (rand() - 0.5) * 0.7)
        dummy.scale.set(1, 0.16 + rand() * 0.32, 1)
        dummy.updateMatrix()
        mats.push(dummy.matrix.clone())
      }
    }
    for (let i = mats.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[mats[i], mats[j]] = [mats[j], mats[i]]
    }
    const grassCount = Math.min(mats.length, GRASS_BLADES)
    mats.slice(0, grassCount).forEach((m, i) => grass.setMatrixAt(i, m))
    grass.count = grassCount
    this.grassBuilt = grassCount
    grass.receiveShadow = true
    markDetail(grass)
    this.grass = grass
    this.group.add(grass)

    // ---------- 芦苇：沿近岸水线成丛（避开垂钓青石正前方，免得挡住钓竿与浮漂） ----------
    const reedGeo = new THREE.ConeGeometry(0.016, 1, 4)
    reedGeo.translate(0, 0.5, 0)
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x2f2c44, metalness: 0, roughness: 1 })
    this.reedMat = reedMat
    const reedUniforms = this.reedUniforms
    const applySway = (mat: THREE.MeshStandardMaterial, bend = 1) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = reedUniforms.uTime
        shader.uniforms.uWind = reedUniforms.uWind
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            /* glsl */ `
          #include <common>
          uniform float uTime;
          uniform float uWind;
        `,
          )
          .replace(
            '#include <begin_vertex>',
            /* glsl */ `
          #include <begin_vertex>
          {
            vec3 inst = instanceMatrix[3].xyz;
            float h = max(position.y, 0.0);
            float t = uTime * (0.85 + 0.35 * uWind);
            float sway = (sin(t * 1.35 + inst.x * 0.55 + inst.z * 0.31) * 0.1
                        + sin(t * 0.63 + inst.x * 0.17) * 0.05) * uWind;
            transformed.x += sway * h * h * ${bend.toFixed(2)};
            transformed.z += sway * 0.35 * h * h * ${bend.toFixed(2)};
          }
        `,
          )
      }
    }
    applySway(reedMat)
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, REED_BLADES)
    const REED_IN_WATER = 1.6
    const REED_ON_BANK = 0.5
    const inReedBand = (x: number, z: number) => {
      const d = shoreDistance(x, z)
      if (d < -REED_IN_WATER || d > REED_ON_BANK) return false
      // 给垂钓区留出一处开阔视野（左右两侧保留芦苇烘托层次）
      const dx = x - CAMP.fishing.x
      const dz = z - (CAMP.fishing.z - 0.8)
      return dx * dx + dz * dz > 2.4 * 2.4
    }
    const reedMats: THREE.Matrix4[] = []
    let reedGuard = 0
    while (reedMats.length < REED_BLADES && reedGuard++ < 4000) {
      const cx = -34 + rand() * 68
      const cz = nearShore(cx) - 0.6 + rand() * 1.0
      const blades = 4 + Math.floor(rand() * 5)
      const spread = 0.3 + rand() * 0.55
      for (let b = 0; b < blades && reedMats.length < REED_BLADES; b++) {
        const x = cx + (rand() - 0.5) * spread * 2
        const z = cz + (rand() - 0.5) * spread
        if (!inReedBand(x, z)) continue
        dummy.position.set(x, groundHeight(x, z) - 0.05, z)
        dummy.rotation.set((rand() - 0.5) * 0.3, rand() * 6.28, -0.08 - rand() * 0.22)
        dummy.scale.set(1, 0.55 + rand() * 0.6, 1)
        dummy.updateMatrix()
        reedMats.push(dummy.matrix.clone())
      }
    }
    for (let i = reedMats.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[reedMats[i], reedMats[j]] = [reedMats[j], reedMats[i]]
    }
    reedMats.forEach((m, i) => reeds.setMatrixAt(i, m))
    reeds.count = reedMats.length
    this.reedsBuilt = reedMats.length
    markDetail(reeds)
    this.reeds = reeds
    this.group.add(reeds)

    // ---------- 蒲棒：直接长在真实芦苇的梢部（约三成） ----------
    const clubGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.24, 6)
    clubGeo.translate(0, 0.99, 0)
    const clubMat = new THREE.MeshStandardMaterial({ color: 0x1c1524, metalness: 0, roughness: 1 })
    applySway(clubMat)
    const clubMats: THREE.Matrix4[] = []
    for (let i = 0; i < reedMats.length; i += 3) {
      clubMats.push(reedMats[i])
    }
    const clubs = new THREE.InstancedMesh(clubGeo, clubMat, Math.max(1, clubMats.length))
    clubMats.forEach((m, i) => clubs.setMatrixAt(i, m))
    clubs.count = clubMats.length
    this.clubsBuilt = clubMats.length
    markDetail(clubs)
    this.clubs = clubs
    this.group.add(clubs)

    // ---------- 远山：三层山脊，合并成一个静态网格 ----------
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x2a2440, metalness: 0, roughness: 1, side: THREE.DoubleSide })
    this.ridgeMat = ridgeMat
    const rangesGroup = new THREE.Group()
    const ranges: [number, number, number, number][] = [
      [200, 90, 24, 1.3],
      [310, 130, 42, 4.1],
      [470, 180, 70, 7.7],
    ]
    for (const [radius, width, height, seed] of ranges) {
      const range = new THREE.Mesh(ridgeBand(radius, width, height, seed), ridgeMat)
      range.position.x = RANGE_CX
      rangesGroup.add(range)
    }
    mergeStatic(rangesGroup)
    this.group.add(rangesGroup)

    // ---------- 雾 ----------
    const mistTex = makeRadialTexture([
      [0, 'rgba(190,170,235,0.55)'],
      [0.5, 'rgba(160,135,215,0.18)'],
      [1, 'rgba(150,125,205,0)'],
    ])
    const addMist = (x: number, y: number, z: number, w: number, h: number, opacity: number, speed: number) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, depthWrite: false, opacity }))
      sprite.position.set(x, y, z)
      sprite.scale.set(w, h, 1)
      this.group.add(sprite)
      this.mists.push({ sprite, speed, baseOpacity: opacity })
    }
    for (let i = 0; i < 6; i++) {
      const w = 26 + rand() * 24
      addMist(-55 + rand() * 110, 0.5 + rand() * 1.5, -42 + rand() * 20, w, w * (0.05 + rand() * 0.035), 0.1 + rand() * 0.12, 0.3 + rand() * 0.5)
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + 0.25 * Math.PI + rand() * 0.5 * Math.PI
      const r = 175 + rand() * 220
      const w = 150 + rand() * 120
      addMist(RANGE_CX + Math.cos(a) * r, 3 + rand() * 9, Math.sin(a) * r, w, w * (0.1 + rand() * 0.06), 0.14 + rand() * 0.16, 0.4 + rand() * 0.6)
    }
    for (let i = 0; i < 6; i++) {
      const w = 26 + rand() * 26
      addMist(-90 + rand() * 180, 0.5 + rand() * 1.6, -44 + rand() * 22, w, w * (0.05 + rand() * 0.035), 0.1 + rand() * 0.12, 0.3 + rand() * 0.5)
    }
    for (let i = 0; i < 8; i++) {
      const w = 70 + rand() * 70
      addMist(-190 + rand() * 150, 1 + rand() * 4, -200 + rand() * 110, w, w * (0.05 + rand() * 0.035), 0.06 + rand() * 0.09, 0.3 + rand() * 0.5)
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + rand() * Math.PI
      const r = 170 + rand() * 250
      const w = 150 + rand() * 120
      addMist(RANGE_CX + Math.cos(a) * r, 3 + rand() * 9, Math.sin(a) * r, w, w * (0.1 + rand() * 0.06), 0.14 + rand() * 0.16, 0.4 + rand() * 0.6)
    }

    // ---------- 浮尘微光 ----------
    this.moteBase = new Float32Array(MOTES * 3)
    for (let i = 0; i < MOTES; i++) {
      this.moteBase.set([(rand() - 0.5) * 14, 0.25 + rand() * 3.8, (rand() - 0.5) * 12], i * 3)
    }
    const moteGeo = new THREE.BufferGeometry()
    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.moteBase.slice(), 3))
    const moteMat = new THREE.PointsMaterial({
      map: makeRadialTexture(
        [
          [0, 'rgba(255,255,255,1)'],
          [0.4, 'rgba(225,205,255,0.5)'],
          [1, 'rgba(225,205,255,0)'],
        ],
        32,
      ),
      color: 0xd6c4ff,
      size: 0.06,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.moteMat = moteMat
    this.motes = new THREE.Points(moteGeo, moteMat)
    this.motes.frustumCulled = false
    markDetail(this.motes)
    this.group.add(this.motes)
  }

  private buildTree(rand: () => number) {
    const tree = new THREE.Group()
    const bark = new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 1, flatShading: true })
    const geo = new THREE.CylinderGeometry(0.62, 1, 1, 6)
    geo.translate(0, 0.5, 0)
    const up = new THREE.Vector3(0, 1, 0)

    const grow = (start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number) => {
      const m = new THREE.Mesh(geo, bark)
      m.position.copy(start)
      m.quaternion.setFromUnitVectors(up, dir)
      m.scale.set(radius, length, radius)
      m.castShadow = true
      tree.add(m)
      if (depth === 0) return
      const end = start.clone().addScaledVector(dir, length)
      const kids = depth > 2 ? 2 : 2 + Math.floor(rand() * 2)
      for (let i = 0; i < kids; i++) {
        const d = dir
          .clone()
          .add(new THREE.Vector3((rand() - 0.5) * 1.5, (rand() - 0.35) * 0.9, (rand() - 0.5) * 1.5))
          .normalize()
        grow(end, d, length * (0.6 + rand() * 0.18), radius * 0.62, depth - 1)
      }
    }
    grow(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0.35, 1, -0.25).normalize(), 1.7, 0.17, 4)
    tree.position.set(4.6, 0, -3.4)
    return tree
  }

  private syncSurfaceAlbedo() {
    if (this.hasGroundTex) {
      this.groundMat.color.setRGB(1.45, 1.65, 2.2)
    } else {
      this.groundMat.color.setHex(0x3d3a56)
    }

    if (this.hasRockTex) {
      this.rockMat.color.setHex(0x8a8298)
    } else {
      this.rockMat.color.setHex(0x3d3a56)
    }
  }

  /** 同步昼夜与气象（光照、湿滑反光、积雪覆层、雾团与水面） */
  setAtmosphere(dawn: number, weather: WeatherState, fogColor: THREE.Color, fogDensity: number) {
    this.syncSurfaceAlbedo()
    const { rain, snow, cloudy, wind, thunderFlash } = weather

    // 地面/石材表面雨雪质感
    this.surfaceUniforms.uSnow.value = snow
    this.surfaceUniforms.uRain.value = rain
    this.surfaceUniforms.uDawn.value = dawn
    this.groundMat.roughness = THREE.MathUtils.lerp(1.0, 0.58, rain)
    this.rockMat.roughness = THREE.MathUtils.lerp(0.95, 0.5, rain)
    this.reedUniforms.uWind.value = wind

    // 主定向光：雨天柔和转冷青，雪天偏清亮霜白，阴天略柔
    this.moon.color.setHex(0xbdb6ff).lerp(this.tmpColor.setHex(0xffe9c4), dawn)
    this.tmpColor2.setHex(0x9cb4db).lerp(this.tmpColor.setHex(0xcfdbe8), dawn)
    this.moon.color.lerp(this.tmpColor2, rain * 0.72)
    this.tmpColor2.setHex(0xd4e2ff).lerp(this.tmpColor.setHex(0xf4f8ff), dawn)
    this.moon.color.lerp(this.tmpColor2, snow * 0.65)
    const dirScale = 1 - cloudy * 0.22 - rain * 0.42 - snow * 0.16 + thunderFlash * 0.65
    this.moon.intensity = THREE.MathUtils.lerp(2.6, 3.15, dawn) * Math.max(0.45, dirScale)
    this.moon.position.copy(this.moonLightPos).lerp(this.dawnLightPos, dawn)

    // 天光：雨天柔和漫射保证河畔清晰可读，雪天地面高反照带来清透漫反射
    this.hemi.color.setHex(0x6a55b0).lerp(this.tmpColor.setHex(0xb0cef2), dawn)
    this.hemi.groundColor.setHex(0x140b1c).lerp(this.tmpColor.setHex(0x86726a), dawn)
    if (rain > 0.01) {
      this.hemi.color.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0x9aaec2 : 0x5c6e92), rain * 0.7)
      this.hemi.groundColor.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0x525d6b : 0x161c2a), rain * 0.65)
    }
    if (snow > 0.01) {
      this.hemi.color.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0xd2e2f5 : 0x8ea4d2), snow * 0.72)
      this.hemi.groundColor.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0xc2d0e2 : 0x4b5878), snow * 0.78)
    }
    this.hemi.intensity = THREE.MathUtils.lerp(1.05, 1.82, dawn) * (1 + rain * 0.18 + snow * 0.34 + thunderFlash * 0.4)

    // 低角度暖光：阴雨雪天大幅收敛
    this.dusk.color.setHex(0xff8a66).lerp(this.tmpColor.setHex(0xffb882), dawn)
    this.dusk.intensity = THREE.MathUtils.lerp(0.85, 1.05, dawn) * Math.max(0.12, 1 - rain * 0.85 - snow * 0.6 - cloudy * 0.4)

    // 远山与近岸植物
    this.ridgeMat.color.setHex(0x2a2440).lerp(this.tmpColor.setHex(0x6a7092), dawn)
    this.ridgeMat.color.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0x5f6b7d : 0x202738), rain * 0.6)
    this.ridgeMat.color.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0xb8c5da : 0x596582), snow * 0.68)

    this.grassMat.color.setHex(0x4a5a78).lerp(this.tmpColor.setHex(0x677a6a), dawn)
    this.grassMat.color.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0xd8e2f0 : 0x8a9ab8), snow * 0.72)

    this.reedMat.color.setHex(0x2f2c44).lerp(this.tmpColor.setHex(0x575f58), dawn)
    this.reedMat.color.lerp(this.tmpColor.setHex(dawn > 0.5 ? 0xcad6e8 : 0x7685a4), snow * 0.58)

    // 浮尘微光：晴/阴可见，雨雪天隐去让位给雨丝/飘雪
    this.moteMat.color.setHex(0xd6c4ff).lerp(this.tmpColor.setHex(0xffe6b3), dawn)
    const moteFade = Math.max(0, 1 - rain * 1.4 - snow * 1.4)
    this.moteMat.opacity = THREE.MathUtils.lerp(0.7, 0.42, dawn) * moteFade
    this.motes.visible = moteFade > 0.02

    // 河雾：随阴/雨/雪变浓并切换色调
    this.tmpColor.setHex(0xffffff).lerp(this.dawnMistTint, dawn)
    this.tmpColor.lerp(this.rainMistTint, rain * 0.7)
    this.tmpColor.lerp(this.snowMistTint, snow * 0.75)
    const mistMul = THREE.MathUtils.lerp(1, 1.05, dawn) * (1 + cloudy * 0.35 + rain * 0.52 + snow * 0.32)
    for (const { sprite, baseOpacity } of this.mists) {
      const mat = sprite.material as THREE.SpriteMaterial
      mat.color.copy(this.tmpColor)
      mat.opacity = Math.min(0.5, baseOpacity * mistMul)
    }

    this.river.setAtmosphere(dawn, this.dawnSunPos, fogColor, fogDensity, rain, snow)
  }

  update(time: number, dt: number) {
    for (const { sprite, speed } of this.mists) {
      if (!sprite.visible) continue
      sprite.position.x += speed * dt
      if (sprite.position.x > 180) sprite.position.x = -180
    }
    this.river.update(time)
    this.reedUniforms.uTime.value = time
    if (this.motes.visible) {
      const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute
      const base = this.moteBase
      for (let i = 0; i < this.moteCount; i++) {
        const k = i * 3
        pos.setXYZ(
          i,
          base[k] + Math.sin(time * 0.21 + i) * 0.7,
          base[k + 1] + Math.sin(time * 0.33 + i * 1.7) * 0.35,
          base[k + 2] + Math.cos(time * 0.17 + i * 0.6) * 0.7,
        )
      }
      pos.needsUpdate = true
    }
  }
}
