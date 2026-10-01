import { useEffect, useMemo, useState } from 'react'
import { nodeFill, type GraphData } from './graphModel'
import type { CanvasColors } from './usePalette'

/*
 * Node faces from the graph kit (screen 3a): the photo, cropped to a circle, or
 * initials on the space's color, with a white rim like a polaroid's edge. Drawn on a
 * 2D canvas and handed to Reagraph as image URLs.
 */

const SIZE = 128
const RIM = 8

type Face = { initials: string; fill: string; photo?: HTMLImageElement }

/** "Emma Yılmaz" → "EY", "Ela" → "E". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0], words.at(-1)!] : words
  return letters.map((word) => word[0].toLocaleUpperCase()).join('')
}

function draw({ initials: text, fill, photo }: Face, colors: CanvasColors): string | undefined {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) return undefined // no canvas (tests): plain colored nodes
  const middle = SIZE / 2

  context.beginPath()
  context.arc(middle, middle, middle, 0, Math.PI * 2)
  context.fillStyle = colors.frame
  context.fill()

  context.save()
  context.beginPath()
  context.arc(middle, middle, middle - RIM, 0, Math.PI * 2)
  context.clip()
  if (photo) {
    context.drawImage(photo, RIM, RIM, SIZE - RIM * 2, SIZE - RIM * 2)
  } else {
    context.fillStyle = fill
    context.fillRect(0, 0, SIZE, SIZE)
    context.fillStyle = colors.onSpace
    context.font = `600 ${SIZE / 3}px "Instrument Sans Variable", system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, middle, middle + 2)
  }
  context.restore()
  return canvas.toDataURL()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

/**
 * A face for each node, by id. Initials come at once; photos replace them as they
 * load (a photo that fails keeps the initials).
 */
export function useNodeFaces(
  nodes: GraphData['nodes'] | undefined,
  colors: CanvasColors,
): Record<string, string> {
  const withInitials = useMemo(() => {
    const drawn: Record<string, string> = {}
    for (const node of nodes ?? []) {
      const url = drawFace(node, colors)
      if (url) drawn[node.id] = url
    }
    return drawn
  }, [nodes, colors])
  const [withPhotos, setWithPhotos] = useState<Record<string, string>>({})

  useEffect(() => {
    let current = true
    for (const node of nodes ?? []) {
      if (!node.photo_url) continue
      loadImage(node.photo_url).then(
        (photo) => {
          const url = drawFace(node, colors, photo)
          if (current && url) setWithPhotos((all) => ({ ...all, [node.id]: url }))
        },
        () => {}, // keep the initials
      )
    }
    return () => {
      current = false
    }
  }, [nodes, colors])

  return useMemo(() => ({ ...withInitials, ...withPhotos }), [withInitials, withPhotos])
}

function drawFace(
  node: GraphData['nodes'][number],
  colors: CanvasColors,
  photo?: HTMLImageElement,
) {
  return draw(
    {
      initials: node.is_me ? 'Me' : initials(node.name),
      fill: nodeFill(node, colors.palette),
      photo,
    },
    colors,
  )
}
