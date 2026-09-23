import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import Cropper from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import type { CropArea } from './photo'

type PhotoCropperProps = {
  src: string
  onDone: (area: CropArea, rotation: number) => void
  onCancel: () => void
}

/** Crop for the polaroid (screen 2c): drag to place, zoom, rotate. Always 4:5. */
export function PhotoCropper({ src, onDone, onCancel }: PhotoCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState<CropArea | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="type-heading">Crop for the polaroid</h3>
        <p className="type-small text-ink-soft">
          Drag to place it. Every photo gets the same 4:5 frame.
        </p>
      </div>
      <div className="relative mx-auto aspect-[4/5] w-full max-w-72 overflow-hidden rounded-card bg-ink">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={4 / 5}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => setArea(pixels)}
          objectFit="cover"
        />
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor="photo-zoom" className="type-label text-ink-faint">
          Zoom
        </label>
        <input
          id="photo-zoom"
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="flex-1 accent-accent"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRotation((turn) => (turn + 90) % 360)}
        >
          <RotateCw aria-hidden />
          Rotate
        </Button>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!area} onClick={() => area && onDone(area, rotation)}>
          Use photo
        </Button>
      </div>
    </div>
  )
}
