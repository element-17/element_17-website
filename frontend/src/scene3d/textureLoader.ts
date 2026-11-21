import * as THREE from 'three'

/** 贴图目录：把站长生成的图放进 public/textures/，文件名与此处一致即可自动生效 */
const BASE = `${import.meta.env.BASE_URL}textures/`

const loader = new THREE.TextureLoader()

/**
 * 异步加载一张贴图；文件不存在或加载失败时返回 null，
 * 调用方保持原有纯色材质即可——绝不阻塞首帧。
 */
export const loadTexture = (
  file: string,
  setup: (tex: THREE.Texture) => void,
): Promise<THREE.Texture | null> =>
  new Promise((resolve) => {
    loader.load(
      BASE + file,
      (tex) => {
        setup(tex)
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      () => resolve(null),
    )
  })

/** 可平铺贴图的通用设置：横向纵向重复，颜色按 sRGB 解读 */
export const tiled = (repeatX: number, repeatY: number) => (tex: THREE.Texture) => {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeatX, repeatY)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
}
