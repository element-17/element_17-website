import * as THREE from 'three'

/** 径向渐变贴图（光晕 / 火焰 / 雾团都用它） */
export const makeRadialTexture = (stops: [number, string][], size = 128) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [offset, color] of stops) g.addColorStop(offset, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 月面：亮盘 + 几块淡淡的月海（兜底用，moon.png 加载失败时显示） */
export const makeMoonTexture = (size = 256) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const r = size / 2
  ctx.beginPath()
  ctx.arc(r, r, r - 1, 0, Math.PI * 2)
  ctx.clip()

  const base = ctx.createRadialGradient(r * 0.8, r * 0.75, 0, r, r, r)
  base.addColorStop(0, '#ffffff')
  base.addColorStop(0.6, '#eef3ff')
  base.addColorStop(1, '#c3d1f2')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  const maria: [number, number, number][] = [
    [0.62, 0.38, 0.2],
    [0.4, 0.56, 0.16],
    [0.68, 0.66, 0.13],
    [0.3, 0.32, 0.1],
  ]
  for (const [x, y, rad] of maria) {
    const g = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, rad * size)
    g.addColorStop(0, 'rgba(140,160,205,0.28)')
    g.addColorStop(1, 'rgba(140,160,205,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
