import type { Scene } from '../types/wallpreview'

export function parseScene(sceneJson: string): Scene {
  try {
    const parsed = JSON.parse(sceneJson) as Scene
    return { layers: Array.isArray(parsed.layers) ? parsed.layers : [] }
  } catch {
    return { layers: [] }
  }
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load image ${src}`))
    image.src = src
  })
}
