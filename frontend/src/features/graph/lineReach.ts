import {
  Line3,
  PerspectiveCamera,
  Plane,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Intersection,
  type Mesh,
  type Object3D,
  type Raycaster,
} from 'three'

/** How far from a line, in screen pixels, still counts as pointing at it. */
const REACH_PX = 8

// The graph is drawn flat, on z = 0.
const FLAT = new Plane(new Vector3(0, 0, 1), 0)

/**
 * Lines are a pixel or two wide, too thin to point at. Reagraph looks for the line
 * under the pointer with `raycaster.intersectObjects` (nothing else here calls it:
 * three's own pointer events use `intersectObject`), so this swaps it for "the
 * nearest line within a few pixels". Returns a function that puts the exact one back.
 */
export function widenLineReach(
  raycaster: Raycaster,
  view: () => { camera: Camera; heightPx: number },
) {
  const exact = raycaster.intersectObjects
  raycaster.intersectObjects = <T extends Object3D>(objects: Object3D[]) => {
    const point = raycaster.ray.intersectPlane(FLAT, new Vector3())
    if (!point) return []
    const { camera, heightPx } = view()
    const near = nearestLine(objects, point, REACH_PX * worldPerPixel(camera, heightPx))
    return near ? [{ object: near, distance: 0, point } as Intersection<T>] : []
  }
  return () => {
    raycaster.intersectObjects = exact
  }
}

/** The line (a tube mesh) nearest to `point`, if one is within `reach`. */
export function nearestLine(objects: Object3D[], point: Vector3, reach: number) {
  let best: { object: Object3D; distance: number } | null = null
  const closest = new Vector3()
  for (const object of objects) {
    const line = endsOf((object as Mesh).geometry)
    if (!line) continue
    const distance = line.closestPointToPoint(point, true, closest).distanceTo(point)
    if (distance <= reach && (!best || distance < best.distance)) best = { object, distance }
  }
  return best?.object ?? null
}

// A tube's first and last rings of vertices, averaged: where the line starts and ends.
const ends = new WeakMap<BufferGeometry, Line3 | null>()
const RING = 6 // Reagraph's tubes have 5 radial segments, so 6 vertices per ring

function endsOf(geometry: BufferGeometry | undefined): Line3 | null {
  if (!geometry) return null
  if (!ends.has(geometry)) {
    const position = geometry.getAttribute('position')
    const count = position?.count ?? 0
    const ring = (first: number) => {
      const center = new Vector3()
      for (let i = first; i < first + RING; i++) {
        center.add(new Vector3().fromBufferAttribute(position, i))
      }
      return center.divideScalar(RING)
    }
    ends.set(geometry, count >= 2 * RING ? new Line3(ring(0), ring(count - RING)) : null)
  }
  return ends.get(geometry) ?? null
}

// How much of the flat graph one screen pixel covers (Reagraph's 2D camera looks
// straight down at it).
function worldPerPixel(camera: Camera, heightPx: number) {
  if (!(camera instanceof PerspectiveCamera) || !heightPx) return 1
  const fov = ((camera.fov / camera.zoom) * Math.PI) / 180
  return (2 * Math.tan(fov / 2) * Math.abs(camera.position.z)) / heightPx
}
