export type User = {
  id: number
  email: string
  name: string
  role: 'ADMIN' | 'USER'
}

export type Asset = {
  id: number
  kind: 'WALL' | 'UTILITY'
  name: string
  public_url: string
}

export type Project = {
  id: number
  name: string
  wall_asset_id: number | null
  scene_json: string
}

export type Layer = {
  id: string
  assetId: number
  src: string
  name: string
  x: number
  y: number
  width: number
  height: number
  quad?: {
    tl: Point
    tr: Point
    br: Point
    bl: Point
  }
}

export type Scene = {
  layers: Layer[]
}

export type Point = {
  x: number
  y: number
}
