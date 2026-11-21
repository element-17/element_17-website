import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** 场景里「细碎陈设」所在的图层：低画质下不进倒影（芦苇、草、碎石、火星…） */
export const DETAIL_LAYER = 1

/** 把一个对象（含子孙）挪到细节图层 */
export const markDetail = (obj: THREE.Object3D) => {
  obj.traverse((o) => o.layers.set(DETAIL_LAYER))
}

/** 标记为动态：mergeStatic 会跳过它和它的子孙 */
export const markDynamic = (obj: THREE.Object3D) => {
  obj.userData.dynamic = true
}

const isMergeable = (o: THREE.Object3D): o is THREE.Mesh => {
  const mesh = o as THREE.Mesh
  if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return false
  if (Array.isArray(mesh.material)) return false
  // 只合并普通的标准材质；Reflector / ShaderMaterial / Sprite 之类保持原样
  return (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true
}

/**
 * 把 root 下所有静态网格按「材质 + 投影/受影 + 图层」合并成少数几个网格。
 * 几十根树枝、几十块碎石、一整排房子各自只剩一次 draw call（阴影与倒影 pass 同样受益）。
 * 共享同一个材质对象的网格合并后，材质上的动画（如灯笼的自发光呼吸）照常生效；
 * 需要单独移动的对象请先 markDynamic。
 */
export const mergeStatic = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; layers: number; geos: THREE.BufferGeometry[] }>()
  const victims: THREE.Mesh[] = []
  const m = new THREE.Matrix4()

  const visit = (o: THREE.Object3D) => {
    if (o !== root && o.userData.dynamic) return
    if (o !== root && isMergeable(o)) {
      const mat = o.material as THREE.Material
      const key = `${mat.uuid}|${o.castShadow}|${o.receiveShadow}|${o.layers.mask}`
      let b = buckets.get(key)
      if (!b) {
        b = { mat, cast: o.castShadow, receive: o.receiveShadow, layers: o.layers.mask, geos: [] }
        buckets.set(key, b)
      }
      m.multiplyMatrices(inv, o.matrixWorld)
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      g.applyMatrix4(m)
      // 负缩放会把三角形翻面，这里把绕序翻回来
      if (m.determinant() < 0) g = flipWinding(g)
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      if (!g.attributes.normal) g.computeVertexNormals()
      g.morphAttributes = {}
      b.geos.push(g)
      victims.push(o)
    }
    for (const c of o.children) visit(c)
  }
  visit(root)

  for (const v of victims) {
    v.removeFromParent()
  }
  for (const b of buckets.values()) {
    if (b.geos.length === 0) continue
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false)
    if (!merged) continue
    for (const g of b.geos) if (g !== merged) g.dispose()
    merged.computeBoundingSphere()
    const mesh = new THREE.Mesh(merged, b.mat)
    mesh.castShadow = b.cast
    mesh.receiveShadow = b.receive
    mesh.layers.mask = b.layers
    root.add(mesh)
  }
  // 原来的几何体可能被多个网格共享，这里不 dispose，交给 GC
}

const flipWinding = (g: THREE.BufferGeometry) => {
  for (const name of Object.keys(g.attributes)) {
    const attr = g.attributes[name] as THREE.BufferAttribute
    const size = attr.itemSize
    const arr = attr.array as Float32Array
    for (let i = 0; i < attr.count; i += 3) {
      for (let k = 0; k < size; k++) {
        const a = (i + 1) * size + k
        const c = (i + 2) * size + k
        const t = arr[a]
        arr[a] = arr[c]
        arr[c] = t
      }
    }
  }
  return g
}
