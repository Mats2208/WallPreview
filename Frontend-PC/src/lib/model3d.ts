import type { ModelSettings } from '../types/wallpreview'

type ObjGeometry = {
  positions: Float32Array
  normals: Float32Array
}

type RenderModelOptions = {
  canvas: HTMLCanvasElement
  src: string
  settings: ModelSettings
}

const modelCache = new Map<string, Promise<ObjGeometry>>()

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  rotationX: -18,
  rotationY: 32,
  rotationZ: 0,
  zoom: 1,
}

export function isObjAsset(name: string, publicUrl: string) {
  const value = `${name} ${publicUrl}`.toLowerCase()
  return value.includes('.obj') || value.includes('standard1') || value.includes('standar1')
}

export async function renderModelToCanvas({ canvas, src, settings }: RenderModelOptions) {
  const geometry = await loadObjGeometry(src)
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true })
  if (!gl) {
    throw new Error('WebGL is not available.')
  }

  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.CULL_FACE)

  const program = createProgram(gl)
  gl.useProgram(program)

  const positionBuffer = gl.createBuffer()
  const normalBuffer = gl.createBuffer()
  if (!positionBuffer || !normalBuffer) {
    return
  }

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const normalLocation = gl.getAttribLocation(program, 'a_normal')

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(normalLocation)
  gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0)

  const transform = buildTransform(settings, canvas.width / canvas.height)
  const transformLocation = gl.getUniformLocation(program, 'u_transform')
  const rotationLocation = gl.getUniformLocation(program, 'u_rotation')
  const lightLocation = gl.getUniformLocation(program, 'u_light')
  const colorLocation = gl.getUniformLocation(program, 'u_color')

  gl.uniformMatrix4fv(transformLocation, false, transform.matrix)
  gl.uniformMatrix3fv(rotationLocation, false, transform.rotation)
  gl.uniform3f(lightLocation, -0.35, 0.55, 0.76)
  gl.uniform3f(colorLocation, 0.78, 0.82, 0.86)
  gl.drawArrays(gl.TRIANGLES, 0, geometry.positions.length / 3)
}

async function loadObjGeometry(src: string) {
  let cached = modelCache.get(src)
  if (!cached) {
    cached = fetch(src)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load model ${src}`)
        }
        return response.text()
      })
      .then(parseObj)
    modelCache.set(src, cached)
  }

  return cached
}

function parseObj(source: string): ObjGeometry {
  const vertices: number[][] = []
  const positions: number[] = []
  const normals: number[] = []

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const parts = trimmed.split(/\s+/)
    if (parts[0] === 'v') {
      vertices.push([Number(parts[1]), Number(parts[2]), Number(parts[3])])
      continue
    }

    if (parts[0] !== 'f' || parts.length < 4) {
      continue
    }

    const face = parts.slice(1).map((value) => {
      const index = Number(value.split('/')[0])
      return vertices[index < 0 ? vertices.length + index : index - 1]
    }).filter(Boolean)

    for (let index = 1; index < face.length - 1; index += 1) {
      const triangle = [face[0], face[index], face[index + 1]]
      const normal = faceNormal(triangle)
      for (const vertex of triangle) {
        positions.push(vertex[0], vertex[1], vertex[2])
        normals.push(normal[0], normal[1], normal[2])
      }
    }
  }

  return normalizeGeometry(positions, normals)
}

function normalizeGeometry(positions: number[], normals: number[]): ObjGeometry {
  if (!positions.length) {
    return { positions: new Float32Array(), normals: new Float32Array() }
  }

  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  }

  for (let index = 0; index < positions.length; index += 3) {
    bounds.minX = Math.min(bounds.minX, positions[index])
    bounds.minY = Math.min(bounds.minY, positions[index + 1])
    bounds.minZ = Math.min(bounds.minZ, positions[index + 2])
    bounds.maxX = Math.max(bounds.maxX, positions[index])
    bounds.maxY = Math.max(bounds.maxY, positions[index + 1])
    bounds.maxZ = Math.max(bounds.maxZ, positions[index + 2])
  }

  const center = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ]
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) || 1
  const normalized = positions.map((value, index) => (value - center[index % 3]) / size)

  return {
    positions: new Float32Array(normalized),
    normals: new Float32Array(normals),
  }
}

function faceNormal(points: number[][]) {
  const ax = points[1][0] - points[0][0]
  const ay = points[1][1] - points[0][1]
  const az = points[1][2] - points[0][2]
  const bx = points[2][0] - points[0][0]
  const by = points[2][1] - points[0][1]
  const bz = points[2][2] - points[0][2]
  const nx = ay * bz - az * by
  const ny = az * bx - ax * bz
  const nz = ax * by - ay * bx
  const length = Math.hypot(nx, ny, nz) || 1
  return [nx / length, ny / length, nz / length]
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    uniform mat4 u_transform;
    uniform mat3 u_rotation;
    varying vec3 v_normal;
    void main() {
      gl_Position = u_transform * vec4(a_position, 1.0);
      v_normal = normalize(u_rotation * a_normal);
    }
  `)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec3 u_light;
    uniform vec3 u_color;
    varying vec3 v_normal;
    void main() {
      float light = max(dot(normalize(v_normal), normalize(u_light)), 0.0);
      vec3 color = u_color * (0.38 + light * 0.72);
      gl_FragColor = vec4(color, 1.0);
    }
  `)
  const program = gl.createProgram()
  if (!program) {
    throw new Error('Could not create WebGL program.')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  return program
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Could not create WebGL shader.')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

function buildTransform(settings: ModelSettings, aspect: number) {
  const rx = rotationX(toRadians(settings.rotationX))
  const ry = rotationY(toRadians(settings.rotationY))
  const rz = rotationZ(toRadians(settings.rotationZ))
  const rotation = multiply3(multiply3(rz, ry), rx)
  const zoom = Math.max(0.2, settings.zoom)
  const scale = Math.min(1.72, 1.72 / aspect) * zoom
  const projection = orthographic(aspect)
  const model = matrix4FromRotation(rotation, scale)

  return {
    matrix: multiply4(projection, model),
    rotation: new Float32Array(rotation),
  }
}

function rotationX(angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [1, 0, 0, 0, c, s, 0, -s, c]
}

function rotationY(angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, 0, -s, 0, 1, 0, s, 0, c]
}

function rotationZ(angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, s, 0, -s, c, 0, 0, 0, 1]
}

function multiply3(a: number[], b: number[]) {
  const result = new Array<number>(9).fill(0)
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      result[column * 3 + row] =
        a[0 * 3 + row] * b[column * 3 + 0] +
        a[1 * 3 + row] * b[column * 3 + 1] +
        a[2 * 3 + row] * b[column * 3 + 2]
    }
  }
  return result
}

function matrix4FromRotation(rotation: number[], scale: number) {
  return new Float32Array([
    rotation[0] * scale, rotation[1] * scale, rotation[2] * scale, 0,
    rotation[3] * scale, rotation[4] * scale, rotation[5] * scale, 0,
    rotation[6] * scale, rotation[7] * scale, rotation[8] * scale, 0,
    0, 0, 0, 1,
  ])
}

function orthographic(aspect: number) {
  const width = Math.max(1, aspect)
  const height = Math.max(1, 1 / aspect)
  return new Float32Array([
    1 / width, 0, 0, 0,
    0, 1 / height, 0, 0,
    0, 0, -1, 0,
    0, 0, 0, 1,
  ])
}

function multiply4(a: Float32Array, b: Float32Array) {
  const result = new Float32Array(16)
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      result[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3]
    }
  }
  return result
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}
