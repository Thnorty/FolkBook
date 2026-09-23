import { api, unwrap } from '@/api/client'

/** Where the crop step's frame sits on the (rotated) photo, in the photo's pixels. */
export type CropArea = { x: number; y: number; width: number; height: number }

// Sent a bit larger than the server keeps (800×1000), so its resize has pixels to spare.
const OUTPUT = { width: 960, height: 1200 }

/**
 * The cropped 4:5 photo as a JPEG. Cropping in the browser means any photo the browser
 * can open works (HEIC on iPhones too); the server re-encodes it anyway.
 */
export async function cropToBlob(src: string, area: CropArea, rotation: number): Promise<Blob> {
  const image = new Image()
  image.src = src
  await image.decode()

  // Draw the whole photo rotated, then cut the frame out of that.
  const turned = rotation % 180 !== 0
  const rotated = document.createElement('canvas')
  rotated.width = turned ? image.naturalHeight : image.naturalWidth
  rotated.height = turned ? image.naturalWidth : image.naturalHeight
  const context = rotated.getContext('2d')!
  context.translate(rotated.width / 2, rotated.height / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  const output = document.createElement('canvas')
  output.width = OUTPUT.width
  output.height = OUTPUT.height
  output
    .getContext('2d')!
    .drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, OUTPUT.width, OUTPUT.height)

  return new Promise((resolve, reject) =>
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo."))),
      'image/jpeg',
      0.9,
    ),
  )
}

const personPath = (personId: string) => ({ params: { path: { person_id: personId } } })

export function uploadPhoto(personId: string, photo: Blob) {
  return unwrap(
    api.POST('/api/people/{person_id}/photo', {
      ...personPath(personId),
      // The generated type says string for binary fields; the form really sends the file.
      body: { file: photo as unknown as string },
      bodySerializer: (body) => {
        const form = new FormData()
        form.append('file', body.file as unknown as Blob, 'photo.jpg')
        return form
      },
    }),
  )
}

export function removePhoto(personId: string) {
  return unwrap(api.DELETE('/api/people/{person_id}/photo', personPath(personId)))
}
